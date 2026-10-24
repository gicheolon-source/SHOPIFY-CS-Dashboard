const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const ai = require('../lib/ai');
const gmail = require('../lib/gmail');
const shopify = require('../lib/shopify');
const tickets = require('../lib/tickets');
const { getSettings } = require('../lib/settings');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method !== 'POST') throw new HttpError(405, 'POST만 지원합니다');
  const { action, id, instruction, template } = await body(req);
  if (action !== 'draft' || !id) throw new HttpError(400, '알 수 없는 요청');
  const [thread, ticket, settings, ourEmails] = await Promise.all([gmail.threadFull(id), tickets.getTicket(id), getSettings(), tickets.ourEmails()]);
  if (!ticket) throw new HttpError(404, '티켓을 찾을 수 없습니다');
  const [shop, related] = await Promise.all([
    shopify.lookup({ email: ticket.customer?.email, orderRefs: ticket.orderRefs || [] }).catch(() => ({ orders: [] })),
    gmail.findRelated(id, { orderRefs: ticket.orderRefs || [], email: ticket.customer?.email }).catch(() => []),
  ]);
  const draft = await ai.draftReply({
    thread,
    ticket,
    orders: shop.orders,
    related,
    settings,
    ourEmails,
    instruction: String(instruction || '').slice(0, 1000),
    template: template ? String(template).slice(0, 6000) : '',
    author: user.name,
  });
  return send(res, 200, draft);
});
