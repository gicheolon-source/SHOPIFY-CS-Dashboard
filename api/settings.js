const { handler, send, body, requireUser } = require('../lib/http');
const { getSettings, saveSettings } = require('../lib/settings');

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') return send(res, 200, await getSettings());
  return send(res, 200, await saveSettings(await body(req), user.name));
});
