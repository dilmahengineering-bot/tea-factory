const pool = require('../db/pool');

/**
 * Common Operator Pool Controller
 * Manages operators offered by technicians to the common pool for cross-line allocation
 */

// Get operators on a line with their current load (for Offer to Pool section)
const getLineOperatorsWithLoad = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userLine = req.user.dedicated_line;
    const { allocationDate, shift } = req.query;

    if (userRole !== 'technician') {
      return res.status(403).json({ error: 'Only technicians can view this' });
    }

    if (!allocationDate || !shift) {
      return res.status(400).json({ error: 'Missing required query params: allocationDate, shift' });
    }

    const result = await pool.query(
      `SELECT 
        u.id as operator_id,
        u.emp_no,
        u.name,
        u.dedicated_line,
        u.is_active,
        -- Calculate load for this operator on their line
        COALESCE(SUM(
          CASE 
            WHEN m.attention_level = 'HIGH' THEN 1.0
            WHEN m.attention_level = 'MED' THEN 0.4
            WHEN m.attention_level = 'LOW' THEN 0.2
            ELSE 0
          END
        ), 0) as current_load,
        -- Check if already offered to pool
        CASE WHEN cpo.id IS NOT NULL THEN true ELSE false END as in_pool
       FROM users u
       LEFT JOIN schedule_plans sp ON sp.plan_date = $1 
         AND sp.shift = $2 
         AND sp.line = u.dedicated_line
       LEFT JOIN assignments a ON a.plan_id = sp.id AND a.operator_id = u.id
       LEFT JOIN machines m ON m.id = a.machine_id
       LEFT JOIN common_pool_operators cpo ON cpo.operator_id = u.id 
         AND cpo.allocation_date = $1 
         AND cpo.shift = $2
         AND cpo.is_allocated = false
       WHERE u.role = 'operator' 
         AND u.dedicated_line = $3
         AND u.is_active = true
       GROUP BY u.id, cpo.id
       ORDER BY u.name`,
      [allocationDate, shift, userLine]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error in getLineOperatorsWithLoad:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Offer operator to common pool
const offerOperatorToPool = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userLine = req.user.dedicated_line;
    
    if (userRole !== 'technician') {
      return res.status(403).json({ error: 'Only technicians can offer operators to pool' });
    }

    const { operatorId, planId, allocationDate, shift } = req.body;

    if (!operatorId || !planId || !allocationDate || !shift) {
      return res.status(400).json({ error: 'Missing required fields: operatorId, planId, allocationDate, shift' });
    }

    // Verify operator belongs to technician's line
    const operatorCheck = await pool.query(
      'SELECT id, dedicated_line FROM users WHERE id = $1 AND role = $2',
      [operatorId, 'operator']
    );

    if (!operatorCheck.rows[0]) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    if (operatorCheck.rows[0].dedicated_line !== userLine) {
      return res.status(403).json({ error: 'Can only offer operators from your line' });
    }

    // Verify plan belongs to technician
    const planCheck = await pool.query(
      'SELECT id, line FROM schedule_plans WHERE id = $1 AND line = $2',
      [planId, userLine]
    );

    if (!planCheck.rows[0]) {
      return res.status(404).json({ error: 'Plan not found or not on your line' });
    }

    // Add operator to common pool
    const result = await pool.query(
      `INSERT INTO common_pool_operators (operator_id, offered_by_plan_id, offered_by, allocation_date, shift, is_allocated)
       VALUES ($1, $2, $3, $4, $5, false)
       ON CONFLICT (operator_id, allocation_date, shift) 
       DO UPDATE SET is_allocated = false, updated_at = NOW()
       RETURNING id, operator_id, allocation_date, shift`,
      [operatorId, planId, userId, allocationDate, shift]
    );

    res.json({
      success: true,
      message: 'Operator offered to common pool',
      poolEntry: result.rows[0]
    });
  } catch (err) {
    console.error('Error in offerOperatorToPool:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Get available operators in common pool (for current allocation date/shift)
const getPoolOperators = async (req, res) => {
  try {
    const { allocationDate, shift } = req.query;

    if (!allocationDate || !shift) {
      return res.status(400).json({ error: 'Missing required query params: allocationDate, shift' });
    }

    // First, get all pool operators for this date/shift
    const poolOpsResult = await pool.query(
      `SELECT DISTINCT cpo.id as pool_id,
              u.id as operator_id,
              u.emp_no,
              u.name,
              u.role,
              u.dedicated_line,
              u.is_active,
              cpo.allocation_date,
              cpo.shift,
              cpo.is_allocated,
              -- Calculate load for this operator on their home line
              COALESCE(SUM(
                CASE 
                  WHEN m.attention_level = 'HIGH' THEN 1.0
                  WHEN m.attention_level = 'MED' THEN 0.4
                  WHEN m.attention_level = 'LOW' THEN 0.2
                  ELSE 0
                END
              ), 0) as current_load
       FROM common_pool_operators cpo
       JOIN users u ON u.id = cpo.operator_id
       LEFT JOIN operator_leaves ol ON ol.operator_id = u.id 
         AND ol.leave_date = cpo.allocation_date 
         AND (ol.shift = cpo.shift OR ol.shift = 'both')
         AND ol.approval_status = 'approved'
       LEFT JOIN schedule_plans sp ON sp.plan_date = cpo.allocation_date 
         AND sp.shift = cpo.shift
       LEFT JOIN assignments a ON a.plan_id = sp.id AND a.operator_id = u.id
       LEFT JOIN machines m ON m.id = a.machine_id
       WHERE cpo.allocation_date = $1 
         AND cpo.shift = $2 
         AND cpo.is_allocated = false
         AND ol.id IS NULL
       GROUP BY cpo.id, u.id
       ORDER BY u.dedicated_line, u.name`,
      [allocationDate, shift]
    );

    // Then, get capabilities for each operator
    const operatorIds = poolOpsResult.rows.map(op => op.operator_id);
    
    let capabilities = {};
    if (operatorIds.length > 0) {
      const capsResult = await pool.query(
        `SELECT oc.operator_id,
                JSON_AGG(
                  JSON_BUILD_OBJECT('id', mt.id, 'name', mt.name)
                ) as capabilities
         FROM operator_capabilities oc
         JOIN machine_types mt ON mt.id = oc.machine_type_id
         WHERE oc.operator_id = ANY($1)
         GROUP BY oc.operator_id`,
        [operatorIds]
      );
      
      capsResult.rows.forEach(row => {
        capabilities[row.operator_id] = row.capabilities;
      });
    }

    // Combine results
    const result = poolOpsResult.rows.map(op => ({
      ...op,
      capabilities: capabilities[op.operator_id] || []
    }));

    res.json(result);
  } catch (err) {
    console.error('Error in getPoolOperators:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Remove operator from pool (revoke offer)
const removeOperatorFromPool = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { poolId } = req.params;

    if (userRole !== 'technician' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only technicians and admins can remove from pool' });
    }

    // Get pool entry to verify ownership
    const poolEntry = await pool.query(
      'SELECT id, operator_id, offered_by, is_allocated FROM common_pool_operators WHERE id = $1',
      [poolId]
    );

    if (!poolEntry.rows[0]) {
      return res.status(404).json({ error: 'Pool entry not found' });
    }

    if (poolEntry.rows[0].is_allocated) {
      return res.status(400).json({ error: 'Cannot remove allocated operator from pool' });
    }

    // Verify ownership (must be the one who offered it or admin)
    if (userRole === 'technician' && poolEntry.rows[0].offered_by !== userId) {
      return res.status(403).json({ error: 'You can only remove operators you offered' });
    }

    // Delete from pool
    await pool.query('DELETE FROM common_pool_operators WHERE id = $1', [poolId]);

    res.json({ success: true, message: 'Operator removed from common pool' });
  } catch (err) {
    console.error('Error in removeOperatorFromPool:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Mark operator as allocated (internal use - called when operator is assigned to another line)
const markPoolOperatorAllocated = async (req, res) => {
  try {
    const { poolId, allocatedToPlanId } = req.body;

    if (!poolId || !allocatedToPlanId) {
      return res.status(400).json({ error: 'Missing poolId or allocatedToPlanId' });
    }

    const result = await pool.query(
      `UPDATE common_pool_operators 
       SET is_allocated = true, allocated_to_plan_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, operator_id, is_allocated`,
      [allocatedToPlanId, poolId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Pool entry not found' });
    }

    res.json({ success: true, poolEntry: result.rows[0] });
  } catch (err) {
    console.error('Error in markPoolOperatorAllocated:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

module.exports = {
  offerOperatorToPool,
  getPoolOperators,
  getLineOperatorsWithLoad,
  removeOperatorFromPool,
  markPoolOperatorAllocated
};
