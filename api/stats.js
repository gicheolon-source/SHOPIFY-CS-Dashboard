const crypto = require('crypto');
const { handler, send, query, requireUser, HttpError } = require('../lib/http');
const tickets = require('../lib/tickets');
const slack = require('../lib/slack');
const ai = require('../lib/ai');
const { readJSON, writeJSON } = require('../lib/store');
const records = require('../lib/records');
const amazon = require('../lib/amazon');

const ANALYSIS_PATH = 'cs/analysis.json';

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
    // 아마존 MCF 재발송 목록도 아침에 미리 갱신 (낮에 처음 여는 사람이 기다리지 않게)
    await amazon.refreshIndex().catch((err) => console.error('mcf index refresh failed', err.message));
    return send(res, 200, { ok: true, slack: slack.enabled() });
  }
  const user = requireUser(req);
  // 문제 주제 분석: GET은 마지막 결과, POST는 새로 분석 (AI 호출 1번, 결과는 팀 공유)
  if (q.analysis === '1') {
    if (req.method !== 'POST') return send(res, 200, (await readJSON(ANALYSIS_PATH, null)).data);
    const days = Math.min(Math.max(Number(q.days) || 30, 7), 180);
    const since = Date.now() - days * 86400_000;
    const { tickets: all } = await tickets.readTickets();
    const rows = Object.values(all)
      .filter((t) => !t.groupId && !t.autoClosed && t.type !== '스팸/광고' && t.firstAt >= since)
      .sort((a, b) => b.firstAt - a.firstAt)
      .slice(0, 120) // 서버 시간 제한(60초) 안에 끝나도록 최근 120건까지
      .map((t) => ({
        id: t.id, type: t.type, priority: t.priority, date: new Date(t.firstAt + 9 * 3600_000).toISOString().slice(0, 10),
        summary: t.summary || '', subject: t.subject, snippet: (t.snippet || '').slice(0, 200), channel: t.form ? 'form' : 'email', product: t.product || '',
      }));
    if (rows.length < 5) throw new HttpError(400, `분석할 문의가 너무 적습니다 (${rows.length}건)`);
    const out = await ai.analyzeIssues(rows);
    const result = { ...out, days, count: rows.length, from: rows.at(-1).date, to: rows[0].date, at: Date.now(), by: user.name };
    await writeJSON(ANALYSIS_PATH, result);
    return send(res, 200, result);
  }
  const days = Math.min(Math.max(Number(q.days) || 30, 7), 180);
  const { tickets: all } = await tickets.readTickets();
  const costs = await records.costSummary(days).catch(() => null);
  return send(res, 200, { ...tickets.stats(Object.values(all), days), costs });
});
