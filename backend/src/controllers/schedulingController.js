const pool = require('../db/pool');
const { auditLog } = require('../middleware/audit');

const ATTN_WEIGHT = { HIGH: 1.0, MED: 0.4, LOW: 0.2 };

const getOrCreatePlan = async (req, res) => {
  try {
    const { date, shift, line } = req.params;
    const user = req.user;

    // Technicians can only access their own line (admins can access all)
    if (user.role === 'technician' && user.dedicated_line !== line) {
      return res.status(403).json({ error: 'You can only plan your own line' });
    }

    let plan = await pool.query(
      `SELECT * FROM schedule_plans WHERE plan_date = $1 AND shift = $2 AND line = $3`,
      [date, shift, line]
    );

    if (!plan.rows.length) {
      plan = await pool.query(
        `INSERT INTO schedule_plans (plan_date, shift, line, created_by, status)
         VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
        [date, shift, line, user.id]
      );
    }

    const planId = plan.rows[0].id;

    // Get assignments with operator and machine details
    const assignments = await pool.query(`
      SELECT a.*,
        u.name AS operator_name, u.emp_no, u.role AS operator_role, u.dedicated_line AS operator_line,
        m.name AS machine_name, m.attention_level, m.max_operators, m.line AS machine_line,
        mt.name AS machine_type, mt.id AS machine_type_id
      FROM assignments a
      JOIN users u ON u.id = a.operator_id
      JOIN machines m ON m.id = a.machine_id
      JOIN machine_types mt ON mt.id = m.machine_type_id
      WHERE a.plan_id = $1
      ORDER BY m.id, u.name
    `, [planId]);

    res.json({ plan: plan.rows[0], assignments: assignments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const assignOperator = async (req, res) => {
  try {
    const { planId } = req.params;
    const { machineId, operatorId, confirmOverload } = req.body;

    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });
    if (['approved','rejected'].includes(plan.rows[0].status) && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Cannot modify an approved or rejected plan' });
    }

    // Technician line guard (admins can bypass)
    if (req.user.role === 'technician' && req.user.dedicated_line !== plan.rows[0].line) {
      return res.status(403).json({ error: 'You can only plan your own line' });
    }

    const machine = await pool.query(
      `SELECT m.*, mt.id AS type_id FROM machines m JOIN machine_types mt ON mt.id = m.machine_type_id WHERE m.id = $1`,
      [machineId]
    );
    if (!machine.rows.length) return res.status(404).json({ error: 'Machine not found' });

    const operator = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [operatorId]);
    if (!operator.rows.length) return res.status(404).json({ error: 'Operator not found' });

    const m = machine.rows[0];
    const op = operator.rows[0];

    // Cross-shift block: operator cannot be in both shifts same day
    const otherShift = plan.rows[0].shift === 'day' ? 'night' : 'day';
    const crossShift = await pool.query(`
      SELECT a.id FROM assignments a
      JOIN schedule_plans sp ON sp.id = a.plan_id
      WHERE a.operator_id = $1 AND sp.plan_date = $2 AND sp.shift = $3
    `, [operatorId, plan.rows[0].plan_date, otherShift]);
    if (crossShift.rows.length) {
      return res.status(400).json({ error: `Operator is already assigned to the ${otherShift} shift. Cannot assign to both shifts.` });
    }

    // Capability check
    const isTechOrEng = ['technician','engineer','admin'].includes(op.role);
    if (!isTechOrEng) {
      const capable = await pool.query(
        'SELECT id FROM operator_capabilities WHERE operator_id = $1 AND machine_type_id = $2',
        [operatorId, m.type_id]
      );
      if (!capable.rows.length) {
        return res.status(400).json({
          error: 'Operator is not certified for this machine type',
          code: 'NOT_CAPABLE'
        });
      }
    }

    // Capacity check
    const currentOps = await pool.query(
      'SELECT id FROM assignments WHERE plan_id = $1 AND machine_id = $2',
      [planId, machineId]
    );
    if (currentOps.rows.length >= m.max_operators) {
      return res.status(400).json({ error: 'Machine is at full capacity' });
    }

    // Duplicate check
    const duplicate = await pool.query(
      'SELECT id FROM assignments WHERE plan_id = $1 AND machine_id = $2 AND operator_id = $3',
      [planId, machineId, operatorId]
    );
    if (duplicate.rows.length) {
      return res.status(409).json({ error: 'Operator already assigned to this machine' });
    }

    // Load score check
    const currentAssignments = await pool.query(`
      SELECT m.attention_level FROM assignments a
      JOIN machines m ON m.id = a.machine_id
      JOIN schedule_plans sp ON sp.id = a.plan_id
      WHERE a.operator_id = $1 AND sp.plan_date = $2 AND sp.shift = $3
    `, [operatorId, plan.rows[0].plan_date, plan.rows[0].shift]);

    const currentLoad = currentAssignments.rows.reduce((sum, r) => sum + (ATTN_WEIGHT[r.attention_level] || 0), 0);
    const newLoad = currentLoad + (ATTN_WEIGHT[m.attention_level] || 0);
    const isOverload = newLoad > 1.0001;

    if (isOverload && !confirmOverload) {
      return res.status(400).json({
        error: 'Operator will be overloaded',
        code: 'OVERLOAD_CONFIRM_REQUIRED',
        currentLoad: Math.round(currentLoad * 10) / 10,
        newLoad: Math.round(newLoad * 10) / 10,
      });
    }

    // Cross-line transfer check
    // Allow transfers for technicians (requesting from pool), engineers, and admins
    const isTransfer = op.dedicated_line && op.dedicated_line !== plan.rows[0].line;
    if (isTransfer && !['technician','engineer','admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This role cannot transfer operators across lines' });
    }

    const result = await pool.query(`
      INSERT INTO assignments (plan_id, machine_id, operator_id, load_score, is_overload, is_transfer, transfer_from_line)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [planId, machineId, operatorId, Math.round(newLoad * 100) / 100, isOverload, isTransfer, isTransfer ? op.dedicated_line : null]);

    if (isTransfer) {
      await pool.query(`
        INSERT INTO operator_transfers (plan_id, operator_id, from_line, to_line, approved_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [planId, operatorId, op.dedicated_line, plan.rows[0].line, req.user.id]);
    }

    await auditLog(req.user.id, 'OPERATOR_ASSIGNED', 'assignment', result.rows[0].id, null,
      { machineId, operatorId, isOverload, isTransfer }, req.ip);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const removeAssignment = async (req, res) => {
  try {
    const { planId, assignmentId } = req.params;
    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });
    if (['approved'].includes(plan.rows[0].status) && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Cannot modify an approved plan' });
    }
    const del = await pool.query('DELETE FROM assignments WHERE id = $1 AND plan_id = $2 RETURNING *', [assignmentId, planId]);
    if (!del.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    await auditLog(req.user.id, 'OPERATOR_REMOVED', 'assignment', assignmentId, del.rows[0], null, req.ip);
    res.json({ message: 'Assignment removed' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const submitPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });
    if (plan.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Only draft plans can be submitted' });
    }
    const result = await pool.query(
      `UPDATE schedule_plans SET status = 'submitted', submitted_at = NOW() WHERE id = $1 RETURNING *`,
      [planId]
    );
    await auditLog(req.user.id, 'PLAN_SUBMITTED', 'plan', planId, null, null, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const reviewPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { action, note } = req.body;
    if (!['approved','rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approved or rejected' });
    }
    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });
    if (plan.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted plans can be reviewed' });
    }
    const result = await pool.query(
      `UPDATE schedule_plans SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = NOW()
       WHERE id = $4 RETURNING *`,
      [action, req.user.id, note || null, planId]
    );
    await auditLog(req.user.id, `PLAN_${action.toUpperCase()}`, 'plan', planId, null, { note }, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getPlans = async (req, res) => {
  try {
    const { date, line, status } = req.query;
    const user = req.user;
    let query = `
      SELECT sp.*,
        u.name AS created_by_name,
        r.name AS reviewed_by_name
      FROM schedule_plans sp
      LEFT JOIN users u ON u.id = sp.created_by
      LEFT JOIN users r ON r.id = sp.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    if (date) { params.push(date); query += ` AND sp.plan_date = $${params.length}`; }
    if (line) { params.push(line); query += ` AND sp.line = $${params.length}`; }
    else if (user.role === 'technician') { params.push(user.dedicated_line); query += ` AND sp.line = $${params.length}`; }
    if (status) { params.push(status); query += ` AND sp.status = $${params.length}`; }
    query += ' ORDER BY sp.plan_date DESC, sp.line, sp.shift';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [users, machines, plans, assignments] = await Promise.all([
      pool.query(`SELECT role, COUNT(*)::int FROM users WHERE is_active=true GROUP BY role`),
      pool.query(`SELECT COUNT(*)::int AS total FROM machines WHERE is_active=true`),
      pool.query(`SELECT status, COUNT(*)::int FROM schedule_plans WHERE plan_date=$1 GROUP BY status`, [today]),
      pool.query(`SELECT COUNT(DISTINCT operator_id)::int AS active_ops FROM assignments a JOIN schedule_plans sp ON sp.id=a.plan_id WHERE sp.plan_date=$1`, [today]),
    ]);
    const userCounts = {};
    users.rows.forEach(r => { userCounts[r.role] = r.count; });
    const planCounts = {};
    plans.rows.forEach(r => { planCounts[r.status] = r.count; });
    res.json({
      users: userCounts,
      machines: machines.rows[0],
      plans: planCounts,
      activeOperatorsToday: assignments.rows[0]?.active_ops || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const engineerApprove = async (req, res) => {
  try {
    const { planId } = req.params;
    const { action } = req.body;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approved or rejected' });
    }

    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });
    
    if (plan.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted plans can be engineer approved' });
    }

    // Check if user is the assigned engineer for this line
    const line = await pool.query(
      'SELECT assigned_engineer_id FROM production_lines WHERE line_code = $1',
      [plan.rows[0].line]
    );

    if (!line.rows.length || line.rows[0].assigned_engineer_id !== req.user.id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the assigned engineer can approve this plan' });
      }
    }

    const newStatus = action === 'approved' ? 'engineer_approved' : 'rejected';
    const result = await pool.query(
      `UPDATE schedule_plans SET status = $1, engineer_approved_by = $2, engineer_approved_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newStatus, req.user.id, planId]
    );

    await auditLog(req.user.id, `PLAN_ENGINEER_${action.toUpperCase()}`, 'plan', planId, null, null, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const cancelApproval = async (req, res) => {
  try {
    const { planId } = req.params;

    // Only admins can cancel approvals
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can cancel approvals' });
    }

    const plan = await pool.query('SELECT * FROM schedule_plans WHERE id = $1', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Plan not found' });

    if (!['engineer_approved', 'approved'].includes(plan.rows[0].status)) {
      return res.status(400).json({ error: 'Cannot cancel approval for a plan in this status' });
    }

    const result = await pool.query(
      `UPDATE schedule_plans SET status = 'submitted', engineer_approved_by = NULL, engineer_approved_at = NULL
       WHERE id = $1 RETURNING *`,
      [planId]
    );

    await auditLog(req.user.id, 'PLAN_APPROVAL_CANCELLED', 'plan', planId, null, null, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getOrCreatePlan, assignOperator, removeAssignment, submitPlan, reviewPlan, engineerApprove, cancelApproval, getPlans, getDashboardStats };
