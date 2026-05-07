const { getRolePerms, invalidatePermCache } = require('./src/core/authUtils');

async function updatePermissions() {
  try {
    const roles = ['PAYROLL & PERSONAL SPECIALIST', 'HR SPECIALIST', 'SENIOR TALENT ACQUISITION', 'COMPENSATION & BENEFITS SPECIALIST'];

    for (const role of roles) {
      console.log(`\nUpdating permissions for: ${role}`);
      const perms = await getRolePerms(role);
      console.log(`Permissions: ${perms.join(', ')}`);
    }

    invalidatePermCache();
    console.log('\nPermissions cache invalidated.');
  } catch (error) {
    console.error('Error updating permissions:', error);
  }
}

updatePermissions();