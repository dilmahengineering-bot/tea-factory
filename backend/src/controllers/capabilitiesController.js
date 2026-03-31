const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const getCapabilities = async (req, res) => {
  try {
    const { line } = req.query;
    let userFilter = `u.role = 'operator'`;
    const params = [];
    if (line) { params.push(line); userFilter += ` AND u.dedicated_line = $${params.length}`; }

    const result = await pool.query(`
      SELECT
        u.id, u.emp_no, u.name, u.role, u.dedicated_line,
        mt.id AS type_id, mt.name AS type_name, mt.is_system,
        CASE WHEN oc.operator_id IS NOT NULL THEN true ELSE false END AS is_capable,
        oc.granted_at, oc.training_ref
      FROM users u
      CROSS JOIN machine_types mt
      LEFT JOIN operator_capabilities oc
        ON oc.operator_id = u.id AND oc.machine_type_id = mt.id
      WHERE ${userFilter} AND u.is_active = true
      ORDER BY u.name, mt.name
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const grantCapability = async (req, res) => {
  try {
    const { operatorId, machineTypeId } = req.params;
    const { trainingRef } = req.body;

    const user = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [operatorId]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    if (!['operator','technician'].includes(user.rows[0].role)) {
      return res.status(400).json({ error: 'Capabilities can only be granted to operators/technicians' });
    }
    const mt = await pool.query('SELECT id, name FROM machine_types WHERE id = $1', [machineTypeId]);
    if (!mt.rows.length) return res.status(404).json({ error: 'Machine type not found' });

    const result = await pool.query(`
      INSERT INTO operator_capabilities (operator_id, machine_type_id, granted_by, training_ref)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (operator_id, machine_type_id) DO UPDATE
        SET granted_by = $3, training_ref = COALESCE($4, operator_capabilities.training_ref), granted_at = NOW()
      RETURNING *
    `, [operatorId, machineTypeId, req.user.id, trainingRef || null]);

    await auditLog(req.user.id, 'CAPABILITY_GRANTED', 'capability', operatorId,
      null, { operatorName: user.rows[0].name, machineType: mt.rows[0].name, trainingRef }, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const revokeCapability = async (req, res) => {
  try {
    const { operatorId, machineTypeId } = req.params;
    const cap = await pool.query(
      'SELECT * FROM operator_capabilities WHERE operator_id = $1 AND machine_type_id = $2',
      [operatorId, machineTypeId]
    );
    if (!cap.rows.length) return res.status(404).json({ error: 'Capability not found' });

    await pool.query(
      'DELETE FROM operator_capabilities WHERE operator_id = $1 AND machine_type_id = $2',
      [operatorId, machineTypeId]
    );
    const user = await pool.query('SELECT name FROM users WHERE id = $1', [operatorId]);
    const mt = await pool.query('SELECT name FROM machine_types WHERE id = $1', [machineTypeId]);
    await auditLog(req.user.id, 'CAPABILITY_REVOKED', 'capability', operatorId,
      cap.rows[0], { operatorName: user.rows[0]?.name, machineType: mt.rows[0]?.name }, req.ip);
    res.json({ message: 'Capability revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getCapabilities, grantCapability, revokeCapability };
