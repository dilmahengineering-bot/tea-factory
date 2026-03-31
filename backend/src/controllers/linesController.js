const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const getProductionLines = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pl.id,
        pl.line_code,
        pl.line_name,
        pl.location,
        pl.capacity,
        pl.status,
        pl.assigned_engineer_id,
        pl.created_by,
        pl.created_at,
        pl.updated_at,
        COUNT(DISTINCT m.id)::int AS machine_count,
        u.name AS engineer_name,
        u.emp_no AS engineer_emp_no
      FROM production_lines pl
      LEFT JOIN machines m ON m.line = pl.line_code AND m.is_active = true
      LEFT JOIN users u ON u.id = pl.assigned_engineer_id
      GROUP BY pl.id, pl.line_code, pl.line_name, pl.location, pl.capacity, pl.status, pl.assigned_engineer_id, pl.created_by, pl.created_at, pl.updated_at, u.id, u.name, u.emp_no
      ORDER BY pl.line_code
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching production lines:', err.message);
    console.error('Full error:', err);
    // If table doesn't exist, return default lines
    if (err.message.includes('does not exist')) {
      res.json([
        { id: 1, line_code: 'L1', line_name: 'Line 1', capacity: 5, status: 'active', machine_count: 0 },
        { id: 2, line_code: 'L2', line_name: 'Line 2', capacity: 5, status: 'active', machine_count: 0 },
        { id: 3, line_code: 'L3', line_name: 'Line 3', capacity: 5, status: 'active', machine_count: 0 },
      ]);
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

const createProductionLine = async (req, res) => {
  try {
    const { line_code, line_name, location, capacity, status, assigned_engineer_id } = req.body;
    if (!line_code || !line_name) {
      return res.status(400).json({ error: 'line_code and line_name are required' });
    }

    const exists = await pool.query('SELECT id FROM production_lines WHERE line_code = $1', [line_code]);
    if (exists.rows.length) return res.status(409).json({ error: 'Production line already exists' });

    // Validate engineer if provided
    if (assigned_engineer_id) {
      const engineer = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role IN ('engineer', 'admin')`,
        [assigned_engineer_id]
      );
      if (!engineer.rows.length) {
        return res.status(400).json({ error: 'Invalid engineer selected' });
      }
    }

    const result = await pool.query(`
      INSERT INTO production_lines (line_code, line_name, location, capacity, status, assigned_engineer_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [line_code, line_name, location || null, capacity || 5, status || 'active', assigned_engineer_id || null, req.user.id]);

    await auditLog(req.user.id, 'PRODUCTION_LINE_CREATED', 'production_line', result.rows[0].id, null, result.rows[0], req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating production line:', err.message);
    if (err.code === '23505') return res.status(409).json({ error: 'Line code already exists' });
    if (err.message.includes('does not exist')) {
      return res.status(500).json({ error: 'Database not properly initialized. Please restart the server.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateProductionLine = async (req, res) => {
  try {
    const { line_name, location, capacity, status, assigned_engineer_id } = req.body;
    const lineId = req.params.id;

    const existing = await pool.query('SELECT * FROM production_lines WHERE id = $1', [lineId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Production line not found' });

    // Validate engineer if provided
    if (assigned_engineer_id) {
      const engineer = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role IN ('engineer', 'admin')`,
        [assigned_engineer_id]
      );
      if (!engineer.rows.length) {
        return res.status(400).json({ error: 'Invalid engineer selected' });
      }
    }

    const updates = [];
    const params = [lineId];
    let paramCount = 1;

    if (line_name !== undefined) { paramCount++; updates.push(`line_name = $${paramCount}`); params.push(line_name); }
    if (location !== undefined) { paramCount++; updates.push(`location = $${paramCount}`); params.push(location); }
    if (capacity !== undefined) { paramCount++; updates.push(`capacity = $${paramCount}`); params.push(capacity); }
    if (status !== undefined) { paramCount++; updates.push(`status = $${paramCount}`); params.push(status); }
    if (assigned_engineer_id !== undefined) { paramCount++; updates.push(`assigned_engineer_id = $${paramCount}`); params.push(assigned_engineer_id || null); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const result = await pool.query(
      `UPDATE production_lines SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    await auditLog(req.user.id, 'PRODUCTION_LINE_UPDATED', 'production_line', lineId, existing.rows[0], result.rows[0], req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteProductionLine = async (req, res) => {
  try {
    const lineId = req.params.id;
    const existing = await pool.query('SELECT * FROM production_lines WHERE id = $1', [lineId]);
    
    if (!existing.rows.length) return res.status(404).json({ error: 'Production line not found' });
    if (existing.rows[0].machine_count > 0) {
      return res.status(400).json({ error: 'Cannot delete production line with active machines' });
    }

    await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
    await auditLog(req.user.id, 'PRODUCTION_LINE_DELETED', 'production_line', lineId, existing.rows[0], null, req.ip);
    res.json({ message: 'Production line deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getProductionLines, createProductionLine, updateProductionLine, deleteProductionLine };
