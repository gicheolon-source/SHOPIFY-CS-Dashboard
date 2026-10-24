const crypto = require('crypto');
const { handler, send, redirect, query, body, sign, verify, requireUser, HttpError } = require('../lib/http');
const google = require('../lib/google');
const { updateJSON } = require('../lib/store');

module.exports = handler(async (req, res) => {
  const { action, code, state, error } = query(req);
  if (action === 'start') {
    const user = requireUser(req);
    if (!google.configured()) throw new HttpError(500, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수가 없습니다');
    const st = sign({ n: crypto.randomBytes(8).toString('hex'), u: user.name, exp: Date.now() + 10 * 60_000 });
    return redirect(res, google.authUrl(req, st));
  }
  if (action === 'callback') {
    if (error) return redirect(res, `/?google=${encodeURIComponent(error)}`);
    const user = requireUser(req);
    const st = verify(state);
    if (!st || st.u !== user.name) throw new HttpError(400, 'OAuth state가 유효하지 않습니다. 다시 시도해 주세요.');
    try {
      const email = await google.connectWithCode(req, code, user.name);
      // 다른 메일함으로 바꿔 연결하면 이전 메일함 티켓을 비우고 새로 시작
      const mailbox = email.toLowerCase();
      await updateJSON('cs/tickets.json', { tickets: {}, syncedAt: 0 }, (d) => (d.mailbox === mailbox ? d : { tickets: {}, syncedAt: 0, mailbox }));
      return redirect(res, `/?google=connected&email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error('gmail connect failed', err.message);
      return redirect(res, `/?google=error&msg=${encodeURIComponent(err.message.slice(0, 300))}`);
    }
  }
  if (req.method === 'POST') {
    requireUser(req);
    const b = await body(req);
    if (b.action === 'disconnect') {
      await google.disconnect();
      return send(res, 200, { ok: true });
    }
  }
  throw new HttpError(400, '알 수 없는 요청');
});
