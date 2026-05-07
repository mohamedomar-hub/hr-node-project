/**
 * File: src/routes/settingsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requirePermission, invalidatePermissionCache } = require('../core/authUtils');
const { query } = require('../core/db');
const movementsService = require('../core/movementsService');
const employeeService = require('../core/employeeService');

// Settings Home
router.get('/settings', requirePermission('settings'), async (req, res) => {
  const lastExports = await query(
    "SELECT kind, MAX(created_at) AS last_at FROM export_logs GROUP BY kind",
    [], 'fetchall'
  );
  const exportsMap = {};
  if (lastExports) lastExports.forEach(r => exportsMap[r.kind] = r.last_at);
  res.render('settings/settings', { last_exports: exportsMap });
});

// Clear Data
router.post('/settings/clear', requirePermission('settings'), async (req, res) => {
  const target = req.body.target;
  const allowed = {
    'expenses': 'DELETE FROM expenses',
    'notifications': 'DELETE FROM notifications',
    'idp_reports': 'DELETE FROM idb_reports',
    'self_dev': 'DELETE FROM self_development',
    'certificates': 'DELETE FROM certificates'
  };
  if (allowed[target]) {
    await query(allowed[target], [], 'commit');
    req.flash('success', `Cleared ${target} data.`);
  } else {
    req.flash('danger', 'Target not allowed.');
  }
  res.redirect('/settings');
});

// Export Data
router.get('/settings/export/:kind', requirePermission('settings'), async (req, res) => {
  const { kind } = req.params;
  // Logic for export (similar to Flask)
  res.download(`backup_${kind}_${Date.now()}.xlsx`);
});

// Permissions Management
router.get('/settings/permissions', requirePermission('settings'), async (req, res) => {
  const roles = await query("SELECT DISTINCT role FROM role_permissions", [], 'fetchall');
  const allPerms = await query("SELECT DISTINCT permission FROM role_permissions", [], 'fetchall');
  
  const roleCurrent = {};
  for (const r of roles) {
    const perms = await query(
      "SELECT permission FROM role_permissions WHERE role=? AND enabled=1", 
      [r.role], 'fetchall'
    );
    roleCurrent[r.role] = perms.map(p => p.permission);
  }

  res.render('settings/permissions', {
    roles: roles.map(r => r.role),
    all_perms: allPerms.map(p => p.permission),
    role_current: roleCurrent,
    current_role: req.query.role || (roles[0]?.role || 'HR')
  });
});

router.post('/settings/permissions', requirePermission('settings'), async (req, res) => {
  const selectedRoles = Array.isArray(req.body.role) ? req.body.role : [req.body.role];
  const permsSelected = Array.isArray(req.body.perm) ? req.body.perm : [req.body.perm];

  for (const role of selectedRoles) {
    await query("DELETE FROM role_permissions WHERE role=?", [role.toUpperCase()], 'commit');
    for (const p of permsSelected) {
      await query(
        "INSERT INTO role_permissions (role, permission, enabled) VALUES (?, ?, 1)", 
        [role.toUpperCase(), p], 'commit'
      );
    }
  }
  invalidatePermissionCache();
  req.flash('success', 'Permissions saved.');
  res.redirect(`/settings/permissions?role=${selectedRoles[0]}`);
});

module.exports = router;