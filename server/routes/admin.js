const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);
router.use(express.json());

function serializeLicenseAdmin(license) {
  const product = db.findProductById(license.productId);
  return {
    ...license,
    productName: product ? product.name : '(deleted product)',
  };
}

// ---- Products ----

router.get('/products', (req, res) => {
  res.json({ products: db.listProducts() });
});

router.post('/products', (req, res) => {
  const { name, slug, description, price, fileName, version } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'name_and_slug_required' });
  const product = db.createProduct({ name, slug, description, price, fileName, version });
  res.status(201).json({ product });
});

router.patch('/products/:id', (req, res) => {
  const product = db.updateProduct(parseInt(req.params.id, 10), req.body || {});
  if (!product) return res.status(404).json({ error: 'not_found' });
  res.json({ product });
});

router.delete('/products/:id', (req, res) => {
  const ok = db.deleteProduct(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---- Licenses ----

router.get('/licenses', (req, res) => {
  res.json({ licenses: db.listLicenses().map(serializeLicenseAdmin) });
});

router.post('/licenses', (req, res) => {
  const { productId, discordUserId, keyPrefix } = req.body || {};
  if (!productId || !discordUserId) {
    return res.status(400).json({ error: 'productId_and_discordUserId_required' });
  }
  if (!db.findProductById(productId)) return res.status(400).json({ error: 'unknown_product' });
  const license = db.createLicense({ productId, discordUserId, keyPrefix });
  res.status(201).json({ license });
});

router.patch('/licenses/:id', (req, res) => {
  // Admin can revoke/reactivate, manually clear the IP lock, or edit the server name label.
  const allowed = ({ status, ipLock, serverName }) => ({ status, ipLock, serverName });
  const patch = {};
  const body = req.body || {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.ipLock !== undefined) patch.ipLock = body.ipLock;
  if (body.serverName !== undefined) patch.serverName = body.serverName;

  const license = db.updateLicense(parseInt(req.params.id, 10), patch);
  if (!license) return res.status(404).json({ error: 'not_found' });
  res.json({ license: serializeLicenseAdmin(license) });
});

router.delete('/licenses/:id', (req, res) => {
  const ok = db.deleteLicense(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
