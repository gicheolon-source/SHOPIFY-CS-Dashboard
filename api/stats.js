const crypto = require('crypto');
const { handler, send, query, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');
const slack = require('../lib/slack');

// 매일 아침 Vercel Cron이 Authorization: Bearer $CRON_SECRET 으로 부른다 (vercel.json crons)
function isCron(req) {
  const secret = process.env.CRON_SECRET;
  const got = String(req.headers.authorization || '');
  if (!secret || !got) return false;
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = handler(async (req, res) => {
  const q = query(req);
  if (q.digest === '1') {
    if (!isCron(req)) throw new HttpError(401, 'cron only');
    // 아무도 대시보드를 안 열어도 하루 한 번은 동기화(자동 종결·팔로업·알림)가 돌게 한다
    await tickets.sync('자동 동기화').catch((err) => console.error('cron sync failed', err.message));
    const all = Object.values((await tickets.readTickets()).tickets);
    const s = tickets.stats(all, 7);
    const open = all.filter((t) => !t.groupId && ['미처리', '진행중'].includes(t.status) && t.lastFromCustomer && t.type !== '스팸/광고')
      .sort((a, b) => a.lastCustomerAt - b.lastCustomerAt);
    await slack.digest(s, open);
    return send(res, 200, { ok: true, slack: slack.enabled() });
  }
  requireUser(req);
  const days = Math.min(Math.max(Number(q.days) || 30, 7), 180);
  const { tickets: all } = await tickets.readTickets();
  return send(res, 200, tickets.stats(Object.values(all), days));
});
