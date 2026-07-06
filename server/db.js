/**
 * Tiny embedded database.
 *
 * Why not SQLite? better-sqlite3 / sqlite3 need to compile a native addon on
 * install. That works fine on most VPS providers, but it's one more way
 * setup can fail on a machine with no build tools, and it's not needed at
 * the scale a script store operates at (hundreds to low-thousands of
 * licenses). A single JSON file, written atomically and cached in memory,
 * is simpler, has zero native dependencies, and is trivial to back up
 * (it's just a file - copy it).
 *
 * If you outgrow this later, every function below is a natural seam to
 * swap for real SQL calls without touching the routes that use it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function blankDb() {
  return {
    nextId: 1,
    users: [],
    products: [],
    licenses: [],
    downloadTokens: [],
  };
}

let cache = null;
let writeQueue = Promise.resolve();

function ensureLoaded() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    cache = blankDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
  } else {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  }
  return cache;
}

// Writes are queued so two near-simultaneous requests can't interleave and
// corrupt the file; each write also goes to a temp file + rename, which is
// atomic on POSIX filesystems (no half-written db.json if the process dies
// mid-write).
function persist() {
  const snapshot = JSON.stringify(cache, null, 2);
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const tmpPath = DB_PATH + '.tmp';
        fs.writeFile(tmpPath, snapshot, (err) => {
          if (err) return reject(err);
          fs.rename(tmpPath, DB_PATH, (err2) => (err2 ? reject(err2) : resolve()));
        });
      })
  );
  return writeQueue;
}

function nextId() {
  const db = ensureLoaded();
  return db.nextId++;
}

// ---------- Users ----------

function findUserByDiscordId(discordId) {
  return ensureLoaded().users.find((u) => u.discordId === discordId) || null;
}

function upsertUser({ discordId, username, avatar }) {
  const db = ensureLoaded();
  let user = findUserByDiscordId(discordId);
  if (user) {
    user.username = username;
    user.avatar = avatar;
    user.lastLoginAt = new Date().toISOString();
  } else {
    user = {
      id: nextId(),
      discordId,
      username,
      avatar,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    db.users.push(user);
  }
  persist();
  return user;
}

// ---------- Products ----------

function listProducts() {
  return ensureLoaded().products;
}

function findProductById(id) {
  return ensureLoaded().products.find((p) => p.id === id) || null;
}

function createProduct({ name, slug, description, price, fileName, version }) {
  const db = ensureLoaded();
  const product = {
    id: nextId(),
    name,
    slug,
    description: description || '',
    price: price || 0,
    fileName: fileName || null,
    version: version || '1.0.0',
    createdAt: new Date().toISOString(),
  };
  db.products.push(product);
  persist();
  return product;
}

function updateProduct(id, patch) {
  const product = findProductById(id);
  if (!product) return null;
  Object.assign(product, patch);
  persist();
  return product;
}

function deleteProduct(id) {
  const db = ensureLoaded();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== id);
  persist();
  return db.products.length < before;
}

// ---------- Licenses ----------

function listLicenses() {
  return ensureLoaded().licenses;
}

function listLicensesForDiscordUser(discordId) {
  return ensureLoaded().licenses.filter((l) => l.discordUserId === discordId);
}

function findLicenseById(id) {
  return ensureLoaded().licenses.find((l) => l.id === id) || null;
}

function findLicenseByKey(licenseKey) {
  return ensureLoaded().licenses.find((l) => l.licenseKey === licenseKey) || null;
}

function generateLicenseKey(prefix = 'LIC') {
  const block = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${block()}-${block()}-${block()}`;
}

function createLicense({ productId, discordUserId, keyPrefix }) {
  const db = ensureLoaded();
  const license = {
    id: nextId(),
    productId,
    discordUserId,
    licenseKey: generateLicenseKey(keyPrefix),
    ipLock: null,
    serverName: null,
    status: 'active', // active | revoked
    lastIpChangeAt: null,
    lastValidatedAt: null,
    createdAt: new Date().toISOString(),
  };
  db.licenses.push(license);
  persist();
  return license;
}

function updateLicense(id, patch) {
  const license = findLicenseById(id);
  if (!license) return null;
  Object.assign(license, patch);
  persist();
  return license;
}

function deleteLicense(id) {
  const db = ensureLoaded();
  const before = db.licenses.length;
  db.licenses = db.licenses.filter((l) => l.id !== id);
  persist();
  return db.licenses.length < before;
}

// ---------- Download tokens (short-lived, single-use) ----------

function createDownloadToken(licenseId, ttlMs = 10 * 60 * 1000) {
  const db = ensureLoaded();
  const token = crypto.randomBytes(8).toString('base64url'); // ~11 chars, URL-safe
  db.downloadTokens.push({
    token,
    licenseId,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    used: false,
  });
  persist();
  return token;
}

function consumeDownloadToken(token) {
  const db = ensureLoaded();
  const entry = db.downloadTokens.find((t) => t.token === token);
  if (!entry) return { ok: false, reason: 'not_found' };
  if (entry.used) return { ok: false, reason: 'already_used' };
  if (new Date(entry.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  entry.used = true;
  persist();
  return { ok: true, licenseId: entry.licenseId };
}

module.exports = {
  DB_PATH,
  findUserByDiscordId,
  upsertUser,
  listProducts,
  findProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  listLicenses,
  listLicensesForDiscordUser,
  findLicenseById,
  findLicenseByKey,
  createLicense,
  updateLicense,
  deleteLicense,
  createDownloadToken,
  consumeDownloadToken,
};
