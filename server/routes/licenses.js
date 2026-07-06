const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { sanitizeServerName } = require('../utils/sanitize');

const router = express.Router();

const IP_RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 change per day, matches the bot's old behaviour
const RESOURCES_DIR = path.join(__dirname, '..', '..', 'resources'); // where obfuscated .lua deliverables live

function serializeLicense(license) {
  const product = db.findProductById(license.productId);
  return {
    id: license.id,
    productId: license.productId,
    productName: product ? product.name : '(deleted product)',
    licenseKey: license.licenseKey,
    ipLock: license.ipLock,
    serverName: license.serverName,
    status: license.status,
    lastValidatedAt: license.lastValidatedAt,
    createdAt: license.createdAt,
  };
}

function ownsLicense(req, license) {
  return license && license.discordUserId === req.session.user.discordId;
}

router.get('/', requireLogin, (req, res) => {
  const mine = db.listLicensesForDiscordUser(req.session.user.discordId).map(serializeLicense);
  res.json({ licenses: mine });
});

router.post('/:id/reset-ip', requireLogin, (req, res) => {
  const license = db.findLicenseById(parseInt(req.params.id, 10));
  if (!ownsLicense(req, license)) return res.status(404).json({ error: 'not_found' });

  if (license.lastIpChangeAt) {
    const elapsed = Date.now() - new Date(license.lastIpChangeAt).getTime();
    if (elapsed < IP_RESET_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((IP_RESET_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
      return res.status(429).json({ error: 'cooldown', hoursLeft });
    }
  }

  db.updateLicense(license.id, { ipLock: null, lastIpChangeAt: new Date().toISOString() });
  res.json({
    ok: true,
    message: 'IP cleared. The lock will be set again automatically the next time this script starts on your server.',
  });
});

router.post('/:id/server-name', requireLogin, (req, res) => {
  const license = db.findLicenseById(parseInt(req.params.id, 10));
  if (!ownsLicense(req, license)) return res.status(404).json({ error: 'not_found' });

  const clean = sanitizeServerName(req.body && req.body.serverName);
  if (!clean.ok) return res.status(400).json({ error: clean.reason });

  db.updateLicense(license.id, { serverName: clean.value });
  res.json({ ok: true, serverName: clean.value });
});

// Issues a short-lived, single-use download link instead of exposing a
// permanent /download/<file> URL that could be pasted around and reused
// after the license is revoked.
router.get('/:id/download', requireLogin, (req, res) => {
  const license = db.findLicenseById(parseInt(req.params.id, 10));
  if (!ownsLicense(req, license)) return res.status(404).json({ error: 'not_found' });
  if (license.status !== 'active') return res.status(403).json({ error: 'license_not_active' });

  const product = db.findProductById(license.productId);
  if (!product || !product.fileName) return res.status(404).json({ error: 'no_file_for_product' });

  const token = db.createDownloadToken(license.id);
  res.json({ url: `/dl/${token}` });
});

module.exports = router;
module.exports.RESOURCES_DIR = RESOURCES_DIR;
