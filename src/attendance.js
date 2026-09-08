const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Looks up an active site by its QR token. Returns null if invalid/inactive
// so callers can respond with a clear "bad QR code" error.
async function resolveSite(qr_token) {
  if (!qr_token) return null;
  const result = await pool.query(
    'SELECT * FROM sites WHERE qr_token = $1 AND active = TRUE',
    [qr_token]
  );
  return result.rows[0] || null;
}

// Sign in for today. Requires the token scanned from the site's QR code.
// Fails if already signed in today (prevents the silent double-entries
// the paper form allowed).
router.post('/sign-in', requireAuth, async (req, res) => {
  const employeeId = req.user.id;
  const { qr_token, lat, lng } = req.body;

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  try {
    const existing = await pool.query(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = CURRENT_DATE`,
      [employeeId]
    );
    if (existing.rows[0]?.sign_in_time) {
      return res.status(409).json({ error: 'Already signed in today' });
    }

    let record;
    if (existing.rows[0]) {
      const result = await pool.query(
        `UPDATE attendance_records
         SET sign_in_time = now(), sign_in_lat = $1, sign_in_lng = $2, sign_in_site_id = $3
         WHERE id = $4 RETURNING *`,
        [lat ?? null, lng ?? null, site.id, existing.rows[0].id]
      );
      record = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO attendance_records (employee_id, work_date, sign_in_time, sign_in_lat, sign_in_lng, sign_in_site_id)
         VALUES ($1, CURRENT_DATE, now(), $2, $3, $4) RETURNING *`,
        [employeeId, lat ?? null, lng ?? null, site.id]
      );
      record = result.rows[0];
    }
    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// Sign out for today. Requires the token scanned from the site's QR code.
// Fails if not signed in yet, or already signed out.
router.post('/sign-out', requireAuth, async (req, res) => {
  const employeeId = req.user.id;
  const { qr_token, lat, lng } = req.body;

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  try {
    const existing = await pool.query(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = CURRENT_DATE`,
      [employeeId]
    );
    const record = existing.rows[0];
    if (!record || !record.sign_in_time) {
      return res.status(409).json({ error: 'You have not signed in today' });
    }
    if (record.sign_out_time) {
      return res.status(409).json({ error: 'Already signed out today' });
    }

    const result = await pool.query(
      `UPDATE attendance_records
       SET sign_out_time = now(), sign_out_lat = $1, sign_out_lng = $2, sign_out_site_id = $3
       WHERE id = $4 RETURNING *`,
      [lat ?? null, lng ?? null, site.id, record.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sign-out failed' });
  }
});

// An employee's own history (last 30 days by default).
router.get('/me', requireAuth, async (req, res) => {
  const employeeId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT work_date, sign_in_time, sign_out_time, flagged, flag_reason
       FROM attendance_records
       WHERE employee_id = $1
       ORDER BY work_date DESC
       LIMIT 30`,
      [employeeId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
