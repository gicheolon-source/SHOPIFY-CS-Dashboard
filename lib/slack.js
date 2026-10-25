// 슬랙 알림: Incoming Webhook(SLACK_WEBHOOK_URL)으로 팀 채널에 보낸다. 주소가 없으면 아무것도 안 한다.
const enabled = () => !!process.env.SLACK_WEBHOOK_URL;

function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
}

// 슬랙 mrkdwn에서 링크·서식이 깨지지 않게
const clean = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '‹', '>': '›', '&': '＆' })[c]).replace(/\s+/g, ' ').trim();
const link = (t) => (appUrl() ? `<${appUrl()}/?t=${encodeURIComponent(t.id)}|${clean(t.subject).slice(0, 80) || '(제목 없음)'}>` : clean(t.subject).slice(0, 80));
const line = (t) => `• ${link(t)} — ${clean(t.customer?.name || t.customer?.email)}${t.assignee ? ` · 담당 ${clean(t.assignee)}` : ' · 미배정'}`;

async function post(text) {
  if (!enabled()) return;
  const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, unfurl_links: false }),
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text().catch(() => '')}`);
}

async function syncAlerts({ urgent = [], overdue = [] } = {}) {
  if (!enabled()) return;
  if (urgent.length) {
    await post(`🚨 *긴급 문의 ${urgent.length}건 도착*\n${urgent.slice(0, 10).map((t) => `${line(t)}\n   _${clean(t.summary || t.snippet).slice(0, 120)}_`).join('\n')}`);
  }
  if (overdue.length) {
    await post(`⏰ *24시간 넘게 답장 못 한 문의 ${overdue.length}건*\n${overdue.slice(0, 10).map(line).join('\n')}${overdue.length > 10 ? `\n…외 ${overdue.length - 10}건` : ''}`);
  }
}

async function assigned(t, assignee, by) {
  await post(`👤 *${clean(by)}* 님이 *${clean(assignee)}* 님에게 문의를 배정했어요\n${line(t)}`);
}

// 매일 아침 요약 (Vercel Cron)
async function digest(s, open) {
  const top = open.slice(0, 8).map(line).join('\n');
  await post([
    `☀️ *CS 아침 요약* · ${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}`,
    `처리 필요 *${s.backlog}건* (24시간 초과 ${s.overdue}건) · 고객 회신 대기 ${s.waiting}건 · 어제 접수 ${s.yesterday}건`,
    top ? `\n*오래 기다린 순*\n${top}` : '',
    appUrl() ? `\n<${appUrl()}|대시보드 열기>` : '',
  ].filter(Boolean).join('\n'));
}

module.exports = { enabled, post, syncAlerts, assigned, digest, appUrl };
