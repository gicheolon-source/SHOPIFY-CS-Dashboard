const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const { getSettings, saveSettings } = require('../lib/settings');
const records = require('../lib/records');
const tickets = require('../lib/tickets');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') {
    const [settings, blacklist] = await Promise.all([getSettings(), records.readBlacklist()]);
    return send(res, 200, { ...settings, blacklist });
  }
  const b = await body(req);
  // 블랙리스트(주의 고객) 등록·해제 — 다른 설정과 따로 저장해 동시에 고쳐도 덮어쓰지 않는다
  if (b.action === 'blacklist') {
    const blacklist = await records.setBlacklist(b.email, b.remove ? null : { reason: b.reason, by: user.name })
      .catch((err) => { throw new HttpError(400, err.message); });
    if (b.ticketId) {
      await tickets.updateTicket(String(b.ticketId), {}, user.name, { history: b.remove ? '블랙리스트 해제' : `블랙리스트 등록: ${String(b.reason || '').slice(0, 80)}` }).catch(() => {});
    }
    return send(res, 200, { blacklist });
  }
  const saved = await saveSettings(b, user.name);
  return send(res, 200, { ...saved, blacklist: await records.readBlacklist() });
});
