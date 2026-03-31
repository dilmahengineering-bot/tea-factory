const pool = require('./pool');
const bcrypt = require('bcryptjs');

const seed = async () => {
  const client = await pool.connect();
  try {
    // Check existing columns
    const tableInfo = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'production_lines' ORDER BY ordinal_position;
    `);
    console.log('📋 Existing columns in production_lines:', tableInfo.rows.map(r => r.column_name));
    
    // Add assigned_engineer_id column if it doesn't exist
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'production_lines' AND column_name = 'assigned_engineer_id'
      );
    `);
    
    if (!colExists.rows[0].exists) {
      console.log('💾 Adding assigned_engineer_id column...');
      await client.query(`
        ALTER TABLE production_lines
        ADD COLUMN assigned_engineer_id UUID REFERENCES users(id);
      `);
      console.log('✅ Added assigned_engineer_id column successfully');
    } else {
      console.log('ℹ️ assigned_engineer_id column already exists');
    }
    
    await client.query('BEGIN');

    // Machine types
    const typeRows = await client.query(`
      INSERT INTO machine_types (name, description, is_system) VALUES
        ('Tea bagging',  'Primary tea bag forming and filling', true),
        ('Packing',      'Box and carton packing',              true),
        ('Labelling',    'Label application and coding',        true),
        ('Sealing',      'Heat and vacuum sealing',             true)
      ON CONFLICT (name) DO NOTHING
      RETURNING id, name;
    `);

    const typeMap = {};
    const allTypes = await client.query(`SELECT id, name FROM machine_types`);
    allTypes.rows.forEach(r => { typeMap[r.name] = r.id; });

    // Hash password for all users: Password@123
    const hash = await bcrypt.hash('Password@123', 12);

    // Users
    const userResult = await client.query(`
      INSERT INTO users (emp_no, name, email, password_hash, role, dedicated_line, is_active) VALUES
        ('ADM001', 'Kavindu Rajapaksha',  'kavindu@teafactory.lk',  '${hash}', 'admin',      NULL, true),
        ('ENG001', 'Dinesh Kumara',       'dinesh@teafactory.lk',   '${hash}', 'engineer',   NULL, true),
        ('ENG002', 'Shamali Perera',      'shamali@teafactory.lk',  '${hash}', 'engineer',   NULL, true),
        ('TC001',  'Priya Jayawardena',   'priya@teafactory.lk',    '${hash}', 'technician', 'L1', true),
        ('TC002',  'Suresh Madushan',     'suresh@teafactory.lk',   '${hash}', 'technician', 'L2', true),
        ('TC003',  'Dilani Nilmini',      'dilani@teafactory.lk',   '${hash}', 'technician', 'L3', true),
        ('OP001',  'Ashan Priyantha',     NULL,                     '${hash}', 'operator',   'L1', true),
        ('OP002',  'Malini Sandamali',    NULL,                     '${hash}', 'operator',   'L1', true),
        ('OP003',  'Ruvini Kumari',       NULL,                     '${hash}', 'operator',   'L1', true),
        ('OP004',  'Chamara Bandara',     NULL,                     '${hash}', 'operator',   'L2', true),
        ('OP005',  'Nimal Wijesinghe',    NULL,                     '${hash}', 'operator',   'L2', true),
        ('OP006',  'Sandun Tharaka',      NULL,                     '${hash}', 'operator',   'L2', true),
        ('OP007',  'Iresha Madhushani',   NULL,                     '${hash}', 'operator',   'L3', true),
        ('OP008',  'Tharaka Lakshan',     NULL,                     '${hash}', 'operator',   'L3', true)
      ON CONFLICT (emp_no) DO UPDATE SET is_active = true
      RETURNING id, emp_no, role;
    `);

    const userMap = {};
    const allUsers = await client.query(`SELECT id, emp_no, role, dedicated_line FROM users`);
    allUsers.rows.forEach(r => { userMap[r.emp_no] = r; });

    // Machines - 12 lines concept simplified to 3 demo lines
    await client.query(`
      INSERT INTO machines (id, name, machine_type_id, line, attention_level, max_operators) VALUES
        ('M-101', 'Tea bagger A',  '${typeMap['Tea bagging']}', 'L1', 'HIGH', 1),
        ('M-102', 'Tea bagger B',  '${typeMap['Tea bagging']}', 'L1', 'HIGH', 1),
        ('M-103', 'Packer 1',      '${typeMap['Packing']}',     'L1', 'MED',  2),
        ('M-104', 'Labeller 1',    '${typeMap['Labelling']}',   'L1', 'LOW',  3),
        ('M-105', 'Sealer 1',      '${typeMap['Sealing']}',     'L1', 'LOW',  3),
        ('M-201', 'Tea bagger C',  '${typeMap['Tea bagging']}', 'L2', 'HIGH', 1),
        ('M-202', 'Tea bagger D',  '${typeMap['Tea bagging']}', 'L2', 'HIGH', 1),
        ('M-203', 'Packer 2',      '${typeMap['Packing']}',     'L2', 'MED',  2),
        ('M-204', 'Sealer 2',      '${typeMap['Sealing']}',     'L2', 'LOW',  3),
        ('M-301', 'Tea bagger E',  '${typeMap['Tea bagging']}', 'L3', 'HIGH', 1),
        ('M-302', 'Packer 3',      '${typeMap['Packing']}',     'L3', 'MED',  2),
        ('M-303', 'Labeller 2',    '${typeMap['Labelling']}',   'L3', 'LOW',  3)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Operator capabilities
    const capData = [
      ['OP001', ['Tea bagging', 'Packing']],
      ['OP002', ['Packing', 'Labelling']],
      ['OP003', ['Tea bagging', 'Sealing']],
      ['OP004', ['Tea bagging', 'Packing', 'Labelling']],
      ['OP005', ['Sealing', 'Labelling']],
      ['OP006', ['Packing', 'Sealing']],
      ['OP007', ['Tea bagging', 'Packing']],
      ['OP008', ['Labelling', 'Sealing']],
    ];

    for (const [empNo, types] of capData) {
      const user = userMap[empNo];
      if (!user) continue;
      for (const typeName of types) {
        const typeId = typeMap[typeName];
        if (!typeId) continue;
        await client.query(`
          INSERT INTO operator_capabilities (operator_id, machine_type_id)
          VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [user.id, typeId]);
      }
    }

    // Assign engineers to production lines
    const eng1 = userMap['ENG001'];
    const eng2 = userMap['ENG002'];
    if (eng1 || eng2) {
      await client.query(`
        UPDATE production_lines SET assigned_engineer_id = $1 WHERE line_code = 'L1'
      `, [eng1?.id]);
      
      await client.query(`
        UPDATE production_lines SET assigned_engineer_id = $1 WHERE line_code = 'L2'
      `, [eng2?.id]);
      
      if (eng1) {
        await client.query(`
          UPDATE production_lines SET assigned_engineer_id = $1 WHERE line_code = 'L3'
        `, [eng1.id]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed');
    console.log('');
    console.log('Demo login credentials (all users):');
    console.log('  Admin:      emp_no=ADM001  or email: kavindu@teafactory.lk');
    console.log('  Engineer:   emp_no=ENG001  or email: dinesh@teafactory.lk (assigned to L1, L3)');
    console.log('  Engineer:   emp_no=ENG002  or email: shamali@teafactory.lk (assigned to L2)');
    console.log('  Technician: emp_no=TC001   or email: priya@teafactory.lk');
    console.log('  Operator:   emp_no=OP001   (no email - login by emp_no only)');
    console.log('  Password:   Password@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(console.error);
