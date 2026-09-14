const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Admin creates a site (e.g. "Main Office", "Warehouse Gate").
// Generates a random token that gets encoded into a QR code and printed/posted there.
// Coordinates + radius are optional — a site without them skips geofencing
// entirely and relies on QR-only verification, same as before this feature.
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, latitude, longitude, radius_meters } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const qr_token = crypto.randomBytes(16).toString('hex');
  try {
    const result = await pool.query(
      `INSERT INTO sites (name, qr_token, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, qr_token, latitude ?? null, longitude ?? null, radius_meters ?? 100]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// List all sites with their tokens and coordinates, for the admin dashboard.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sites ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// Update a site's coordinates/radius (e.g. adding geofencing to a site
// that was originally created QR-only) or its name.
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, latitude, longitude, radius_meters, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE sites SET
         name = COALESCE($1, name),
         latitude = COALESCE($2, latitude),
         longitude = COALESCE($3, longitude),
         radius_meters = COALESCE($4, radius_meters),
         active = COALESCE($5, active)
       WHERE id = $6 RETURNING *`,
      [name ?? null, latitude ?? null, longitude ?? null, radius_meters ?? null, active ?? null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Site not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update site' });
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
