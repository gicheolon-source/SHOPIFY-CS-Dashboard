const { handler, send, query, body, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');
const gmail = require('../lib/gmail');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const { id } = query(req);
    if (!id) throw new HttpError(400, 'id가 필요합니다');
    const [thread, ticket, ourEmails] = await Promise.all([gmail.threadFull(id), tickets.getTicket(id), tickets.ourEmails()]);
    if (ticket?.unread) {
      await Promise.all([
        gmail.markRead(id).catch(() => {}),
        tickets.updateTicket(id, {}, user.name, { fields: { unread: false } }).catch(() => {}),
      ]);
    }
    return send(res, 200, { thread, ticket, ourEmails });
  }
  const { id, ...patch } = await body(req);
  if (!id) throw new HttpError(400, 'id가 필요합니다');
  const ticket = await tickets.updateTicket(id, patch, user.name);
  return send(res, 200, { ticket });
});
