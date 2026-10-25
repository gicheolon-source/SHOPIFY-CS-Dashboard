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
  // 여러 건 한꺼번에 상태·담당자 변경
  if (b.action === 'bulk') {
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
    const patch = {};
    for (const k of ['status', 'assignee', 'priority', 'type']) if (k in (b.patch || {})) patch[k] = b.patch[k];
    if (!ids.length || !Object.keys(patch).length) throw new HttpError(400, '바꿀 티켓과 항목을 골라 주세요');
    return send(res, 200, { tickets: await tickets.bulkUpdate(ids, patch, user.name) });
  }
  throw new HttpError(400, '알 수 없는 요청');
});
