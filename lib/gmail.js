// Gmail 스레드 조회·파싱·답장. DEMO_MODE=1이면 lib/demo.js의 가짜 데이터를 쓴다.
const crypto = require('crypto');
const { gmailFetch } = require('./google');
const { pMap } = require('./http');

const demo = () => process.env.DEMO_MODE === '1' && require('./demo');

function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function decodeWords(value) {
  // =?UTF-8?B?...?= 형태는 Gmail이 이미 풀어주지만 혹시 남아있으면 처리
  return String(value || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (m, charset, enc, text) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'binary');
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return m;
    }
  });
}

function parseAddress(value) {
  const text = decodeWords(value).trim();
  const m = text.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2].split('@')[0], email: m[2].trim().toLowerCase() };
  const email = (text.match(/[^\s<>"]+@[^\s<>"]+/) || [text])[0].toLowerCase();
  return { name: email.split('@')[0], email };
}

function parseAddressList(value) {
  return String(value || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim()).filter(Boolean).map(parseAddress);
}

function decodeData(data, charset) {
  const bytes = Buffer.from(data || '', 'base64url');
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function walkParts(part, acc) {
  const mime = (part.mimeType || '').toLowerCase();
  const charset = (header(part.headers, 'Content-Type').match(/charset="?([^";]+)/i) || [])[1];
  if (part.filename && part.body && (part.body.attachmentId || part.body.size)) {
    acc.attachments.push({ name: part.filename, size: part.body.size || 0, mime, attachmentId: part.body.attachmentId || null });
  } else if (mime === 'text/plain' && part.body?.data) {
    acc.plain.push(decodeData(part.body.data, charset));
  } else if (mime === 'text/html' && part.body?.data) {
    acc.html.push(decodeData(part.body.data, charset));
  }
  for (const child of part.parts || []) walkParts(child, acc);
  return acc;
}

// 본문에서 인용된 이전 메일 부분을 분리
function splitQuoted(text) {
  const markers = [
    /\n\s*On .{5,200}wrote:\s*\n/,
    /\n\s*20\d\d[.\-/년].{0,80}(작성|wrote).{0,10}:\s*\n/,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*-{2,}\s*원본 메일\s*-{2,}/,
    /\n\s*From: .+\n\s*(Sent|Date): /,
    /\n\s*보낸 사람: .+\n/,
  ];
  let cut = -1;
  for (const re of markers) {
    const m = text.match(re);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) {
    const lines = text.split('\n');
    const firstQuote = lines.findIndex((l, i) => l.startsWith('>') && lines.slice(i).every((x) => x.startsWith('>') || !x.trim()));
    if (firstQuote > 0) cut = lines.slice(0, firstQuote).join('\n').length;
  }
  if (cut <= 0) return { main: text.trim(), quoted: '' };
  return { main: text.slice(0, cut).trim(), quoted: text.slice(cut).trim() };
}

function toMeta(msg) {
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id,
    at: Number(msg.internalDate),
    from: parseAddress(header(headers, 'From')),
    to: parseAddressList(header(headers, 'To')),
    replyTo: header(headers, 'Reply-To') ? parseAddress(header(headers, 'Reply-To')) : null,
    subject: decodeWords(header(headers, 'Subject')) || '(제목 없음)',
    labelIds: msg.labelIds || [],
    snippet: decodeWords(msg.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
  };
}

async function listThreadIds(q, max = 60) {
  if (demo()) return demo().listThreadIds();
  const ids = [];
  let pageToken;
  while (ids.length < max) {
    const data = await gmailFetch('/threads', { query: { q, maxResults: Math.min(100, max - ids.length), pageToken } });
    for (const t of data.threads || []) ids.push(t.id);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

async function threadMeta(id) {
  if (demo()) return demo().threadMeta(id);
  const data = await gmailFetch(`/threads/${encodeURIComponent(id)}`, {
    query: { format: 'metadata', metadataHeaders: ['From', 'To', 'Reply-To', 'Subject', 'Date'] },
  });
  return { id: data.id, historyId: data.historyId, messages: (data.messages || []).map(toMeta).sort((a, b) => a.at - b.at) };
}

async function threadMetas(ids) {
  return (await pMap(ids, (id) => threadMeta(id).catch((err) => ({ id, error: err.message })), 10)).filter((t) => !t.error);
}

async function threadFull(id) {
  if (demo()) return demo().threadFull(id);
  const data = await gmailFetch(`/threads/${encodeURIComponent(id)}`, { query: { format: 'full' } });
  const messages = (data.messages || []).map((msg) => {
    const headers = msg.payload?.headers || [];
    const parts = walkParts(msg.payload || {}, { plain: [], html: [], attachments: [] });
    const text = parts.plain.length ? parts.plain.join('\n\n') : htmlToText(parts.html.join('\n'));
    const { main, quoted } = splitQuoted(text.replace(/\r\n/g, '\n'));
    return {
      ...toMeta(msg),
      cc: parseAddressList(header(headers, 'Cc')),
      replyTo: header(headers, 'Reply-To') ? parseAddress(header(headers, 'Reply-To')) : null,
      messageId: header(headers, 'Message-ID') || header(headers, 'Message-Id'),
      references: header(headers, 'References'),
      text: main,
      quoted,
      attachments: parts.attachments,
    };
  });
  return { id: data.id, messages: messages.sort((a, b) => a.at - b.at) };
}

async function markRead(id) {
  if (demo()) return;
  await gmailFetch(`/threads/${encodeURIComponent(id)}/modify`, { method: 'POST', json: { removeLabelIds: ['UNREAD'] } });
}

function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function formatAddress({ name, email }) {
  return name && name !== email ? `${encodeHeader(name.replace(/"/g, ''))} <${email}>` : email;
}

// attachments: [{ name, mime, data: Buffer }] 가 있으면 multipart/mixed로 붙인다
function buildMime({ from, to, cc, subject, text, inReplyTo, references, attachments = [] }) {
  const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ');
  const b64 = (buf) => buf.toString('base64').replace(/.{76}/g, '$&\r\n');
  const head = [
    `From: ${clean(from)}`,
    `To: ${to.map(formatAddress).map(clean).join(', ')}`,
    ...(cc && cc.length ? [`Cc: ${cc.map(formatAddress).map(clean).join(', ')}`] : []),
    `Subject: ${encodeHeader(clean(subject))}`,
    ...(inReplyTo ? [`In-Reply-To: ${clean(inReplyTo)}`, `References: ${clean([references, inReplyTo].filter(Boolean).join(' '))}`] : []),
    'MIME-Version: 1.0',
  ];
  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf8')),
  ];
  let lines;
  if (!attachments.length) {
    lines = [...head, ...textPart];
  } else {
    const boundary = `cs_${crypto.randomBytes(12).toString('hex')}`;
    lines = [
      ...head,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...textPart,
      ...attachments.flatMap((a) => {
        const name = encodeHeader(clean(a.name).replace(/"/g, ''));
        return [
          `--${boundary}`,
          `Content-Type: ${clean(a.mime) || 'application/octet-stream'}; name="${name}"`,
          `Content-Disposition: attachment; filename="${name}"`,
          'Content-Transfer-Encoding: base64',
          '',
          b64(a.data),
        ];
      }),
      `--${boundary}--`,
    ];
  }
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

async function attachment(messageId, attachmentId) {
  if (demo()) return demo().attachment();
  const data = await gmailFetch(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  return Buffer.from(data.data || '', 'base64url');
}

// 고객의 마지막 메일을 다른 팀 주소로 전달 (첨부 포함, 새 메일로 발송)
const FORWARD_ATTACH_LIMIT = 20 * 1024 * 1024;
async function forward({ thread, ours, from, to, note }) {
  const msg = [...thread.messages].reverse().find((m) => !ours.includes(m.from.email)) || thread.messages[thread.messages.length - 1];
  if (demo()) return { id: `demo-fwd-${Date.now()}`, skipped: [] };
  const attachments = [];
  const skipped = [];
  let total = 0;
  for (const a of msg.attachments || []) {
    if (!a.attachmentId || total + a.size > FORWARD_ATTACH_LIMIT) {
      skipped.push(a.name);
      continue;
    }
    const buf = await attachment(msg.id, a.attachmentId);
    total += buf.length;
    attachments.push({ name: a.name, mime: a.mime, data: buf });
  }
  const who = (x) => (x.name && x.name !== x.email ? `${x.name} <${x.email}>` : x.email);
  const text = [
    note ? `${note}\n` : '',
    '---------- Forwarded message ---------',
    `From: ${who(msg.from)}`,
    `Date: ${new Date(msg.at).toUTCString()}`,
    `Subject: ${msg.subject}`,
    `To: ${(msg.to || []).map(who).join(', ')}`,
    '',
    msg.text || msg.snippet || '',
    msg.quoted ? `\n${msg.quoted}` : '',
    skipped.length ? `\n[용량 문제로 첨부하지 못한 파일: ${skipped.join(', ')}]` : '',
  ].join('\n');
  const raw = buildMime({ from, to: [{ email: to }], subject: `Fwd: ${msg.subject.replace(/^fwd:\s*/i, '')}`, text, attachments });
  const sent = await gmailFetch('/messages/send', { method: 'POST', json: { raw } });
  return { id: sent.id, skipped };
}

// mode: 'draft' = Gmail 임시보관함에 저장, 'send' = 바로 발송
async function reply({ threadId, mode, from, to, cc, subject, text, inReplyTo, references }) {
  if (demo()) return demo().reply({ threadId, mode, text });
  const raw = buildMime({ from, to, cc, subject, text, inReplyTo, references });
  if (mode === 'send') {
    const sent = await gmailFetch('/messages/send', { method: 'POST', json: { raw, threadId } });
    return { id: sent.id, mode };
  }
  const draft = await gmailFetch('/drafts', { method: 'POST', json: { message: { raw, threadId } } });
  return { id: draft.id, mode };
}

// 보낸편지함: 최근 days일 동안 우리가 보낸 메일 (대시보드·Gmail 직접 발송 모두)
async function listSent({ days = 30, max = 100 } = {}) {
  if (demo()) return demo().listSent();
  const ids = [];
  let pageToken;
  while (ids.length < max) {
    const data = await gmailFetch('/messages', { query: { q: `in:sent newer_than:${days}d`, maxResults: Math.min(100, max - ids.length), pageToken } });
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  const metas = await pMap(ids, (id) => gmailFetch(`/messages/${encodeURIComponent(id)}`, {
    query: { format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'] },
  }).then((msg) => ({ ...toMeta(msg), threadId: msg.threadId })).catch(() => null), 10);
  return metas.filter(Boolean).sort((a, b) => b.at - a.at);
}

// 같은 주문번호·고객이 나오는 다른 메일(주문 확인·배송 알림 등) — AI 답장 참고용
async function findRelated(excludeIds, { orderRefs = [], email } = {}) {
  if (demo()) return [];
  const quote = (s) => `"${s.replace(/"/g, '')}"`;
  const terms = orderRefs.slice(0, 3).map((r) => quote(r.replace(/^#/, '')));
  if (email) terms.push(quote(email));
  if (!terms.length) return [];
  const ids = (await listThreadIds(`{${terms.join(' ')}} newer_than:180d`, 8)).filter((x) => !excludeIds.includes(x)).slice(0, 4);
  const threads = await pMap(ids, (x) => threadFull(x).catch(() => null), 4);
  return threads.filter(Boolean)
    .flatMap((t) => t.messages.slice(-2))
    .sort((a, b) => b.at - a.at)
    .slice(0, 6)
    .map((m) => ({
      subject: m.subject,
      from: `${m.from.name} <${m.from.email}>`,
      date: new Date(m.at).toISOString().slice(0, 10),
      text: (m.text || m.snippet || '').slice(0, 1500),
    }));
}

module.exports = { attachment, forward, findRelated, listSent, listThreadIds, threadMetas, threadFull, markRead, reply, parseAddress, splitQuoted, htmlToText };
