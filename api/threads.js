const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const { tickets: all, syncedAt, syncedBy } = await tickets.readTickets();
    return send(res, 200, { tickets: Object.values(all), syncedAt, syncedBy });
  }
  const b = await body(req);
  if (b.action === 'sync') return send(res, 200, await tickets.sync(user.name));
  throw new HttpError(400, '알 수 없는 요청');
});
