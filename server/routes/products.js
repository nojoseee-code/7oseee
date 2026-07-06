const express = require('express');
const db = require('../db');

const router = express.Router();

// Public: anyone visiting the store can see what's for sale. Deliberately
// strips fileName (internal disk path) since that has no reason to be
// visible before a license exists.
router.get('/', (req, res) => {
  const products = db.listProducts().map(({ id, name, slug, description, price, version }) => ({
    id,
    name,
    slug,
    description,
    price,
    version,
  }));
  res.json({ products });
});

module.exports = router;
