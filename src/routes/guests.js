const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { distanceMeters } = require('../geo');

const router = express.Router();

async function resolveSite(qr_token) {
  if (!qr_token) return null;
  const result = await pool.query(
    'SELECT * FROM sites WHERE qr_token = $1 AND active = TRUE',
    [qr_token]
  );
  return result.rows[0] || null;
}

function checkGeofence(site, lat, lng) {
  if (site.latitude == null || site.longitude == null) return { ok: true };
  if (lat == null || lng == null) {
    return { ok: false, error: `Location is required to sign in at ${site.name}. Please enable location and try again.` };
  }
  const distance = distanceMeters(site.latitude, site.longitude, lat, lng);
  if (distance > site.radius_meters) {
    return { ok: false, error: `You appear to be ${Math.round(distance)}m from ${site.name}, outside the allowed ${site.radius_meters}m radius.` };
  }
  return { ok: true };
}

// Same plausibility rule as employee sign-in/out — see attendance.js.
function resolveTimestamp(occurred_at) {
  if (!occurred_at) return { iso: new Date().toISOString(), valid: true };
  const parsed = new Date(occurred_at);
  if (isNaN(parsed.getTime())) return { valid: false };

  const now = Date.now();
  const fiveMinFuture = now + 5 * 60 * 1000;
  const thirtyDaysPast = now - 30 * 24 * 60 * 60 * 1000;
  if (parsed.getTime() > fiveMinFuture || parsed.getTime() < thirtyDaysPast) {
    return { valid: false };
  }
  return { iso: parsed.toISOString(), valid: true };
}

// Any logged-in employee can register a guest — this mirrors the paper
// register, where any staff member could fill in the Guest/Visitor rows.
// `occurred_at` (optional) lets an offline-queued entry keep its real
// scan time instead of the sync time. `lat`/`lng` (optional) are checked
// against the site's geofence, if one is set.
router.post('/sign-in', requireAuth, async (req, res) => {
  const { guest_name, qr_token, occurred_at, lat, lng } = req.body;
  if (!guest_name) return res.status(400).json({ error: 'guest_name is required' });

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  const geofence = checkGeofence(site, lat, lng);
  if (!geofence.ok) return res.status(403).json({ error: geofence.error });

  const ts = resolveTimestamp(occurred_at);
  if (!ts.valid) return res.status(400).json({ error: 'occurred_at is not a plausible timestamp' });
  const workDate = ts.iso.slice(0, 10);

  try {
    const open = await pool.query(
      `SELECT id FROM guest_records
       WHERE guest_name = $1 AND work_date = $2 AND sign_out_time IS NULL`,
      [guest_name, workDate]
    );
    if (open.rows[0]) {
      return res.status(409).json({ error: `${guest_name} is already signed in for that day` });
    }

    const result = await pool.query(
      `INSERT INTO guest_records (guest_name, work_date, sign_in_time, hosted_by, sign_in_site_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [guest_name, workDate, ts.iso, req.user.id, site.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Guest sign-in failed' });
  }
});

// Signs out the guest's most recent still-open visit for that work date.
router.post('/sign-out', requireAuth, async (req, res) => {
  const { guest_name, qr_token, occurred_at, lat, lng } = req.body;
  if (!guest_name) return res.status(400).json({ error: 'guest_name is required' });

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  const geofence = checkGeofence(site, lat, lng);
  if (!geofence.ok) return res.status(403).json({ error: geofence.error });

  const ts = resolveTimestamp(occurred_at);
  if (!ts.valid) return res.status(400).json({ error: 'occurred_at is not a plausible timestamp' });
  const workDate = ts.iso.slice(0, 10);

  try {
    const open = await pool.query(
      `SELECT * FROM guest_records
       WHERE guest_name = $1 AND work_date = $2 AND sign_out_time IS NULL
       ORDER BY sign_in_time DESC LIMIT 1`,
      [guest_name, workDate]
    );
    const record = open.rows[0];
    if (!record) {
      return res.status(409).json({ error: `No open visit found for ${guest_name} on that day` });
    }

    const result = await pool.query(
      `UPDATE guest_records SET sign_out_time = $1, sign_out_site_id = $2 WHERE id = $3 RETURNING *`,
      [ts.iso, site.id, record.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Guest sign-out failed' });
  }
});

module.exports = router;
