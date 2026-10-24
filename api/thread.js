const { handler, send, query, body, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');
const gmail = require('../lib/gmail');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const { id } = query(req);
    if (!id) throw new HttpError(400, 'id가 필요합니다');
    const [{ thread, ticket }, ourEmails] = await Promise.all([
      // 같은 고객이 따로 보낸 메일(묶인 스레드)까지 합친 대화
      tickets.conversation(id).catch(async (err) => {
        if (err.status !== 404) throw err;
        // Gmail에서 지워졌거나 다른 메일함의 스레드 → 목록에서도 뺀다
        await tickets.removeTicket(id);
        throw new HttpError(404, '이 문의는 Gmail에서 삭제되었거나 다른 메일함의 메일이라 목록에서 뺐습니다.', 'THREAD_GONE');
      }),
      tickets.ourEmails(),
    ]);
    const { tickets: all } = await tickets.readTickets();
    const unreadIds = [id, ...(ticket?.related || [])].filter((x) => all[x]?.unread);
    for (const x of unreadIds) {
      await Promise.all([
        gmail.markRead(x).catch(() => {}),
        tickets.updateTicket(x, {}, user.name, { fields: { unread: false } }).catch(() => {}),
      ]);
    }
    return send(res, 200, { thread, ticket, ourEmails });
  }
  const { id, ...patch } = await body(req);
  if (!id) throw new HttpError(400, 'id가 필요합니다');
  const ticket = await tickets.updateTicket(id, patch, user.name);
  return send(res, 200, { ticket });
});
