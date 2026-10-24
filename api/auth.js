const crypto = require('crypto');
const { handler, send, query, body, sign, currentUser, isHttps, HttpError } = require('../lib/http');
const google = require('../lib/google');
const shopify = require('../lib/shopify');
const ai = require('../lib/ai');

const members = () => (process.env.TEAM_MEMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);

function passwordOk(input) {
  const expected = process.env.DASH_PASSWORD || (process.env.VERCEL_ENV === 'production' ? '' : 'demo');
  if (!expected) throw new HttpError(500, 'DASH_PASSWORD 환경변수가 설정되지 않았습니다');
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function setSession(req, res, value, maxAge) {
  res.setHeader('Set-Cookie', `cs_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`);
}

module.exports = handler(async (req, res) => {
  if (req.method === 'GET') {
    const user = currentUser(req);
    if (!user) return send(res, 200, { user: null, members: members() });
    const conn = await google.connection();
    return send(res, 200, {
      user: { name: user.name },
      members: members(),
      google: { configured: google.configured(), connected: !!conn && !conn.broken, ...(conn || {}) },
      shopify: { configured: shopify.configured() || process.env.DEMO_MODE === '1' },
      ai: { enabled: ai.enabled(), model: ai.MODEL },
      demo: process.env.DEMO_MODE === '1',
    });
  }
  const { action, name, password } = await body(req);
  if (action === 'logout') {
    setSession(req, res, '', 0);
    return send(res, 200, { ok: true });
  }
  if (action === 'login') {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new HttpError(400, '이름을 입력해 주세요');
    if (members().length && !members().includes(clean)) throw new HttpError(400, '팀원 목록에 없는 이름입니다');
    if (!passwordOk(password)) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, '비밀번호가 맞지 않습니다');
    }
    const maxAge = 30 * 86400;
    setSession(req, res, sign({ name: clean, exp: Date.now() + maxAge * 1000 }), maxAge);
    return send(res, 200, { ok: true });
  }
  throw new HttpError(400, '알 수 없는 요청');
});
