const { handler, send, query, requireUser } = require('../lib/http');
const shopify = require('../lib/shopify');
const tickets = require('../lib/tickets');

module.exports = handler(async (req, res) => {
  requireUser(req);
  const { id, email } = query(req);
  const ticket = id ? await tickets.getTicket(id) : null;
  const result = await shopify.lookup({ email: email || ticket?.customer?.email, orderRefs: ticket?.orderRefs || [] });
  return send(res, 200, result);
});
