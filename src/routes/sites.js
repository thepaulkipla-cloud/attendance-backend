const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Admin creates a site (e.g. "Main Office", "Warehouse Gate").
// Generates a random token that gets encoded into a QR code and printed/posted there.
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const qr_token = crypto.randomBytes(16).toString('hex');
  try {
    const result = await pool.query(
      `INSERT INTO sites (name, qr_token) VALUES ($1, $2) RETURNING *`,
      [name, qr_token]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// List all sites with their tokens, so the admin can print/regenerate QR posters.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sites ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// Regenerate a site's token, e.g. if the printed poster is compromised
// (photographed and shared outside the workplace).
router.post('/:id/regenerate', requireAuth, requireAdmin, async (req, res) => {
  const qr_token = crypto.randomBytes(16).toString('hex');
  try {
    const result = await pool.query(
      `UPDATE sites SET qr_token = $1 WHERE id = $2 RETURNING *`,
      [qr_token, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Site not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
});

module.exports = router;
