const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const getUsers = async (req, res) => {
  try {
    let { role, line, active } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userDedicatedLine = req.user.dedicated_line;
    
    // Access control: technicians have restricted access
    if (userRole === 'technician') {
      // Exception: Technicians can query ALL operators (for common pool allocation)
      if (role === 'operator' && !line) {
        // Allow querying all operators across all lines for pool
        // Don't set line filter in this case
      } else {
        // For other queries, technicians can only query their dedicated line
        if (line && line !== userDedicatedLine) {
          return res.status(403).json({ error: 'Access denied: can only query your own line' });
        }
        // Force query to dedicated line if not querying operators globally
        if (!line || line === userDedicatedLine || (role !== 'operator')) {
          line = userDedicatedLine;
        }
      }
    } else if (userRole !== 'admin' && userRole !== 'engineer') {
      // Only admin, engineer, and technician can access this endpoint
      return res.status(403).json({ error: 'Access denied' });
    }
    
    let query = `
      SELECT u.id, u.emp_no, u.name, u.email, u.role, u.dedicated_line, u.is_active,
             u.created_at,
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT('id', mt.id, 'name', mt.name)
               ) FILTER (WHERE mt.id IS NOT NULL), '[]'
             ) AS capabilities
      FROM users u
      LEFT JOIN operator_capabilities oc ON oc.operator_id = u.id
      LEFT JOIN machine_types mt ON mt.id = oc.machine_type_id
      WHERE 1=1
    `;
    const params = [];
    
    if (role) { params.push(role); query += ` AND u.role = $${params.length}`; }
    if (line) { params.push(line); query += ` AND u.dedicated_line = $${params.length}`; }
    if (active !== undefined) { params.push(active === 'true'); query += ` AND u.is_active = $${params.length}`; }
    query += ` GROUP BY u.id ORDER BY u.role, u.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in getUsers:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.emp_no, u.name, u.email, u.role, u.dedicated_line, u.is_active,
             COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', mt.id, 'name', mt.name))
               FILTER (WHERE mt.id IS NOT NULL), '[]') AS capabilities
      FROM users u
      LEFT JOIN operator_capabilities oc ON oc.operator_id = u.id
      LEFT JOIN machine_types mt ON mt.id = oc.machine_type_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { empNo, name, email, password, role, dedicatedLine } = req.body;
    if (!empNo || !name || !password || !role) {
      return res.status(400).json({ error: 'empNo, name, password, role are required' });
    }
    if (!['admin','engineer','technician','operator'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const needsLine = ['technician','operator'].includes(role);
    if (needsLine && !dedicatedLine) {
      return res.status(400).json({ error: 'dedicated_line required for technician/operator' });
    }
    const exists = await pool.query('SELECT id FROM users WHERE emp_no = $1', [empNo]);
    if (exists.rows.length) return res.status(409).json({ error: 'Employee number already exists' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(`
      INSERT INTO users (emp_no, name, email, password_hash, role, dedicated_line)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, emp_no, name, email, role, dedicated_line, is_active
    `, [empNo, name, email || null, hash, role, needsLine ? dedicatedLine : null]);

    await auditLog(req.user.id, 'USER_CREATED', 'user', result.rows[0].id, null, { empNo, name, role }, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, email, role, dedicatedLine, isActive } = req.body;
    const old = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user.id && isActive === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const needsLine = ['technician','operator'].includes(role || old.rows[0].role);
    const result = await pool.query(`
      UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        dedicated_line = $4,
        is_active = COALESCE($5, is_active)
      WHERE id = $6
      RETURNING id, emp_no, name, email, role, dedicated_line, is_active
    `, [
      name || null,
      email || null,
      role || null,
      needsLine ? (dedicatedLine || old.rows[0].dedicated_line) : null,
      isActive !== undefined ? isActive : null,
      req.params.id
    ]);

    await auditLog(req.user.id, 'USER_UPDATED', 'user', req.params.id, old.rows[0], req.body, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    await auditLog(req.user.id, 'PASSWORD_RESET', 'user', req.params.id, null, null, req.ip);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, resetPassword };
