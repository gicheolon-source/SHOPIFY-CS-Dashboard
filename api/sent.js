const { handler, send, query, requireUser } = require('../lib/http');
const gmail = require('../lib/gmail');
const tickets = require('../lib/tickets');

// 보낸 메일 히스토리: Gmail 보낸편지함 + 대시보드 발송 기록(누가 보냈는지) + 연결된 문의
module.exports = handler(async (req, res) => {
  requireUser(req);
  const days = Math.min(Math.max(Number(query(req).days) || 30, 1), 90);
  const [messages, { tickets: all }, log] = await Promise.all([gmail.listSent({ days }), tickets.readTickets(), tickets.readSentLog()]);
  const byId = new Map(log.map((e) => [e.id, e]));
  const items = messages.map((m) => {
    const t = all[m.threadId];
    const sent = byId.get(m.id);
    return {
      id: m.id,
      threadId: m.threadId,
      at: m.at,
      to: m.to,
      subject: m.subject,
      snippet: m.snippet,
      by: sent?.by || null,
      ticketId: t ? t.groupId || t.id : null,
    };
  });
  return send(res, 200, { days, items });
});
