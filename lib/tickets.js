// 티켓 = Gmail 스레드 + 팀이 관리하는 상태(담당자/처리상태/분류/메모). Blob 한 파일에 저장.
const { readJSON, updateJSON } = require('./store');
const { listThreadIds, threadMetas, threadFull } = require('./gmail');
const { connection } = require('./google');
const { getSettings } = require('./settings');
const ai = require('./ai');
const slack = require('./slack');
const { HttpError, pMap } = require('./http');

const PATH = 'cs/tickets.json';
// 고객 대기 = 고객 회신을 기다리는 중 (처리 필요에서 빠지고, 회신이 오거나 기한이 지나면 다시 열린다)
const STATUSES = ['미처리', '진행중', '고객 대기', '답변완료', '종결'];
const OPEN = new Set(['미처리', '진행중']);
const KEEP_DAYS = 180;
const MAX_CLASSIFY_PER_SYNC = 40;
const CONTACT_FORM = /^new customer message on /i;
const AMAZON_ORDER = /\b\d{3}-\d{7}-\d{7}\b/;

// Shopify 문의 폼 본문 "Name: … Email: … Phone: … Comment: …" → 필드
// 필드가 줄마다 오든 한 줄에 이어 오든 다음 라벨 앞까지를 값으로 본다
const FORM_LABELS = 'Country Code|Name|Email|Phone Number|Phone|Comment|Body|Message';
function parseContactForm(text) {
  const field = (label, rest = false) => {
    const re = new RegExp(`(?:^|\\s)(?:${label})\\s*:[ \\t]*([\\s\\S]*?)${rest ? '$' : `(?=\\s*\\b(?:${FORM_LABELS})\\s*:|\\n|$)`}`, 'i');
    return (text.match(re) || [])[1]?.trim() || '';
  };
  const form = { name: field('Name'), phone: field('Phone Number|Phone'), country: field('Country Code'), comment: field('Comment|Body|Message', true).slice(0, 3000) };
  return form.name || form.comment ? form : null;
}

async function readTickets() {
  const { data } = await readJSON(PATH, { tickets: {}, syncedAt: 0 });
  return { tickets: data.tickets || {}, syncedAt: data.syncedAt || 0, syncedBy: data.syncedBy };
}

async function ourEmails() {
  const [conn, settings] = await Promise.all([connection(), getSettings()]);
  return [conn?.email, ...(settings.aliases || [])].filter(Boolean).map((e) => e.toLowerCase());
}

// Gmail 스레드 메타데이터 → 티켓용 요약 필드
function summarize(meta, mine) {
  const isMine = (m) => mine.includes(m.from.email);
  const msgs = meta.messages;
  const firstCustomer = msgs.find((m) => !isMine(m));
  if (!firstCustomer) return null; // 우리가 먼저 보낸 메일만 있는 스레드는 제외
  const firstReply = msgs.find((m) => isMine(m) && m.at > firstCustomer.at);
  const last = msgs[msgs.length - 1];
  const lastCustomer = [...msgs].reverse().find((m) => !isMine(m));
  // Shopify 문의 폼 메일은 발신자가 mailer@shopify.com이고 실제 고객은 Reply-To에 있다
  const replyTo = firstCustomer.replyTo;
  const customer = replyTo && !mine.includes(replyTo.email) && replyTo.email !== firstCustomer.from.email ? replyTo : firstCustomer.from;
  return {
    id: meta.id,
    subject: firstCustomer.subject,
    customer,
    firstAt: firstCustomer.at,
    firstReplyAt: firstReply ? firstReply.at : null,
    lastAt: last.at,
    lastCustomerAt: lastCustomer.at,
    lastFromCustomer: !isMine(last),
    messageCount: msgs.length,
    unread: msgs.some((m) => m.labelIds.includes('UNREAD')),
    snippet: lastCustomer.snippet,
  };
}

// 같은 고객이 같은 제목으로 따로 보낸 메일(Gmail에서 별도 스레드)은 하나의 티켓으로 묶는다.
// 가장 최근 스레드가 대표(primary)가 되고 related에 나머지를, 나머지는 groupId에 대표 id를 갖는다.
const GROUP_WINDOW = 14 * 86400_000;
// 자동 발송 주소는 서로 다른 건이 같은 주소로 오므로 묶지 않는다
const SYSTEM_SENDER = /^(no-?reply|do-?not-?reply|mailer|notifications?|alerts?)[@+.-]|@(shopify\.com|accounts\.google\.com)$/i;
function groupKey(t) {
  const subject = (t.subject || '').toLowerCase().replace(/^((re|fwd?|fw|답장|전달)\s*:\s*)+/i, '').trim();
  return `${t.customer?.email}|${t.form || CONTACT_FORM.test(subject) ? 'shopify-contact-form' : subject}`;
}

function groupTickets(tickets) {
  const groups = new Map();
  for (const t of Object.values(tickets)) {
    delete t.groupId;
    delete t.related;
    delete t.groupMessages;
    delete t.groupUnread;
    if (!t.customer?.email || SYSTEM_SENDER.test(t.customer.email)) continue;
    const key = groupKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.lastAt - a.lastAt);
    const primary = list[0];
    const members = list.slice(1).filter((t) => primary.lastAt - t.lastAt <= GROUP_WINDOW);
    if (!members.length) continue;
    primary.related = members.map((t) => t.id);
    for (const t of members) t.groupId = primary.id;
    primary.groupMessages = [primary, ...members].reduce((n, t) => n + (t.messageCount || 0), 0);
    primary.groupUnread = members.some((t) => t.unread);
  }
}

// 묶인 스레드들의 메일을 시간순으로 합쳐 하나의 대화로 돌려준다
async function conversation(id) {
  const ticket = await getTicket(id);
  const [main, ...others] = await Promise.all([
    threadFull(id),
    ...(ticket?.related || []).map((x) => threadFull(x).catch(() => null)),
  ]);
  const seen = new Set();
  const messages = [main, ...others].filter(Boolean).flatMap((t) => t.messages)
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.at - b.at);
  return { thread: { id: main.id, messages }, ticket };
}

// 설정의 자동 종결 목록: 'xxx@'는 아이디 시작, 'domain.com'은 도메인(하위 포함), 전체 주소는 그 주소
function autoSender(patterns = []) {
  const list = patterns.map((p) => p.trim().toLowerCase()).filter(Boolean);
  return (email) => {
    const e = (email || '').toLowerCase();
    const domain = e.split('@')[1] || '';
    return !!e && list.some((p) => (p.endsWith('@') ? e.startsWith(p) : p.includes('@') ? e === p : domain === p || domain.endsWith(`.${p}`)));
  };
}

function pushHistory(t, by, text) {
  t.history = [...(t.history || []), { at: Date.now(), by, text }].slice(-30);
}

async function sync(user) {
  const settings = await getSettings();
  const mine = await ourEmails();
  if (!mine.length && process.env.DEMO_MODE !== '1') throw new HttpError(409, 'Gmail이 연결되어 있지 않습니다', 'GOOGLE_RECONNECT');
  const ids = await listThreadIds(settings.query, 80);
  const metas = await threadMetas(ids);
  const fresh = metas.map((m) => summarize(m, mine)).filter(Boolean);
  const { tickets: current } = await readTickets();

  // Shopify 문의 폼 메일: 본문에서 실제 이름·문의 내용을 꺼낸다 (스레드당 한 번만 본문 조회)
  const newForms = fresh.filter((f) => CONTACT_FORM.test(f.subject) && !current[f.id]?.form);
  const parsed = await pMap(newForms, (f) => threadFull(f.id).then((t) => parseContactForm(t.messages[0]?.text || '')).catch(() => null), 5);
  const formById = new Map(newForms.map((f, i) => [f.id, parsed[i]]));
  for (const f of fresh) {
    const form = formById.get(f.id) || current[f.id]?.form;
    if (!form) continue;
    f.form = form;
    if (form.name) f.customer = { ...f.customer, name: form.name };
    if (form.comment) {
      f.subject = `[문의 폼] ${form.comment.replace(/\s+/g, ' ').slice(0, 80)}`;
      if (f.messageCount === 1) f.snippet = form.comment.replace(/\s+/g, ' ').slice(0, 200);
    }
  }
  // 아마존 주문번호(111-1234567-1234567)가 보이면 표시 — 아마존 주문은 우리가 고객 정보를 볼 수 없다
  for (const f of fresh) {
    const m = `${f.subject} ${f.snippet} ${f.form?.comment || ''}`.match(AMAZON_ORDER);
    f.amazonOrder = m ? m[0] : current[f.id]?.amazonOrder || null;
  }

  // 새로 들어온(분류 안 된) 스레드만 Claude로 분류 — 자동 발송 메일은 분류하지 않고 바로 종결
  const isAuto = autoSender(settings.autoClose);
  const todo = fresh.filter((f) => !current[f.id]?.type && !isAuto(f.customer.email)).slice(0, MAX_CLASSIFY_PER_SYNC);
  const classes = await ai.classify(todo.map((f) => ({ id: f.id, from: `${f.customer.name} <${f.customer.email}>`, subject: f.subject, snippet: f.snippet })));
  const classById = new Map(classes.map((c) => [c.id, c]));

  const mailbox = mine[0];
  let alerts;
  const saved = await updateJSON(PATH, { tickets: {}, syncedAt: 0 }, (data) => {
    alerts = { urgent: [], overdue: [] }; // 저장이 충돌해 다시 시도하면 새로 모은다
    // 연결된 메일함이 바뀌면 이전 메일함의 티켓은 버리고 새로 시작
    // (mailbox 기록이 없는 옛 데이터도 어느 메일함 것인지 모르니 버린다)
    const tickets = data.mailbox !== mailbox ? {} : data.tickets || {};
    for (const f of fresh) {
      const isNew = !tickets[f.id];
      const t = tickets[f.id] || { id: f.id, status: '미처리', statusAt: f.firstAt, assignee: null, note: '', history: [] };
      Object.assign(t, f);
      const c = classById.get(f.id);
      if (c && !t.type) Object.assign(t, { type: c.type, priority: c.priority, summary: c.summary, lang: c.lang, orderRefs: c.orderRefs });
      // 알림·자동 발송 메일은 한 번만 자동 종결 (나중에 팀이 다시 열면 그대로 둔다)
      if (!t.autoChecked) {
        t.autoChecked = true;
        if (isAuto(t.customer?.email) && OPEN.has(t.status)) {
          Object.assign(t, { status: '종결', statusAt: Date.now(), autoClosed: true, type: t.type || '스팸/광고', priority: t.priority || '낮음', summary: t.summary || t.snippet?.slice(0, 90) });
          pushHistory(t, '시스템', '자동 발송·알림 메일 → 자동 종결');
        }
      }
      // 종결/답변완료 후 고객이 다시 메일하면 재오픈 (자동 종결된 알림 메일은 제외)
      if (!OPEN.has(t.status) && !t.autoClosed && f.lastFromCustomer && f.lastCustomerAt > (t.statusAt || 0)) {
        pushHistory(t, '시스템', t.status === '고객 대기' ? '고객 회신 도착 → 다시 열림' : '고객 재문의로 다시 열림');
        t.status = '미처리';
        t.statusAt = Date.now();
        delete t.followup;
      }
      // Gmail에서 직접 답장한 경우 반영
      if (t.status === '미처리' && !f.lastFromCustomer && f.lastAt > (t.statusAt || 0)) {
        t.status = '답변완료';
        t.statusAt = Date.now();
        pushHistory(t, '시스템', 'Gmail에서 답장 확인 → 답변완료');
      }
      if (isNew && t.priority === '긴급' && OPEN.has(t.status)) alerts.urgent.push(t);
      tickets[f.id] = t;
    }
    // 고객 대기: 정해진 날짜 동안 고객 회신이 없으면 팔로업이 필요하다고 다시 처리 목록에 올린다
    const waitMs = (Number(settings.followupDays) || 3) * 86400_000;
    for (const t of Object.values(tickets)) {
      if (t.status === '고객 대기' && Date.now() - (t.statusAt || 0) > waitMs) {
        t.status = '미처리';
        t.statusAt = Date.now();
        t.followup = true;
        pushHistory(t, '시스템', `고객 회신 없이 ${Number(settings.followupDays) || 3}일 → 팔로업 필요`);
      }
    }
    const cutoff = Date.now() - KEEP_DAYS * 86400_000;
    for (const [id, t] of Object.entries(tickets)) if ((t.lastAt || 0) < cutoff) delete tickets[id];
    groupTickets(tickets);
    // 24시간 넘게 답장 못 한 문의 — 고객 메일 하나당 한 번만 알린다 (슬랙 연결돼 있을 때만 표시)
    if (slack.enabled()) {
      for (const t of Object.values(tickets)) {
        if (t.groupId || !OPEN.has(t.status) || !t.lastFromCustomer || t.type === '스팸/광고') continue;
        if (Date.now() - t.lastCustomerAt > 24 * 3600_000 && t.overdueAlertAt !== t.lastCustomerAt) {
          t.overdueAlertAt = t.lastCustomerAt;
          alerts.overdue.push(t);
        }
      }
    }
    return { tickets, mailbox, syncedAt: Date.now(), syncedBy: user };
  });
  await slack.syncAlerts(alerts).catch((err) => console.error('slack alert failed', err.message));
  return { tickets: Object.values(saved.tickets), syncedAt: saved.syncedAt, classified: todo.length };
}

const EDITABLE = {
  status: (v) => STATUSES.includes(v),
  assignee: (v) => v === null || (typeof v === 'string' && v.length <= 40),
  type: (v) => ai.TYPES.includes(v),
  priority: (v) => ai.PRIORITIES.includes(v),
  note: (v) => typeof v === 'string' && v.length <= 5000,
};
const LABEL = { status: '상태', assignee: '담당자', type: '유형', priority: '우선순위' };

async function updateTicket(id, patch, by, extra = {}) {
  let result = null;
  await updateJSON(PATH, { tickets: {}, syncedAt: 0 }, (data) => {
    const t = data.tickets?.[id];
    if (!t) throw new HttpError(404, '티켓을 찾을 수 없습니다. 새로고침해 주세요.');
    result = applyPatch(data, t, patch, by, extra);
    return data;
  });
  return result;
}

// 여러 티켓에 같은 변경(상태·담당자 등)을 한 번에 — 저장도 한 번
async function bulkUpdate(ids, patch, by) {
  let results = [];
  await updateJSON(PATH, { tickets: {}, syncedAt: 0 }, (data) => {
    results = ids.map((id) => data.tickets?.[id]).filter(Boolean).map((t) => applyPatch(data, t, patch, by, {}));
    return data;
  });
  return results;
}

function applyPatch(data, t, patch, by, extra) {
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE[k] || !EDITABLE[k](v) || t[k] === v) continue;
    if (LABEL[k]) pushHistory(t, by, `${LABEL[k]}: ${t[k] || '없음'} → ${v || '없음'}`);
    t[k] = v;
    if (k === 'status') {
      t.statusAt = Date.now();
      delete t.autoClosed; // 팀이 직접 상태를 바꾸면 일반 티켓처럼 다룬다
      delete t.followup;
    }
  }
  if (extra.history) pushHistory(t, by, extra.history);
  if (extra.fields) Object.assign(t, extra.fields);
  t.updatedAt = Date.now();
  t.updatedBy = by;
  // 묶인 스레드도 상태·담당자를 같이 맞춘다 (나중에 묶음이 풀려도 엉뚱한 상태로 보이지 않게)
  for (const rid of t.related || []) {
    const r = data.tickets[rid];
    if (!r) continue;
    for (const k of ['status', 'assignee']) if (k in patch && EDITABLE[k](patch[k])) r[k] = patch[k];
    if ('status' in patch) r.statusAt = t.statusAt;
  }
  return t;
}

// 대시보드에서 보낸 답장 기록 (누가 보냈는지는 Gmail에 남지 않으므로 따로 저장)
const SENT_PATH = 'cs/sent.json';

async function readSentLog() {
  const { data } = await readJSON(SENT_PATH, { items: [] });
  return data.items || [];
}

async function logSent(entry) {
  await updateJSON(SENT_PATH, { items: [] }, (data) => ({ items: [entry, ...(data.items || [])].slice(0, 2000) }));
}

async function removeTicket(id) {
  await updateJSON(PATH, { tickets: {}, syncedAt: 0 }, (data) => {
    if (data.tickets) delete data.tickets[id];
  });
}

async function getTicket(id) {
  const { tickets } = await readTickets();
  return tickets[id] || null;
}

function stats(all, days) {
  const tickets = all.filter((t) => !t.groupId); // 묶인 스레드는 대표 티켓 하나로 센다
  const now = Date.now();
  const since = now - days * 86400_000;
  const inRange = tickets.filter((t) => t.firstAt >= since && t.type !== '스팸/광고');
  const dayKey = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10); // KST 기준 날짜
  const daily = {};
  for (let d = days - 1; d >= 0; d--) daily[dayKey(now - d * 86400_000)] = { received: 0, replied: 0 };
  for (const t of inRange) {
    if (daily[dayKey(t.firstAt)]) daily[dayKey(t.firstAt)].received++;
    if (t.firstReplyAt && daily[dayKey(t.firstReplyAt)]) daily[dayKey(t.firstReplyAt)].replied++;
  }
  const count = (key) => inRange.reduce((acc, t) => ((acc[t[key] || '미분류'] = (acc[t[key] || '미분류'] || 0) + 1), acc), {});
  const responseHours = inRange.filter((t) => t.firstReplyAt).map((t) => (t.firstReplyAt - t.firstAt) / 3600_000).sort((a, b) => a - b);
  const median = responseHours.length ? responseHours[Math.floor(responseHours.length / 2)] : null;
  const avg = responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null;
  const within24 = responseHours.length ? responseHours.filter((h) => h <= 24).length / inRange.length : null;
  const open = tickets.filter((t) => OPEN.has(t.status) && t.type !== '스팸/광고');
  const byAssignee = {};
  for (const t of inRange) {
    const a = t.assignee || '미배정';
    byAssignee[a] = byAssignee[a] || { total: 0, open: 0, done: 0 };
    byAssignee[a].total++;
    if (OPEN.has(t.status)) byAssignee[a].open++;
    else byAssignee[a].done++;
  }
  // 유형별 건수 + 첫 응답까지 평균 시간
  const typeAgg = {};
  for (const t of inRange) {
    const k = t.type || '미분류';
    typeAgg[k] = typeAgg[k] || { count: 0, hours: [] };
    typeAgg[k].count++;
    if (t.firstReplyAt) typeAgg[k].hours.push((t.firstReplyAt - t.firstAt) / 3600_000);
  }
  const byTypeResponse = Object.entries(typeAgg)
    .map(([type, v]) => ({ type, count: v.count, avgHours: v.hours.length ? v.hours.reduce((a, b) => a + b, 0) / v.hours.length : null }))
    .sort((a, b) => b.count - a.count);
  // 기간 안에 2번 이상 문의한 고객 (반복 문의)
  const perCustomer = {};
  for (const t of inRange) {
    const e = t.customer?.email;
    if (!e) continue;
    perCustomer[e] = perCustomer[e] || { email: e, name: t.customer.name, count: 0 };
    perCustomer[e].count++;
  }
  const yesterday = dayKey(now - 86400_000);
  return {
    days,
    received: inRange.length,
    replied: responseHours.length,
    backlog: open.length,
    overdue: open.filter((t) => t.lastFromCustomer && now - t.lastCustomerAt > 24 * 3600_000).length,
    medianResponseHours: median,
    avgResponseHours: avg,
    within24Rate: within24,
    daily: Object.entries(daily).map(([date, v]) => ({ date, ...v })),
    byType: count('type'),
    byStatus: count('status'),
    byAssignee,
    byTypeResponse,
    repeatCustomers: Object.values(perCustomer).filter((c) => c.count > 1).sort((a, b) => b.count - a.count).slice(0, 8),
    waiting: tickets.filter((t) => t.status === '고객 대기').length,
    followups: tickets.filter((t) => t.followup && OPEN.has(t.status)).length,
    autoClosed: tickets.filter((t) => t.autoClosed && t.firstAt >= since).length,
    amazon: inRange.filter((t) => t.amazonOrder).length,
    yesterday: tickets.filter((t) => dayKey(t.firstAt) === yesterday && t.type !== '스팸/광고').length,
  };
}

module.exports = { readTickets, sync, updateTicket, bulkUpdate, removeTicket, getTicket, conversation, groupTickets, autoSender, readSentLog, logSent, ourEmails, stats, STATUSES };
