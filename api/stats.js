const { handler, send, query, requireUser } = require('../lib/http');
const tickets = require('../lib/tickets');

module.exports = handler(async (req, res) => {
  requireUser(req);
  const days = Math.min(Math.max(Number(query(req).days) || 30, 7), 180);
  const { tickets: all } = await tickets.readTickets();
  return send(res, 200, tickets.stats(Object.values(all), days));
});
