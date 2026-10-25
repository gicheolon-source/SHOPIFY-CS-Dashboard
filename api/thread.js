const { handler, send, query, body, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');
const gmail = require('../lib/gmail');
const slack = require('../lib/slack');

// 첨부파일: 사진만 화면에 바로 띄우고, 나머지는 다운로드로만 내려준다 (HTML 등이 우리 도메인에서 열리지 않게)
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

async function sendAttachment(res, q) {
  const { msg, att, name = 'attachment', mime = '' } = q;
  if (!msg || !att) throw new HttpError(400, 'msg, att가 필요합니다');
  const buf = await gmail.attachment(msg, att);
  if (buf.length > 4_300_000) throw new HttpError(413, '파일이 커서 대시보드에서 열 수 없습니다. Gmail에서 열어 주세요.');
  const inline = INLINE.has(String(mime).toLowerCase());
  const safeName = String(name).replace(/[\r\n"]/g, '').slice(0, 150) || 'attachment';
  res.statusCode = 200;
  res.setHeader('Content-Type', inline ? mime.toLowerCase() : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.end(buf);
}

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const q = query(req);
    if (q.att) return sendAttachment(res, q);
    const { id } = q;
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
  const before = await tickets.getTicket(id);
  const ticket = await tickets.updateTicket(id, patch, user.name);
  // 다른 사람에게 배정하면 슬랙으로 알린다
  if (patch.assignee && patch.assignee !== before?.assignee && patch.assignee !== user.name) {
    await slack.assigned(ticket, patch.assignee, user.name).catch((err) => console.error('slack assign failed', err.message));
  }
  return send(res, 200, { ticket });
});
