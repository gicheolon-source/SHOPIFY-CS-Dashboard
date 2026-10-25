const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
}

async function body(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').startsWith('https');
}

// 세션 쿠키 서명 키. 프로덕션에서는 반드시 DASH_SECRET이 있어야 한다.
function secret() {
  const s = process.env.DASH_SECRET;
  if (s) return s;
  if (process.env.VERCEL_ENV === 'production') throw new HttpError(500, 'DASH_SECRET 환경변수가 설정되지 않았습니다');
  return 'local-dev-secret';
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// 공용 아이디·비밀번호의 지문. 세션에 넣어두고, 아이디·비밀번호를 바꾸면 기존 로그인이 모두 풀린다.
function credVersion() {
  const cred = `${process.env.DASH_USER || ''}\n${process.env.DASH_PASSWORD || ''}`;
  return crypto.createHmac('sha256', secret()).update(cred).digest('base64url').slice(0, 16);
}

function currentUser(req) {
  const session = verify(cookies(req).cs_session);
  return session && session.name && session.v === credVersion() ? session : null;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, '로그인이 필요합니다', 'AUTH');
  return user;
}

// 모든 API 핸들러를 감싸서 에러를 JSON으로 돌려준다.
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (!err.expose) console.error(err);
      if (res.headersSent) return res.end();
      send(res, err.status || 500, { error: err.expose ? err.message : `서버 오류: ${err.message}`, code: err.code });
    }
  };
}

// 동시 실행 개수를 제한한 map
async function pMap(items, fn, limit = 8) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

module.exports = { HttpError, send, redirect, query, body, cookies, origin, isHttps, sign, verify, secret, credVersion, currentUser, requireUser, handler, pMap };
