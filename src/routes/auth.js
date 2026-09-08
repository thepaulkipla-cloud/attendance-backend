const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { SECRET, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Admin creates an employee account (name + phone + starting PIN).
// In Phase 1 there's no self-signup — the admin onboards staff, mirroring
// how names were already pre-printed on the paper register.
router.post('/employees', requireAuth, requireAdmin, async (req, res) => {
  const { full_name, phone_number, pin, role } = req.body;
  if (!full_name || !phone_number || !pin) {
    return res.status(400).json({ error: 'full_name, phone_number and pin are required' });
  }
  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    const result = await pool.query(
      `INSERT INTO employees (full_name, phone_number, pin_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone_number, role, active`,
      [full_name, phone_number, pin_hash, role === 'admin' ? 'admin' : 'employee']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone number already registered' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Login with phone number + PIN, returns a JWT.
router.post('/login', async (req, res) => {
  const { phone_number, pin } = req.body;
  if (!phone_number || !pin) {
    return res.status(400).json({ error: 'phone_number and pin are required' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE phone_number = $1 AND active = TRUE',
      [phone_number]
    );
    const employee = result.rows[0];
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(pin, employee.pin_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: employee.id, full_name: employee.full_name, role: employee.role },
      SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, employee: { id: employee.id, full_name: employee.full_name, role: employee.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
