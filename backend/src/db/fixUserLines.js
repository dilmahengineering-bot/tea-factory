const pool = require('./pool');

/**
 * Migration script to fix users with incorrect dedicated_line values
 * Converts line_name to line_code for existing users
 */
const fixUserLines = async () => {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting user line code migration...');
    
    // Get all users with dedicated_line set
    const users = await client.query(`
      SELECT id, emp_no, name, dedicated_line FROM users WHERE dedicated_line IS NOT NULL ORDER BY dedicated_line
    `);
    
    console.log(`\nFound ${users.rows.length} users with dedicated_line set:`);
    console.table(users.rows);
    
    // Get all production lines
    const lines = await client.query(`
      SELECT line_code, line_name FROM production_lines ORDER BY line_code
    `);
    
    console.log(`\nProduction lines in database:`);
    console.table(lines.rows);
    
    // Map of line_name to line_code
    const lineMapping = {};
    lines.rows.forEach(l => {
      lineMapping[l.line_name] = l.line_code;
    });
    
    console.log('\nLine mapping (name -> code):', lineMapping);
    
    let updated = 0;
    const updatedUsers = [];
    
    await client.query('BEGIN');
    
    for (const user of users.rows) {
      const currentValue = user.dedicated_line;
      const correctedValue = lineMapping[currentValue] || currentValue;
      
      if (currentValue !== correctedValue) {
        console.log(`  ✏️  User ${user.emp_no} (${user.name}): "${currentValue}" -> "${correctedValue}"`);
        await client.query(
          'UPDATE users SET dedicated_line = $1 WHERE id = $2',
          [correctedValue, user.id]
        );
        updatedUsers.push({ name: user.name, old: currentValue, new: correctedValue });
        updated++;
      }
    }
    
    await client.query('COMMIT');
    console.log(`\n✅ Migration completed: ${updated} users updated`);
    if (updatedUsers.length > 0) {
      console.log('\nUpdated users:');
      console.table(updatedUsers);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

fixUserLines().catch(console.error);
