const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

const { config, assertConfigured } = require('./config');
const db = require('./db');

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/licenses');
const adminRoutes = require('./routes/admin');
const validateRoutes = require('./routes/validate');
const botRoutes = require('./routes/bot');
const productRoutes = require('./routes/products');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

assertConfigured();
if (!fs.existsSync(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR, { recursive: true });

const app = express();

// If you put nginx/Caddy/Cloudflare in front of this, uncomment so req.ip
// reflects the real visitor instead of the proxy:
// app.set('trust proxy', 1);

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/auth', authRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/validate', validateRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/products', productRoutes);

// Public one-time download link (see db.createDownloadToken). Not under
// /api so it reads as a normal file link when pasted or opened from Discord.
app.get('/dl/:token', (req, res) => {
  const result = db.consumeDownloadToken(req.params.token);
  if (!result.ok) return res.status(410).send('This download link is invalid, expired, or already used.');

  const license = db.findLicenseById(result.licenseId);
  const product = license && db.findProductById(license.productId);
  if (!product || !product.fileName) return res.status(404).send('File not found.');

  const filePath = path.join(RESOURCES_DIR, product.fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`[download] configured fileName does not exist on disk: ${filePath}`);
    return res.status(404).send('File not found on server. Contact the store owner.');
  }
  res.download(filePath, product.fileName);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Small helper so the frontend can render site name / login state without
// a build step.
app.get('/api/config', (req, res) => {
  res.json({ siteName: config.siteName });
});

app.listen(config.port, () => {
  console.log(`[${config.siteName}] listening on http://localhost:${config.port}`);
  console.log(`Resources directory (put your obfuscated .lua deliverables here): ${RESOURCES_DIR}`);
  console.log(`Database file: ${db.DB_PATH}`);
});
