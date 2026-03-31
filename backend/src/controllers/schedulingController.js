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

const getOperatorDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const operatorId = req.user.id;

    const [todayAssignments, upcomingAssignments, capabilities, recentHistory, leaveStatus] = await Promise.all([
      // Today's assignments with machine & plan details
      pool.query(`
        SELECT a.id, a.load_score, a.is_overload, a.is_transfer, a.transfer_from_line,
               m.id AS machine_id, m.name AS machine_name, m.line, m.attention_level,
               mt.name AS machine_type,
               sp.shift, sp.status AS plan_status, sp.plan_date
        FROM assignments a
        JOIN machines m ON m.id = a.machine_id
        JOIN machine_types mt ON mt.id = m.machine_type_id
        JOIN schedule_plans sp ON sp.id = a.plan_id
        WHERE a.operator_id = $1 AND sp.plan_date = $2
        ORDER BY sp.shift, m.line, m.name
      `, [operatorId, today]),

      // Upcoming assignments (next 7 days)
      pool.query(`
        SELECT a.id, a.load_score, a.is_overload, a.is_transfer,
               m.id AS machine_id, m.name AS machine_name, m.line, m.attention_level,
               mt.name AS machine_type,
               sp.shift, sp.status AS plan_status, sp.plan_date
        FROM assignments a
        JOIN machines m ON m.id = a.machine_id
        JOIN machine_types mt ON mt.id = m.machine_type_id
        JOIN schedule_plans sp ON sp.id = a.plan_id
        WHERE a.operator_id = $1 AND sp.plan_date > $2 AND sp.plan_date <= $2::date + INTERVAL '7 days'
        ORDER BY sp.plan_date, sp.shift, m.line, m.name
      `, [operatorId, today]),

      // Operator capabilities
      pool.query(`
        SELECT mt.name AS machine_type, oc.granted_at
        FROM operator_capabilities oc
        JOIN machine_types mt ON mt.id = oc.machine_type_id
        WHERE oc.operator_id = $1
        ORDER BY mt.name
      `, [operatorId]),

      // Last 7 days assignment history
      pool.query(`
        SELECT sp.plan_date, sp.shift, m.name AS machine_name, m.line, 
               a.load_score, sp.status AS plan_status
        FROM assignments a
        JOIN machines m ON m.id = a.machine_id
        JOIN schedule_plans sp ON sp.id = a.plan_id
        WHERE a.operator_id = $1 AND sp.plan_date >= $2::date - INTERVAL '7 days' AND sp.plan_date < $2::date
        ORDER BY sp.plan_date DESC, sp.shift
      `, [operatorId, today]),

      // Active/upcoming leave
      pool.query(`
        SELECT leave_date, leave_type, shift, approval_status
        FROM operator_leaves
        WHERE operator_id = $1 AND leave_date >= $2
        ORDER BY leave_date LIMIT 5
      `, [operatorId, today]),
    ]);

    // Calculate total load for today
    const totalLoad = todayAssignments.rows.reduce((sum, a) => sum + (parseFloat(a.load_score) || 0), 0);

    res.json({
      today: {
        assignments: todayAssignments.rows,
        totalLoad: Math.round(totalLoad * 100) / 100,
        machineCount: todayAssignments.rows.length,
      },
      upcoming: upcomingAssignments.rows,
      capabilities: capabilities.rows,
      recentHistory: recentHistory.rows,
      leaves: leaveStatus.rows,
    });
  } catch (err) {
    console.error('Operator dashboard error:', err);
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

const getAdminDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      lineDetails, lineMachines, lineOperators, lineAssignments,
      todayLeaves, weekLeaves, planStatusData, weeklyTrend,
      userCounts, machinesByType
    ] = await Promise.all([
      // Production lines
      pool.query(`
        SELECT pl.id, pl.line_code, pl.line_name, pl.capacity, pl.status,
               u.name AS engineer_name
        FROM production_lines pl
        LEFT JOIN users u ON u.id = pl.assigned_engineer_id
        ORDER BY pl.line_code
      `),

      // Machines per line
      pool.query(`
        SELECT m.line, COUNT(*)::int AS machine_count,
               SUM(m.max_operators)::int AS total_capacity
        FROM machines m WHERE m.is_active = true
        GROUP BY m.line
      `),

      // Operators per line (dedicated)
      pool.query(`
        SELECT dedicated_line AS line, COUNT(*)::int AS operator_count
        FROM users WHERE role = 'operator' AND is_active = true AND dedicated_line IS NOT NULL
        GROUP BY dedicated_line
      `),

      // Today's assignments per line with load
      pool.query(`
        SELECT sp.line,
               COUNT(DISTINCT a.operator_id)::int AS assigned_operators,
               COALESCE(SUM(a.load_score), 0)::numeric(10,2) AS total_load,
               COUNT(a.id)::int AS assignment_count,
               COUNT(CASE WHEN a.is_overload THEN 1 END)::int AS overload_count,
               COUNT(CASE WHEN a.is_transfer THEN 1 END)::int AS transfer_count
        FROM schedule_plans sp
        LEFT JOIN assignments a ON a.plan_id = sp.id
        WHERE sp.plan_date = $1
        GROUP BY sp.line
      `, [today]),

      // Today's leaves
      pool.query(`
        SELECT u.dedicated_line AS line, COUNT(*)::int AS leave_count
        FROM operator_leaves ol
        JOIN users u ON u.id = ol.operator_id
        WHERE ol.leave_date = $1 AND ol.approval_status IN ('approved', 'pending')
        GROUP BY u.dedicated_line
      `, [today]),

      // This week's leaves by day
      pool.query(`
        SELECT ol.leave_date, COUNT(*)::int AS leave_count, ol.leave_type
        FROM operator_leaves ol
        WHERE ol.leave_date >= $1::date AND ol.leave_date <= $1::date + INTERVAL '6 days'
          AND ol.approval_status IN ('approved', 'pending')
        GROUP BY ol.leave_date, ol.leave_type
        ORDER BY ol.leave_date
      `, [today]),

      // Plan status breakdown for today
      pool.query(`
        SELECT line, shift, status FROM schedule_plans WHERE plan_date = $1 ORDER BY line, shift
      `, [today]),

      // Weekly assignment trend (last 7 days)
      pool.query(`
        SELECT sp.plan_date,
               COUNT(DISTINCT a.operator_id)::int AS operators_assigned,
               COUNT(a.id)::int AS total_assignments,
               COALESCE(AVG(a.load_score), 0)::numeric(4,2) AS avg_load
        FROM schedule_plans sp
        LEFT JOIN assignments a ON a.plan_id = sp.id
        WHERE sp.plan_date >= $1::date - INTERVAL '6 days' AND sp.plan_date <= $1::date
        GROUP BY sp.plan_date
        ORDER BY sp.plan_date
      `, [today]),

      // User counts
      pool.query(`SELECT role, COUNT(*)::int AS count FROM users WHERE is_active = true GROUP BY role`),

      // Machines by type
      pool.query(`
        SELECT mt.name AS machine_type, COUNT(m.id)::int AS count
        FROM machines m JOIN machine_types mt ON mt.id = m.machine_type_id
        WHERE m.is_active = true GROUP BY mt.name ORDER BY count DESC
      `),
    ]);

    // Build maps
    const machineMap = {};
    lineMachines.rows.forEach(r => { machineMap[r.line] = r; });
    const operatorMap = {};
    lineOperators.rows.forEach(r => { operatorMap[r.line] = r.operator_count; });
    const assignmentMap = {};
    lineAssignments.rows.forEach(r => { assignmentMap[r.line] = r; });
    const leaveMap = {};
    todayLeaves.rows.forEach(r => { leaveMap[r.line] = r.leave_count; });

    // Build line summary
    const lines = lineDetails.rows.map(line => {
      const mc = machineMap[line.line_code] || { machine_count: 0, total_capacity: 0 };
      const opCount = operatorMap[line.line_code] || 0;
      const asg = assignmentMap[line.line_code] || { assigned_operators: 0, total_load: 0, assignment_count: 0, overload_count: 0, transfer_count: 0 };
      const leaves = leaveMap[line.line_code] || 0;
      const availableOps = opCount - leaves;
      const loadGap = mc.total_capacity - asg.assignment_count;

      return {
        lineCode: line.line_code,
        lineName: line.line_name,
        status: line.status,
        capacity: line.capacity,
        engineerName: line.engineer_name,
        machines: mc.machine_count,
        totalMachineCapacity: mc.total_capacity,
        totalOperators: opCount,
        availableOperators: availableOps > 0 ? availableOps : 0,
        assignedOperators: asg.assigned_operators,
        totalLoad: parseFloat(asg.total_load),
        assignmentCount: asg.assignment_count,
        overloadCount: asg.overload_count,
        transferCount: asg.transfer_count,
        leavesToday: leaves,
        loadGap: loadGap,
      };
    });

    // User summary
    const userSummary = {};
    userCounts.rows.forEach(r => { userSummary[r.role] = r.count; });

    // Plan status for today
    const planStatus = planStatusData.rows;

    res.json({
      lines,
      planStatus,
      weeklyTrend: weeklyTrend.rows,
      weekLeaves: weekLeaves.rows,
      machinesByType: machinesByType.rows,
      users: userSummary,
      totals: {
        totalLines: lines.length,
        totalMachines: lines.reduce((s, l) => s + l.machines, 0),
        totalOperators: lines.reduce((s, l) => s + l.totalOperators, 0),
        totalAssigned: lines.reduce((s, l) => s + l.assignedOperators, 0),
        totalLeaves: lines.reduce((s, l) => s + l.leavesToday, 0),
        totalLoadGap: lines.reduce((s, l) => s + l.loadGap, 0),
      },
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getOrCreatePlan, assignOperator, removeAssignment, submitPlan, reviewPlan, engineerApprove, cancelApproval, getPlans, getDashboardStats, getOperatorDashboard, getAdminDashboard };
