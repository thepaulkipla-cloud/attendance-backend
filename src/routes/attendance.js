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

// Resolves the timestamp to actually record. When the app queued this
// action offline and is syncing later, `occurred_at` carries the real
// moment the scan happened on the phone — using that instead of the
// server's current time is the whole point of offline sync. Falls back to
// "now" for normal, already-online sign-ins. Anything unparsable, more
// than 5 minutes in the future (clock skew tolerance), or older than 30
// days is rejected as implausible rather than silently accepted.
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

// Sign in. Requires the token scanned from the site's QR code. Fails if
// already signed in for that work date (prevents the silent double-entries
// the paper form allowed). `occurred_at` (optional) lets an offline-queued
// sign-in record its real scan time instead of the sync time.
router.post('/sign-in', requireAuth, async (req, res) => {
  const employeeId = req.user.id;
  const { qr_token, lat, lng, occurred_at } = req.body;

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  const ts = resolveTimestamp(occurred_at);
  if (!ts.valid) return res.status(400).json({ error: 'occurred_at is not a plausible timestamp' });
  const workDate = ts.iso.slice(0, 10);

  try {
    const existing = await pool.query(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2`,
      [employeeId, workDate]
    );
    if (existing.rows[0]?.sign_in_time) {
      return res.status(409).json({ error: 'Already signed in for that day' });
    }

    let record;
    if (existing.rows[0]) {
      const result = await pool.query(
        `UPDATE attendance_records
         SET sign_in_time = $1, sign_in_lat = $2, sign_in_lng = $3, sign_in_site_id = $4
         WHERE id = $5 RETURNING *`,
        [ts.iso, lat ?? null, lng ?? null, site.id, existing.rows[0].id]
      );
      record = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO attendance_records (employee_id, work_date, sign_in_time, sign_in_lat, sign_in_lng, sign_in_site_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [employeeId, workDate, ts.iso, lat ?? null, lng ?? null, site.id]
      );
      record = result.rows[0];
    }
    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// Sign out. Requires the token scanned from the site's QR code. Fails if
// not signed in yet, or already signed out, for that work date.
router.post('/sign-out', requireAuth, async (req, res) => {
  const employeeId = req.user.id;
  const { qr_token, lat, lng, occurred_at } = req.body;

  const site = await resolveSite(qr_token);
  if (!site) return res.status(400).json({ error: 'Invalid or inactive site QR code' });

  const ts = resolveTimestamp(occurred_at);
  if (!ts.valid) return res.status(400).json({ error: 'occurred_at is not a plausible timestamp' });
  const workDate = ts.iso.slice(0, 10);

  try {
    const existing = await pool.query(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2`,
      [employeeId, workDate]
    );
    const record = existing.rows[0];
    if (!record || !record.sign_in_time) {
      return res.status(409).json({ error: 'You have not signed in for that day' });
    }
    if (record.sign_out_time) {
      return res.status(409).json({ error: 'Already signed out for that day' });
    }

    const result = await pool.query(
      `UPDATE attendance_records
       SET sign_out_time = $1, sign_out_lat = $2, sign_out_lng = $3, sign_out_site_id = $4
       WHERE id = $5 RETURNING *`,
      [ts.iso, lat ?? null, lng ?? null, site.id, record.id]
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
