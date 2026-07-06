const { config } = require('../config');

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'not_logged_in' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'not_logged_in' });
  }
  if (!config.adminDiscordIds.includes(req.session.user.discordId)) {
    return res.status(403).json({ error: 'not_admin' });
  }
  next();
}

// Confirms the caller is the bot process itself (shared secret), not a
// logged-in website user. Uses a constant-time comparison so response
// timing can't leak how many characters matched.
function requireBotSecret(req, res, next) {
  const crypto = require('crypto');
  const provided = req.get('X-Bot-Secret') || '';
  const expected = config.botApiSecret || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const valid = expected.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return res.status(401).json({ error: 'bad_bot_secret' });
  next();
}

module.exports = { requireLogin, requireAdmin, requireBotSecret };
