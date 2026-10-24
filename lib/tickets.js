// 티켓 = Gmail 스레드 + 팀이 관리하는 상태(담당자/처리상태/분류/메모). Blob 한 파일에 저장.
const { readJSON, updateJSON } = require('./store');
const { listThreadIds, threadMetas } = require('./gmail');
const { connection } = require('./google');
const { getSettings } = require('./settings');
const ai = require('./ai');
const { HttpError } = require('./http');

const PATH = 'cs/tickets.json';
const STATUSES = ['미처리', '진행중', '답변완료', '종결'];
const OPEN = new Set(['미처리', '진행중']);
const KEEP_DAYS = 180;
const MAX_CLASSIFY_PER_SYNC = 40;

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
  return {
    id: meta.id,
    subject: firstCustomer.subject,
    customer: firstCustomer.from,
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

  // 새로 들어온(분류 안 된) 스레드만 Claude로 분류
  const { tickets: current } = await readTickets();
  const todo = fresh.filter((f) => !current[f.id]?.type).slice(0, MAX_CLASSIFY_PER_SYNC);
  const classes = await ai.classify(todo.map((f) => ({ id: f.id, from: `${f.customer.name} <${f.customer.email}>`, subject: f.subject, snippet: f.snippet })));
  const classById = new Map(classes.map((c) => [c.id, c]));

  const mailbox = mine[0];
  const saved = await updateJSON(PATH, { tickets: {}, syncedAt: 0 }, (data) => {
    // 연결된 메일함이 바뀌면 이전 메일함의 티켓은 버리고 새로 시작
    // (mailbox 기록이 없는 옛 데이터도 어느 메일함 것인지 모르니 버린다)
    const tickets = data.mailbox !== mailbox ? {} : data.tickets || {};
    for (const f of fresh) {
      const t = tickets[f.id] || { id: f.id, status: '미처리', statusAt: f.firstAt, assignee: null, note: '', history: [] };
      Object.assign(t, f);
      const c = classById.get(f.id);
      if (c && !t.type) Object.assign(t, { type: c.type, priority: c.priority, summary: c.summary, lang: c.lang, orderRefs: c.orderRefs });
      // 종결/답변완료 후 고객이 다시 메일하면 재오픈
      if (!OPEN.has(t.status) && f.lastFromCustomer && f.lastCustomerAt > (t.statusAt || 0)) {
        t.status = '미처리';
        t.statusAt = Date.now();
        pushHistory(t, '시스템', '고객 재문의로 다시 열림');
      }
      // Gmail에서 직접 답장한 경우 반영
      if (t.status === '미처리' && !f.lastFromCustomer && f.lastAt > (t.statusAt || 0)) {
        t.status = '답변완료';
        t.statusAt = Date.now();
        pushHistory(t, '시스템', 'Gmail에서 답장 확인 → 답변완료');
      }
      tickets[f.id] = t;
    }
    const cutoff = Date.now() - KEEP_DAYS * 86400_000;
    for (const [id, t] of Object.entries(tickets)) if ((t.lastAt || 0) < cutoff) delete tickets[id];
    return { tickets, mailbox, syncedAt: Date.now(), syncedBy: user };
  });
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
    for (const [k, v] of Object.entries(patch)) {
      if (!EDITABLE[k] || !EDITABLE[k](v) || t[k] === v) continue;
      if (LABEL[k]) pushHistory(t, by, `${LABEL[k]}: ${t[k] || '없음'} → ${v || '없음'}`);
      t[k] = v;
      if (k === 'status') t.statusAt = Date.now();
    }
    if (extra.history) pushHistory(t, by, extra.history);
    if (extra.fields) Object.assign(t, extra.fields);
    t.updatedAt = Date.now();
    t.updatedBy = by;
    result = t;
    return data;
  });
  return result;
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

function stats(tickets, days) {
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
  };
}

module.exports = { readTickets, sync, updateTicket, removeTicket, getTicket, ourEmails, stats, STATUSES };
