const pool = require('../db/pool');

/**
 * Operator Leave Controller
 * Manages operator leave/absence records
 */

// Create or update leave record
const createOrUpdateLeave = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    const { operatorId, leaveDate, leaveType, shift = 'both', reason } = req.body;

    // Operators and technicians can mark leave for themselves
    const isSelfLeave = operatorId === userId;

    if (!isSelfLeave && !['technician', 'admin', 'engineer'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!operatorId || !leaveDate || !leaveType) {
      return res.status(400).json({ error: 'Missing required fields: operatorId, leaveDate, leaveType' });
    }

    // Technician can only create leave for operators on their line (or themselves)
    if (userRole === 'technician' && !isSelfLeave) {
      const opCheck = await pool.query(
        'SELECT dedicated_line FROM users WHERE id = $1 AND role = $2',
        [operatorId, 'operator']
      );

      if (!opCheck.rows[0]) {
        return res.status(404).json({ error: 'Operator not found' });
      }

      if (opCheck.rows[0].dedicated_line !== req.user.dedicated_line) {
        return res.status(403).json({ error: 'Can only create leave for operators on your line' });
      }
    }

    // Check if leave already exists for this operator/date/shift
    const existingLeave = await pool.query(
      `SELECT id FROM operator_leaves 
       WHERE operator_id = $1 AND leave_date = $2 AND shift = $3`,
      [operatorId, leaveDate, shift]
    );

    let result;
    if (existingLeave.rows[0]) {
      // Update existing leave
      result = await pool.query(
        `UPDATE operator_leaves
         SET leave_type = $1, reason = $2, updated_at = NOW()
         WHERE operator_id = $3 AND leave_date = $4 AND shift = $5
         RETURNING id, operator_id, leave_date, shift, leave_type, approval_status`,
        [leaveType, reason, operatorId, leaveDate, shift]
      );
    } else {
      // Create new leave record
      result = await pool.query(
        `INSERT INTO operator_leaves (operator_id, leave_date, leave_type, shift, reason, created_by, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, operator_id, leave_date, shift, leave_type, approval_status`,
        [operatorId, leaveDate, leaveType, shift, reason, userId, 'pending']
      );
    }

    res.json({
      success: true,
      message: existingLeave.rows[0] ? 'Leave updated' : 'Leave created',
      leave: result.rows[0]
    });
  } catch (err) {
    console.error('Error in createOrUpdateLeave:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Approve leave (admin/engineer only)
const approveLeave = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    if (!['admin', 'engineer'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admin/engineer can approve leave' });
    }

    const { leaveId, action } = req.body;

    if (!leaveId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Missing leaveId or invalid action' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const result = await pool.query(
      `UPDATE operator_leaves
       SET approval_status = $1, approved_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, operator_id, leave_date, leave_type, approval_status`,
      [newStatus, req.user.id, leaveId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Leave not found' });
    }

    res.json({ success: true, message: `Leave ${action}ed`, leave: result.rows[0] });
  } catch (err) {
    console.error('Error in approveLeave:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Get operator leaves (for dashboard/records)
const getOperatorLeaves = async (req, res) => {
  try {
    const { operatorId, fromDate, toDate, approval_status } = req.query;

    if (!operatorId) {
      return res.status(400).json({ error: 'Missing operatorId' });
    }

    let query = `
      SELECT ol.id, ol.operator_id, u.name, u.emp_no, u.dedicated_line,
             ol.leave_date, ol.leave_type, ol.shift, ol.reason, 
             ol.approval_status, ol.created_at
      FROM operator_leaves ol
      JOIN users u ON u.id = ol.operator_id
      WHERE ol.operator_id = $1
    `;
    const params = [operatorId];

    if (fromDate) {
      params.push(fromDate);
      query += ` AND ol.leave_date >= $${params.length}`;
    }

    if (toDate) {
      params.push(toDate);
      query += ` AND ol.leave_date <= $${params.length}`;
    }

    if (approval_status) {
      params.push(approval_status);
      query += ` AND ol.approval_status = $${params.length}`;
    }

    query += ` ORDER BY ol.leave_date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in getOperatorLeaves:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Check if operator is on leave for specific date/shift
const checkOperatorLeave = async (req, res) => {
  try {
    const { operatorId, leaveDate, shift = 'both' } = req.query;

    if (!operatorId || !leaveDate) {
      return res.status(400).json({ error: 'Missing operatorId or leaveDate' });
    }

    // Check if approved leave exists for this operator on this date
    const result = await pool.query(
      `SELECT id, leave_type, reason FROM operator_leaves
       WHERE operator_id = $1 
         AND leave_date = $2 
         AND (shift = $3 OR shift = 'both')
         AND approval_status = 'approved'`,
      [operatorId, leaveDate, shift]
    );

    const isOnLeave = result.rows.length > 0;

    res.json({
      isOnLeave,
      leave: isOnLeave ? result.rows[0] : null
    });
  } catch (err) {
    console.error('Error in checkOperatorLeave:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Delete leave record
const deleteLeave = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { leaveId } = req.params;

    // Get leave record to check permissions
    const leaveRecord = await pool.query(
      'SELECT id, operator_id, created_by FROM operator_leaves WHERE id = $1',
      [leaveId]
    );

    if (!leaveRecord.rows[0]) {
      return res.status(404).json({ error: 'Leave not found' });
    }

    // Operators can only delete their own leave records
    if (userRole === 'operator' && leaveRecord.rows[0].operator_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own leave records' });
    }

    // Technicians can only delete records they created or their own
    if (userRole === 'technician' && leaveRecord.rows[0].created_by !== req.user.id && leaveRecord.rows[0].operator_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own leave records' });
    }

    await pool.query('DELETE FROM operator_leaves WHERE id = $1', [leaveId]);

    res.json({ success: true, message: 'Leave deleted' });
  } catch (err) {
    console.error('Error in deleteLeave:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Get line leaves (technician can see their line's leaves)
const getLineLeaves = async (req, res) => {
  try {
    const userRole = req.user.role;
    const { date, status } = req.query;

    let query = `
      SELECT ol.id, ol.operator_id, u.name, u.emp_no, u.dedicated_line,
             ol.leave_date, ol.leave_type, ol.shift, ol.reason, 
             ol.approval_status, ol.created_at
      FROM operator_leaves ol
      JOIN users u ON u.id = ol.operator_id
      WHERE 1=1
    `;
    const params = [];

    // Technicians see only their line's leaves
    if (userRole === 'technician') {
      params.push(req.user.dedicated_line);
      query += ` AND u.dedicated_line = $${params.length}`;
    }

    if (date) {
      params.push(date);
      query += ` AND ol.leave_date = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND ol.approval_status = $${params.length}`;
    }

    query += ` ORDER BY ol.leave_date DESC, u.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in getLineLeaves:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Get own leaves (for operators/technicians viewing their own)
const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromDate, toDate } = req.query;

    let query = `
      SELECT ol.id, ol.operator_id, ol.leave_date, ol.leave_type, ol.shift, 
             ol.reason, ol.approval_status, ol.created_at
      FROM operator_leaves ol
      WHERE ol.operator_id = $1
    `;
    const params = [userId];

    if (fromDate) {
      params.push(fromDate);
      query += ` AND ol.leave_date >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      query += ` AND ol.leave_date <= $${params.length}`;
    }

    query += ` ORDER BY ol.leave_date DESC LIMIT 20`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in getMyLeaves:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createOrUpdateLeave,
  approveLeave,
  getOperatorLeaves,
  getMyLeaves,
  checkOperatorLeave,
  deleteLeave,
  getLineLeaves
};
