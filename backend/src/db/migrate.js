const pool = require('./pool');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔄 Starting migration...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        emp_no VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin','engineer','technician','operator')),
        dedicated_line VARCHAR(10),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS production_lines (
        id SERIAL PRIMARY KEY,
        line_code VARCHAR(10) UNIQUE NOT NULL,
        line_name VARCHAR(100) NOT NULL,
        location VARCHAR(150),
        capacity INTEGER DEFAULT 5,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
        assigned_engineer_id UUID REFERENCES users(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS machine_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        machine_type_id UUID NOT NULL REFERENCES machine_types(id),
        line VARCHAR(10) NOT NULL,
        attention_level VARCHAR(10) NOT NULL CHECK (attention_level IN ('HIGH','MED','LOW')),
        max_operators INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operator_capabilities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        machine_type_id UUID NOT NULL REFERENCES machine_types(id) ON DELETE CASCADE,
        granted_by UUID REFERENCES users(id),
        training_ref VARCHAR(100),
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(operator_id, machine_type_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_date DATE NOT NULL,
        shift VARCHAR(10) NOT NULL CHECK (shift IN ('day','night')),
        line VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','submitted','engineer_approved','approved','rejected')),
        created_by UUID NOT NULL REFERENCES users(id),
        engineer_approved_by UUID REFERENCES users(id),
        engineer_approved_at TIMESTAMPTZ,
        reviewed_by UUID REFERENCES users(id),
        review_note TEXT,
        submitted_at TIMESTAMPTZ,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plan_date, shift, line)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id UUID NOT NULL REFERENCES schedule_plans(id) ON DELETE CASCADE,
        machine_id VARCHAR(20) NOT NULL REFERENCES machines(id),
        operator_id UUID NOT NULL REFERENCES users(id),
        load_score NUMERIC(4,2),
        is_overload BOOLEAN DEFAULT false,
        is_transfer BOOLEAN DEFAULT false,
        transfer_from_line VARCHAR(10),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plan_id, machine_id, operator_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operator_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id UUID NOT NULL REFERENCES schedule_plans(id),
        operator_id UUID NOT NULL REFERENCES users(id),
        from_line VARCHAR(10) NOT NULL,
        to_line VARCHAR(10) NOT NULL,
        reason TEXT,
        approved_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS common_pool_operators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        offered_by_plan_id UUID NOT NULL REFERENCES schedule_plans(id),
        offered_by UUID NOT NULL REFERENCES users(id),
        allocation_date DATE NOT NULL,
        shift VARCHAR(10) NOT NULL,
        is_allocated BOOLEAN DEFAULT false,
        allocated_to_plan_id UUID REFERENCES schedule_plans(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(operator_id, allocation_date, shift)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operator_leaves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        leave_date DATE NOT NULL,
        leave_type VARCHAR(50) NOT NULL CHECK (leave_type IN ('sick','vacation','emergency','other')),
        shift VARCHAR(10) CHECK (shift IN ('day','night','both')),
        reason TEXT,
        approved_by UUID REFERENCES users(id),
        approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(operator_id, leave_date, shift)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(100),
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_line ON users(dedicated_line);
      CREATE INDEX IF NOT EXISTS idx_machines_line ON machines(line);
      CREATE INDEX IF NOT EXISTS idx_plans_date ON schedule_plans(plan_date, shift, line);
      CREATE INDEX IF NOT EXISTS idx_assignments_plan ON assignments(plan_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_operator ON assignments(operator_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leaves_operator ON operator_leaves(operator_id);
      CREATE INDEX IF NOT EXISTS idx_leaves_date ON operator_leaves(leave_date);
      CREATE INDEX IF NOT EXISTS idx_leaves_status ON operator_leaves(approval_status);
    `);

    // Updated_at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_users_updated ON users;
      CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_plans_updated ON schedule_plans;
      CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON schedule_plans
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_production_lines_updated ON production_lines;
      CREATE TRIGGER trg_production_lines_updated BEFORE UPDATE ON production_lines
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_leaves_updated ON operator_leaves;
      CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON operator_leaves
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    // Add assigned_engineer_id column if it doesn't exist
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'production_lines' AND column_name = 'assigned_engineer_id'
      );
    `);
    
    console.log('Column exists check result:', colExists.rows[0]);
    
    if (!colExists.rows[0].exists) {
      console.log('💾 Adding assigned_engineer_id column...');
      await client.query(`
        ALTER TABLE production_lines
        ADD COLUMN assigned_engineer_id UUID REFERENCES users(id);
      `);
      console.log('✅ Added assigned_engineer_id column');
    } else {
      console.log('ℹ️ assigned_engineer_id column already exists');
    }

    // Initialize default production lines if they don't exist
    await client.query(`
      INSERT INTO production_lines (line_code, line_name, location, capacity, status)
      VALUES 
        ('L1', 'Line 1', 'Floor 1', 5, 'active'),
        ('L2', 'Line 2', 'Floor 1', 5, 'active'),
        ('L3', 'Line 3', 'Floor 2', 5, 'active')
      ON CONFLICT (line_code) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
