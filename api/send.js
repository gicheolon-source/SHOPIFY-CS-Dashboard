const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const gmail = require('../lib/gmail');
const tickets = require('../lib/tickets');
const { connection } = require('../lib/google');

const AFTER = ['진행중', '답변완료', '종결'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// mode: 'send' 답장 발송 · 'draft' Gmail 임시보관함 저장 · 'forward' 고객 메일을 다른 팀 주소로 전달(첨부 포함)
module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method !== 'POST') throw new HttpError(405, 'POST만 지원합니다');
  const { id, text, mode, status, to, note } = await body(req);
  if (!['draft', 'send', 'forward'].includes(mode)) throw new HttpError(400, 'mode는 draft, send, forward 중 하나여야 합니다');
  if (!id) throw new HttpError(400, 'id가 필요합니다');
  if (mode !== 'forward' && !String(text || '').trim()) throw new HttpError(400, '답장 내용이 비어 있습니다');
  if (mode === 'forward' && !EMAIL.test(String(to || '').trim())) throw new HttpError(400, '전달할 이메일 주소가 올바르지 않습니다');
  const [thread, ticket, conn, ours] = await Promise.all([gmail.threadFull(id), tickets.getTicket(id), connection(), tickets.ourEmails()]);
  if (!conn && process.env.DEMO_MODE !== '1') throw new HttpError(409, 'Gmail이 연결되어 있지 않습니다', 'GOOGLE_RECONNECT');
  const from = conn?.email || 'demo@example.com';

  if (mode === 'forward') {
    const target = String(to).trim().toLowerCase();
    const result = await gmail.forward({ thread, ours, from, to: target, note: String(note || '').slice(0, 2000) });
    await tickets.logSent({ id: result.id, threadId: id, by: user.name, at: Date.now(), kind: 'forward', to: target }).catch(() => {});
    const updated = ticket ? await tickets.updateTicket(id, {}, user.name, { history: `메일 전달 → ${target}${result.skipped.length ? ` (첨부 ${result.skipped.length}개 제외)` : ''}` }) : null;
    return send(res, 200, { ...result, ticket: updated });
  }

  const lastCustomer = [...thread.messages].reverse().find((m) => !ours.includes(m.from.email)) || thread.messages[thread.messages.length - 1];
  const last = thread.messages[thread.messages.length - 1];
  const result = await gmail.reply({
    threadId: id,
    mode,
    from,
    to: [lastCustomer.replyTo || lastCustomer.from],
    subject: /^re:/i.test(lastCustomer.subject) ? lastCustomer.subject : `Re: ${lastCustomer.subject}`,
    text: String(text),
    inReplyTo: last.messageId,
    references: last.references,
  });
  if (mode === 'send') await tickets.logSent({ id: result.id, threadId: id, by: user.name, at: Date.now() }).catch(() => {});
  let updated = null;
  if (ticket) {
    const sent = mode === 'send';
    // 보낸 뒤 상태: 답변(템플릿)별로 지정한 값, 없으면 답변완료
    const after = AFTER.includes(status) ? status : '답변완료';
    updated = await tickets.updateTicket(id, sent ? { status: after } : {}, user.name, {
      history: sent ? '답장 발송' : 'Gmail 임시보관함에 초안 저장',
      fields: sent ? { lastFromCustomer: false, lastAt: Date.now(), firstReplyAt: ticket.firstReplyAt || Date.now() } : {},
    });
  }
  return send(res, 200, { ...result, ticket: updated });
});
