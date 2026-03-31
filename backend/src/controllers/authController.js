const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required' });
    }

    // Operators log in with emp_no; engineers/admins/technicians can use email or emp_no
    const result = await pool.query(
      `SELECT id, emp_no, name, email, password_hash, role, dedicated_line, is_active
       FROM users
       WHERE (emp_no = $1 OR (email IS NOT NULL AND email = $1))
       LIMIT 1`,
      [identifier.trim()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await auditLog(user.id, 'LOGIN', 'user', user.id, null, null, req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        empNo: user.emp_no,
        name: user.name,
        email: user.email,
        role: user.role,
        dedicatedLine: user.dedicated_line,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const me = async (req, res) => {
  res.json({
    id: req.user.id,
    empNo: req.user.emp_no,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    dedicatedLine: req.user.dedicated_line,
  });
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both passwords required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await auditLog(req.user.id, 'PASSWORD_CHANGED', 'user', req.user.id, null, null, req.ip);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { login, me, changePassword };
