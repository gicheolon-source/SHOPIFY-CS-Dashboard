// Google OAuth + Gmail REST 호출. refresh token은 암호화해서 Blob에 저장한다(팀 공용 연결).
const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const { HttpError, origin, secret } = require('./http');

const PATH = 'cs/google.json';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify'];

function key() {
  return crypto.createHash('sha256').update(`${secret()}:google-token`).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin(req)}/oauth/google/callback`;
}

function authUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'select_account consent',
    login_hint: process.env.GMAIL_ACCOUNT || 'global_md@drrejuall.com',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new HttpError(res.status === 400 ? 409 : 502, `Google 인증 오류: ${data.error_description || data.error || res.status}`, 'GOOGLE');
    err.googleError = data.error;
    throw err;
  }
  return data;
}

let cached = null; // { token, exp }

async function connectWithCode(req, code, user) {
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(req) });
  if (!tokens.refresh_token) throw new HttpError(400, 'refresh token을 받지 못했습니다. 다시 연결해 주세요.');
  const profile = await gmailFetch('/profile', { accessToken: tokens.access_token });
  await writeJSON(PATH, {
    email: profile.emailAddress.toLowerCase(),
    refresh: encrypt(tokens.refresh_token),
    connectedBy: user,
    connectedAt: Date.now(),
  });
  cached = { token: tokens.access_token, exp: Date.now() + (tokens.expires_in - 120) * 1000 };
  return profile.emailAddress;
}

async function connection() {
  if (process.env.DEMO_MODE === '1') return { email: 'global_md@drrejuall.com', connectedBy: '데모', connectedAt: Date.now() };
  const { data } = await readJSON(PATH, null);
  if (!data || !data.refresh) return null;
  return { email: data.email, connectedBy: data.connectedBy, connectedAt: data.connectedAt, broken: !!data.broken };
}

async function disconnect() {
  cached = null;
  await writeJSON(PATH, {});
}

async function accessToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const { data } = await readJSON(PATH, null);
  if (!data || !data.refresh) throw new HttpError(409, 'Gmail이 연결되어 있지 않습니다', 'GOOGLE_RECONNECT');
  try {
    const tokens = await tokenRequest({ refresh_token: decrypt(data.refresh), grant_type: 'refresh_token' });
    cached = { token: tokens.access_token, exp: Date.now() + (tokens.expires_in - 120) * 1000 };
    return cached.token;
  } catch (err) {
    if (err.googleError === 'invalid_grant') {
      await writeJSON(PATH, { ...data, broken: true });
      throw new HttpError(409, 'Gmail 연결이 만료되었습니다. 설정에서 다시 연결해 주세요.', 'GOOGLE_RECONNECT');
    }
    throw err;
  }
}

async function gmailFetch(path, { method = 'GET', query, json, accessToken: token } = {}) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
    else if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token || (await accessToken())}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) cached = null;
    throw new HttpError(res.status === 404 ? 404 : 502, `Gmail API 오류: ${data.error?.message || res.status}`, 'GMAIL');
  }
  return data;
}

module.exports = { configured, authUrl, connectWithCode, connection, disconnect, gmailFetch };
