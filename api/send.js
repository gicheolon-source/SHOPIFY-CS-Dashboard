const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const gmail = require('../lib/gmail');
const tickets = require('../lib/tickets');
const { connection } = require('../lib/google');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method !== 'POST') throw new HttpError(405, 'POST만 지원합니다');
  const { id, text, mode } = await body(req);
  if (!id || !String(text || '').trim()) throw new HttpError(400, '답장 내용이 비어 있습니다');
  if (!['draft', 'send'].includes(mode)) throw new HttpError(400, 'mode는 draft 또는 send여야 합니다');
  const [thread, ticket, conn, ours] = await Promise.all([gmail.threadFull(id), tickets.getTicket(id), connection(), tickets.ourEmails()]);
  if (!conn && process.env.DEMO_MODE !== '1') throw new HttpError(409, 'Gmail이 연결되어 있지 않습니다', 'GOOGLE_RECONNECT');
  const lastCustomer = [...thread.messages].reverse().find((m) => !ours.includes(m.from.email)) || thread.messages[thread.messages.length - 1];
  const last = thread.messages[thread.messages.length - 1];
  const result = await gmail.reply({
    threadId: id,
    mode,
    from: conn?.email || 'demo@example.com',
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
    updated = await tickets.updateTicket(id, sent && ticket.status !== '종결' ? { status: '답변완료' } : {}, user.name, {
      history: sent ? '답장 발송' : 'Gmail 임시보관함에 초안 저장',
      fields: sent ? { lastFromCustomer: false, lastAt: Date.now(), firstReplyAt: ticket.firstReplyAt || Date.now() } : {},
    });
  }
  return send(res, 200, { ...result, ticket: updated });
});
