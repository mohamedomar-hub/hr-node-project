const { query } = require('./src/core/db');

async function checkPermissions() {
  try {
    const roles = ['PAYROLL & PERSONAL SPECIALIST', 'HR SPECIALIST', 'SENIOR TALENT ACQUISITION', 'COMPENSATION & BENEFITS SPECIALIST'];
    for (const role of roles) {
      console.log(`\n=== ${role} ===`);
      const rows = await query('SELECT permission FROM role_permissions WHERE role = ? AND enabled = 1 ORDER BY permission', [role], 'fetchall');
      if (rows && rows.length > 0) {
        rows.forEach(row => console.log(`- ${row.permission}`));
      } else {
        console.log('No permissions found in DB');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkPermissions();