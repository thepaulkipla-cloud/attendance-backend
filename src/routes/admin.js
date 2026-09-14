const express = require('express');
const { Parser } = require('json2csv');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Returns every employee's records for the 7 days starting at `week_start`
// (YYYY-MM-DD, expected to be a Monday), shaped like the paper register:
// one row per employee, one IN/OUT pair per day.
router.get('/register', requireAuth, requireAdmin, async (req, res) => {
  const weekStart = req.query.week_start;
  if (!weekStart) return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });

  try {
    const employees = await pool.query(
      `SELECT id, full_name FROM employees WHERE role = 'employee' AND active = TRUE ORDER BY full_name`
    );
    const records = await pool.query(
      `SELECT id, employee_id, work_date, sign_in_time, sign_out_time, flagged, flag_reason
       FROM attendance_records
       WHERE work_date >= $1::date AND work_date < $1::date + INTERVAL '7 days'`,
      [weekStart]
    );

    const byEmployee = {};
    for (const emp of employees.rows) byEmployee[emp.id] = { full_name: emp.full_name, days: {} };
    for (const rec of records.rows) {
      const dateKey = rec.work_date.toISOString().slice(0, 10);
      if (byEmployee[rec.employee_id]) {
        byEmployee[rec.employee_id].days[dateKey] = {
          id: rec.id,
          sign_in: rec.sign_in_time,
          sign_out: rec.sign_out_time,
          flagged: rec.flagged,
          flag_reason: rec.flag_reason,
        };
      }
    }
    res.json({ week_start: weekStart, employees: byEmployee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build register' });
  }
});

// Flat CSV export of a week's records — the digital equivalent of
// photocopying the completed paper register.
router.get('/register/export', requireAuth, requireAdmin, async (req, res) => {
  const weekStart = req.query.week_start;
  if (!weekStart) return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });

  try {
    const result = await pool.query(
      `SELECT e.full_name, r.work_date, r.sign_in_time, r.sign_out_time, r.flagged, r.flag_reason
       FROM attendance_records r
       JOIN employees e ON e.id = r.employee_id
       WHERE r.work_date >= $1::date AND r.work_date < $1::date + INTERVAL '7 days'
       ORDER BY e.full_name, r.work_date`,
      [weekStart]
    );
    const parser = new Parser({
      fields: ['full_name', 'work_date', 'sign_in_time', 'sign_out_time', 'flagged', 'flag_reason'],
    });
    const csv = parser.parse(result.rows);
    res.header('Content-Type', 'text/csv');
    res.attachment(`attendance-week-${weekStart}.csv`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Manual correction of a record (e.g. an employee forgot to sign out).
// Blocked once the record's week has been verified — reopen the week
// first (see /admin/signoff/reopen) if a correction is genuinely needed.
router.patch('/records/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { sign_in_time, sign_out_time, flagged, flag_reason } = req.body;
  try {
    const existing = await pool.query('SELECT work_date FROM attendance_records WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Record not found' });

    const weekStart = new Date(existing.rows[0].work_date);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const signoff = await pool.query(
      'SELECT verified_at FROM weekly_signoffs WHERE week_start_date = $1',
      [weekStartStr]
    );
    if (signoff.rows[0]?.verified_at) {
      return res.status(409).json({ error: 'This week has been verified and is locked. Reopen it first to make corrections.' });
    }

    const result = await pool.query(
      `UPDATE attendance_records SET
         sign_in_time = COALESCE($1, sign_in_time),
         sign_out_time = COALESCE($2, sign_out_time),
         flagged = COALESCE($3, flagged),
         flag_reason = COALESCE($4, flag_reason)
       WHERE id = $5 RETURNING *`,
      [sign_in_time ?? null, sign_out_time ?? null, flagged ?? null, flag_reason ?? null, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Guest/visitor records for a week — the digital equivalent of the
// paper register's Guest/Visitor rows.
router.get('/guests', requireAuth, requireAdmin, async (req, res) => {
  const weekStart = req.query.week_start;
  if (!weekStart) return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });

  try {
    const result = await pool.query(
      `SELECT g.id, g.guest_name, g.work_date, g.sign_in_time, g.sign_out_time, e.full_name AS hosted_by_name
       FROM guest_records g
       LEFT JOIN employees e ON e.id = g.hosted_by
       WHERE g.work_date >= $1::date AND g.work_date < $1::date + INTERVAL '7 days'
       ORDER BY g.work_date, g.sign_in_time`,
      [weekStart]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch guest records' });
  }
});

// List all employees for the admin dashboard's employee management panel.
router.get('/employees', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, phone_number, role, active FROM employees ORDER BY full_name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Deactivate/reactivate an employee, or change their role — e.g. when
// someone leaves the company, without deleting their historical records.
router.patch('/employees/:id', requireAuth, requireAdmin, async (req, res) => {
  const { active, role } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employees SET
         active = COALESCE($1, active),
         role = COALESCE($2, role)
       WHERE id = $3 RETURNING id, full_name, phone_number, role, active`,
      [active ?? null, role ?? null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

module.exports = router;
