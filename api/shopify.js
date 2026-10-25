const { handler, send, query, body, requireUser, HttpError } = require('../lib/http');
const shopify = require('../lib/shopify');
const tickets = require('../lib/tickets');
const records = require('../lib/records');
const amazon = require('../lib/amazon');

const ORDER_ID = /^gid:\/\/shopify\/Order\/\d+$/;

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const { id, email, mcf } = query(req);
    const ticket = id ? await tickets.getTicket(id) : null;
    const result = await shopify.lookup({ email: email || ticket?.customer?.email, orderRefs: ticket?.orderRefs || [] });
    // 아마존 MCF 배송 (읽기 전용): 주문 카드와 따로 불러 화면이 느려지지 않게
    if (mcf === '1') {
      if (!ticket) throw new HttpError(404, '티켓을 찾을 수 없습니다');
      return send(res, 200, await amazon.lookup(amazon.queryFor(ticket, result)));
    }
    // 문의에 걸린 주문의 상품을 티켓에 남겨 둔다 (제품별 문제 통계용) — 바뀌었을 때만 저장
    if (ticket && result.orders?.length) {
      const items = orderItemsFor(ticket, result.orders);
      if (items.join('|') !== (ticket.orderItems || []).join('|')) {
        await tickets.updateTicket(id, {}, user.name, { fields: { orderItems: items } }).catch(() => {});
      }
    }
    if (ticket) await tickets.saveCustomerStats(ticket, result.customer).catch(() => {});
    return send(res, 200, result);
  }

  // 주문 처리: cancel · address · refund · note · cost(비용 기록만, Shopify 변경 없음)
  const b = await body(req);
  if (b.action === 'cost') {
    const entry = await records.addCost({
      kind: b.kind, amount: b.amount, currency: b.currency, order: b.orderName, ticketId: b.ticketId,
      products: b.products, by: user.name, note: b.note,
    }).catch((err) => { throw new HttpError(400, err.message); });
    const ticket = b.ticketId
      ? await tickets.updateTicket(String(b.ticketId), {}, user.name, { history: `비용 기록: ${records.COST_KINDS[entry.kind]} ${entry.amount} ${entry.currency}${entry.order ? ` (${entry.order})` : ''}` }).catch(() => null)
      : null;
    return send(res, 200, { ok: true, entry, ticket });
  }
  if (!shopify.configured() && process.env.DEMO_MODE !== '1') throw new HttpError(409, 'Shopify가 연결되어 있지 않습니다');
  if (!ORDER_ID.test(String(b.orderId || ''))) throw new HttpError(400, '주문 ID가 올바르지 않습니다');
  const label = String(b.orderName || '').slice(0, 30) || '주문';
  const stamp = `${user.name} · ${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')} KST`;
  let result;
  let history;
  if (b.action === 'cancel') {
    result = await shopify.cancelOrder(b.orderId, {
      reason: b.reason, refund: b.refund !== false, restock: b.restock !== false, notify: !!b.notify,
      staffNote: `CS 대시보드 취소 (${stamp})${b.note ? `: ${b.note}` : ''}`,
    });
    history = `Shopify ${label} 취소${b.refund !== false ? ' + 전액 환불' : ''}${b.restock !== false ? ' + 재고 복원' : ''}`;
  } else if (b.action === 'address') {
    result = await shopify.updateAddress(b.orderId, b.address);
    await shopify.addNote(b.orderId, `[CS ${stamp}] 배송지 변경`).catch(() => {});
    history = `Shopify ${label} 배송지 변경 → ${[b.address?.address1, b.address?.city, b.address?.countryCode].filter(Boolean).join(', ')}`;
  } else if (b.action === 'refund') {
    result = await shopify.refundOrder(b.orderId, {
      full: b.full !== false, amount: b.amount, notify: !!b.notify, key: b.key,
      note: `CS 대시보드 환불 (${stamp})${b.note ? `: ${b.note}` : ''}`.slice(0, 500),
    });
    history = `Shopify ${label} 환불 ${result.amount || (b.full !== false ? '(전액)' : b.amount)}`;
  } else if (b.action === 'note') {
    result = await shopify.addNote(b.orderId, `[CS ${stamp}] ${String(b.note || '').trim()}`);
    history = `Shopify ${label} 메모: ${String(b.note || '').slice(0, 80)}`;
  } else {
    throw new HttpError(400, '알 수 없는 주문 처리입니다');
  }
  // 대시보드에서 한 환불·취소 환불은 CS 비용으로 자동 기록
  const cost = b.action === 'refund'
    ? { kind: 'refund', amount: result.amount && result.amount !== 'full' ? result.amount : b.full !== false ? b.orderTotal : b.amount }
    : b.action === 'cancel' && b.refund !== false ? { kind: 'cancel', amount: b.orderTotal } : null;
  if (cost && records.toAmount(cost.amount) > 0) {
    await records.addCost({
      ...cost, currency: String(result.amount || b.orderTotal || '').match(/[A-Z]{3}/)?.[0] || b.currency || 'USD',
      order: label, ticketId: b.ticketId, products: b.products, by: user.name, note: '대시보드에서 처리',
    }).catch((err) => console.error('cost log failed', err.message));
  }
  const ticket = b.ticketId ? await tickets.updateTicket(String(b.ticketId), {}, user.name, { history }).catch(() => null) : null;
  return send(res, 200, { ...result, ticket });
});

// 문의 속 주문번호와 맞는 주문의 상품, 없으면 가장 최근 주문의 상품
function orderItemsFor(ticket, orders) {
  const digits = (ticket.orderRefs || []).map((r) => (String(r).match(/\d{4,9}/) || [])[0]).filter(Boolean);
  const matched = orders.filter((o) => digits.some((d) => o.name.includes(d)));
  const pick = matched.length ? matched : orders.slice(0, 1);
  return [...new Set(pick.flatMap((o) => o.items.map((i) => i.title)))].slice(0, 10);
}
