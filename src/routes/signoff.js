const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Current sign-off status for a week — null fields mean that step
// hasn't happened yet.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const weekStart = req.query.week_start;
  if (!weekStart) return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });

  try {
    const result = await pool.query(
      `SELECT ws.*, c.full_name AS completed_by_name, v.full_name AS verified_by_name
       FROM weekly_signoffs ws
       LEFT JOIN employees c ON c.id = ws.completed_by
       LEFT JOIN employees v ON v.id = ws.verified_by
       WHERE ws.week_start_date = $1`,
      [weekStart]
    );
    res.json(result.rows[0] || { week_start_date: weekStart, completed_by: null, verified_by: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sign-off status' });
  }
});

// Marks the week as "completed" — the digital equivalent of the paper
// register's "Completed by" line. Whoever calls this is logged as the
// completer, with a timestamp.
router.post('/complete', requireAuth, requireAdmin, async (req, res) => {
  const { week_start } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start is required' });

  try {
    const result = await pool.query(
      `INSERT INTO weekly_signoffs (week_start_date, completed_by, completed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (week_start_date)
       DO UPDATE SET completed_by = $2, completed_at = now()
       RETURNING *`,
      [week_start, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark week completed' });
  }
});

// Marks the week as "verified" — the paper register's "Verified by" line.
// Requires the week to already be marked completed first, mirroring the
// two-step sign-off the paper form implies.
router.post('/verify', requireAuth, requireAdmin, async (req, res) => {
  const { week_start } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start is required' });

  try {
    const existing = await pool.query(
      'SELECT * FROM weekly_signoffs WHERE week_start_date = $1',
      [week_start]
    );
    if (!existing.rows[0]?.completed_by) {
      return res.status(409).json({ error: 'Week must be marked completed before it can be verified' });
    }

    const result = await pool.query(
      `UPDATE weekly_signoffs SET verified_by = $1, verified_at = now() WHERE week_start_date = $2 RETURNING *`,
      [req.user.id, week_start]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify week' });
  }
});

// Reopens a week (undoes verification/completion) — for when a mistake is
// found after sign-off and corrections are still needed.
router.post('/reopen', requireAuth, requireAdmin, async (req, res) => {
  const { week_start } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start is required' });

  try {
    const result = await pool.query(
      `UPDATE weekly_signoffs
       SET completed_by = NULL, completed_at = NULL, verified_by = NULL, verified_at = NULL
       WHERE week_start_date = $1 RETURNING *`,
      [week_start]
    );
    res.json(result.rows[0] || { week_start_date: week_start, completed_by: null, verified_by: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reopen week' });
  }
});

module.exports = router;
