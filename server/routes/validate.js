const express = require('express');
const db = require('../db');

const router = express.Router();

function callerIp(req) {
  // If you put this behind a reverse proxy (nginx, Caddy, Cloudflare) make
  // sure `app.set('trust proxy', ...)` in index.js matches your setup,
  // otherwise every server will appear to validate from the proxy's IP.
  return req.ip;
}

/**
 * POST /api/validate  { licenseKey }
 *
 * Called by the Lua resource itself (via PerformHttpRequest) every time it
 * starts. This - not the obfuscation - is what actually stops a leaked copy
 * of a script from running on somebody else's server: even a perfectly
 * readable script is useless without a license key tied to the caller's IP.
 */
router.post('/', express.json(), (req, res) => {
  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string') {
    return res.status(400).json({ valid: false, reason: 'missing_license_key' });
  }

  const license = db.findLicenseByKey(licenseKey.trim());
  if (!license) return res.status(403).json({ valid: false, reason: 'unknown_key' });
  if (license.status !== 'active') return res.status(403).json({ valid: false, reason: 'revoked' });

  const ip = callerIp(req);

  if (!license.ipLock) {
    // First time this key has ever been used - lock it to whichever server
    // asks first.
    db.updateLicense(license.id, { ipLock: ip, lastValidatedAt: new Date().toISOString() });
    return res.json({ valid: true, firstActivation: true });
  }

  if (license.ipLock !== ip) {
    return res.status(403).json({ valid: false, reason: 'ip_mismatch' });
  }

  db.updateLicense(license.id, { lastValidatedAt: new Date().toISOString() });
  return res.json({ valid: true });
});

module.exports = router;
