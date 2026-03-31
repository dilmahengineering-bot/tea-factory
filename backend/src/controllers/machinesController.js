const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const getMachineTypes = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mt.*,
        COUNT(DISTINCT m.id)::int AS machine_count,
        COUNT(DISTINCT oc.operator_id)::int AS certified_operators
      FROM machine_types mt
      LEFT JOIN machines m ON m.machine_type_id = mt.id AND m.is_active = true
      LEFT JOIN operator_capabilities oc ON oc.machine_type_id = mt.id
      GROUP BY mt.id
      ORDER BY mt.is_system DESC, mt.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createMachineType = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const exists = await pool.query('SELECT id FROM machine_types WHERE LOWER(name) = LOWER($1)', [name]);
    if (exists.rows.length) return res.status(409).json({ error: 'Machine type already exists' });

    const result = await pool.query(
      `INSERT INTO machine_types (name, description, is_system, created_by)
       VALUES ($1, $2, false, $3) RETURNING *`,
      [name, description || null, req.user.id]
    );
    await auditLog(req.user.id, 'MACHINE_TYPE_CREATED', 'machine_type', result.rows[0].id, null, { name }, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteMachineType = async (req, res) => {
  try {
    const mt = await pool.query('SELECT * FROM machine_types WHERE id = $1', [req.params.id]);
    if (!mt.rows.length) return res.status(404).json({ error: 'Machine type not found' });
    if (mt.rows[0].is_system) return res.status(400).json({ error: 'Cannot delete system machine types' });

    const inUse = await pool.query('SELECT id FROM machines WHERE machine_type_id = $1 AND is_active = true LIMIT 1', [req.params.id]);
    if (inUse.rows.length) return res.status(400).json({ error: 'Machine type is in use by active machines' });

    await pool.query('DELETE FROM operator_capabilities WHERE machine_type_id = $1', [req.params.id]);
    await pool.query('DELETE FROM machine_types WHERE id = $1', [req.params.id]);
    await auditLog(req.user.id, 'MACHINE_TYPE_DELETED', 'machine_type', req.params.id, mt.rows[0], null, req.ip);
    res.json({ message: 'Machine type deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateMachineType = async (req, res) => {
  try {
    const { name, description } = req.body;
    const typeId = req.params.id;

    const existing = await pool.query('SELECT * FROM machine_types WHERE id = $1', [typeId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Machine type not found' });
    if (existing.rows[0].is_system) return res.status(400).json({ error: 'Cannot edit system machine types' });

    const updates = [];
    const params = [typeId];
    let paramCount = 1;

    if (name !== undefined) {
      const nameExists = await pool.query('SELECT id FROM machine_types WHERE LOWER(name) = LOWER($1) AND id != $2', [name, typeId]);
      if (nameExists.rows.length) return res.status(409).json({ error: 'Machine type name already exists' });
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description || null);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const result = await pool.query(
      `UPDATE machine_types SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    await auditLog(req.user.id, 'MACHINE_TYPE_UPDATED', 'machine_type', typeId, existing.rows[0], result.rows[0], req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating machine type:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Machines
const getMachines = async (req, res) => {
  try {
    const { line } = req.query;
    let query = `
      SELECT m.*, mt.name AS type_name, mt.id AS type_id
      FROM machines m
      JOIN machine_types mt ON mt.id = m.machine_type_id
      WHERE m.is_active = true
    `;
    const params = [];
    if (line) { params.push(line); query += ` AND m.line = $${params.length}`; }
    query += ' ORDER BY m.line, m.id';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createMachine = async (req, res) => {
  try {
    const { id, name, machineTypeId, line, attentionLevel, maxOperators } = req.body;
    if (!id || !name || !machineTypeId || !line || !attentionLevel) {
      return res.status(400).json({ error: 'id, name, machineTypeId, line, attentionLevel required' });
    }
    const result = await pool.query(`
      INSERT INTO machines (id, name, machine_type_id, line, attention_level, max_operators)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [id, name, machineTypeId, line, attentionLevel, maxOperators || 1]);
    await auditLog(req.user.id, 'MACHINE_CREATED', 'machine', id, null, req.body, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Machine ID already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateMachine = async (req, res) => {
  try {
    const { name, machineTypeId, line, attentionLevel, maxOperators } = req.body;
    const machineId = req.params.id;
    
    const existing = await pool.query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Machine not found' });

    const updates = [];
    const params = [machineId];
    let paramCount = 1;

    if (name !== undefined) { paramCount++; updates.push(`name = $${paramCount}`); params.push(name); }
    if (machineTypeId !== undefined) { paramCount++; updates.push(`machine_type_id = $${paramCount}`); params.push(machineTypeId); }
    if (line !== undefined) { paramCount++; updates.push(`line = $${paramCount}`); params.push(line); }
    if (attentionLevel !== undefined) { paramCount++; updates.push(`attention_level = $${paramCount}`); params.push(attentionLevel); }
    if (maxOperators !== undefined) { paramCount++; updates.push(`max_operators = $${paramCount}`); params.push(maxOperators); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const result = await pool.query(
      `UPDATE machines SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    await auditLog(req.user.id, 'MACHINE_UPDATED', 'machine', machineId, existing.rows[0], req.body, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteMachine = async (req, res) => {
  try {
    const machineId = req.params.id;
    const existing = await pool.query('SELECT * FROM machines WHERE id = $1', [machineId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Machine not found' });

    // Soft delete or hard delete with cascade cleanup
    await pool.query('DELETE FROM assignments WHERE machine_id = $1', [machineId]);
    await pool.query('DELETE FROM machines WHERE id = $1', [machineId]);

    await auditLog(req.user.id, 'MACHINE_DELETED', 'machine', machineId, existing.rows[0], null, req.ip);
    res.json({ message: 'Machine deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteMachineTypeAdmin = async (req, res) => {
  try {
    const mt = await pool.query('SELECT * FROM machine_types WHERE id = $1', [req.params.id]);
    if (!mt.rows.length) return res.status(404).json({ error: 'Machine type not found' });
    if (mt.rows[0].is_system) return res.status(400).json({ error: 'Cannot delete system machine types' });

    // Admin force delete: cascade delete all related machines and assignments
    await pool.query('DELETE FROM assignments WHERE machine_id IN (SELECT id FROM machines WHERE machine_type_id = $1)', [req.params.id]);
    await pool.query('DELETE FROM machines WHERE machine_type_id = $1', [req.params.id]);
    await pool.query('DELETE FROM operator_capabilities WHERE machine_type_id = $1', [req.params.id]);
    await pool.query('DELETE FROM machine_types WHERE id = $1', [req.params.id]);

    await auditLog(req.user.id, 'MACHINE_TYPE_DELETED_ADMIN', 'machine_type', req.params.id, mt.rows[0], null, req.ip);
    res.json({ message: 'Machine type and all related machines deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getMachineTypes, createMachineType, deleteMachineType, updateMachineType, deleteMachineTypeAdmin, getMachines, createMachine, updateMachine, deleteMachine };
