const express = require('express');
const db = require('../db');
const { requireBotSecret } = require('../middleware/auth');
const { sanitizeServerName } = require('../utils/sanitize');

const router = express.Router();
router.use(requireBotSecret);
router.use(express.json());

const IP_RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function serialize(license) {
  const product = db.findProductById(license.productId);
  return {
    id: license.id,
    productName: product ? product.name : '(deleted product)',
    licenseKey: license.licenseKey,
    ipLock: license.ipLock,
    serverName: license.serverName,
    status: license.status,
  };
}

function findOwned(discordId, licenseId) {
  const license = db.findLicenseById(licenseId);
  if (!license || license.discordUserId !== discordId) return null;
  return license;
}

// GET /api/bot/licenses?discordId=123
router.get('/licenses', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).json({ error: 'discordId_required' });
  const licenses = db.listLicensesForDiscordUser(String(discordId)).map(serialize);
  res.json({ licenses });
});

// POST /api/bot/licenses/:id/reset-ip  { discordId }
router.post('/licenses/:id/reset-ip', (req, res) => {
  const license = findOwned(req.body.discordId, parseInt(req.params.id, 10));
  if (!license) return res.status(404).json({ error: 'not_found' });

  if (license.lastIpChangeAt) {
    const elapsed = Date.now() - new Date(license.lastIpChangeAt).getTime();
    if (elapsed < IP_RESET_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((IP_RESET_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
      return res.status(429).json({ error: 'cooldown', hoursLeft });
    }
  }
  db.updateLicense(license.id, { ipLock: null, lastIpChangeAt: new Date().toISOString() });
  res.json({ ok: true });
});

// POST /api/bot/licenses/:id/server-name  { discordId, serverName }
router.post('/licenses/:id/server-name', (req, res) => {
  const license = findOwned(req.body.discordId, parseInt(req.params.id, 10));
  if (!license) return res.status(404).json({ error: 'not_found' });

  const clean = sanitizeServerName(req.body.serverName);
  if (!clean.ok) return res.status(400).json({ error: clean.reason });

  db.updateLicense(license.id, { serverName: clean.value });
  res.json({ ok: true, serverName: clean.value });
});

// POST /api/bot/licenses/:id/download  { discordId }
router.post('/licenses/:id/download', (req, res) => {
  const license = findOwned(req.body.discordId, parseInt(req.params.id, 10));
  if (!license) return res.status(404).json({ error: 'not_found' });
  if (license.status !== 'active') return res.status(403).json({ error: 'license_not_active' });

  const product = db.findProductById(license.productId);
  if (!product || !product.fileName) return res.status(404).json({ error: 'no_file_for_product' });

  const token = db.createDownloadToken(license.id);
  const { config } = require('../config');
  res.json({ url: `${config.publicUrl}/dl/${token}` });
});

module.exports = router;
