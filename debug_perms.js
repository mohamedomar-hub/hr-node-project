/**
 * Debug script to verify permissions for specific roles
 * شغّل: node debug_perms.js
 */
const { getRolePerms, getUserRole, ROLE_PERMISSIONS, EXTRA_ROLES } = require('./src/core/authUtils');

async function debugPermissions() {
  console.log('\n=== DEBUGGING PERMISSIONS ===\n');

  const roles = [
    'PAYROLL & PERSONAL SPECIALIST',
    'SENIOR TALENT ACQUISITION',
    'COMPENSATION & BENEFITS SPECIALIST'
  ];

  for (const role of roles) {
    console.log(`\n📌 Role: ${role}`);
    console.log('─'.repeat(60));

    // Check ROLE_PERMISSIONS
    const defaultPerms = ROLE_PERMISSIONS[role] || [];
    console.log(`✓ ROLE_PERMISSIONS count: ${defaultPerms.length}`);
    if (defaultPerms.length > 0) {
      console.log(`  Permissions: ${defaultPerms.join(', ')}`);
    }

    // Check EXTRA_ROLES
    const extraPerms = EXTRA_ROLES[role] || [];
    console.log(`✓ EXTRA_ROLES count: ${extraPerms.length}`);
    if (extraPerms.length > 0) {
      console.log(`  Permissions: ${extraPerms.join(', ')}`);
    }

    // Get actual permissions from getRolePerms (includes DB + defaults)
    try {
      const actualPerms = await getRolePerms(role);
      console.log(`✓ getRolePerms() count: ${actualPerms.length}`);
      console.log(`  Permissions: ${actualPerms.join(', ')}`);
    } catch (error) {
      console.error(`❌ Error fetching permissions: ${error.message}`);
    }
  }

  console.log('\n=== END DEBUG ===\n');
  process.exit(0);
}

debugPermissions();
