/**
 * File: src/routes/permissionsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin, requirePermission, getRolePerms, invalidatePermCache } = require('../core/authUtils');
const { query } = require('../core/db');

router.get('/settings/permissions', requirePermission('settings'), async (req, res) => {
  try {
    // Get all roles from DB and Defaults
    const dbRoles = await query("SELECT DISTINCT role FROM role_permissions", [], 'fetchall');
    const roles = new Set(dbRoles.map(r => r.role.toUpperCase()));
    // Add default roles from authUtils if needed
    
    const allPerms = await query("SELECT DISTINCT permission FROM role_permissions", [], 'fetchall');
    const permsList = allPerms.map(p => p.permission);

    // Get current permissions for each role
    const roleCurrent = {};
    for (const role of roles) {
      const rows = await query("SELECT permission FROM role_permissions WHERE role=? AND enabled=1", [role], 'fetchall');
      roleCurrent[role] = rows ? rows.map(r => r.permission) : [];
    }

    res.render('settings/permissions', {
      user: req.session.user,
      roles: Array.from(roles).sort(),
      all_perms: permsList.sort(),
      role_current: roleCurrent,
      current_role: req.query.role || (Array.from(roles)[0] || 'HR')
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.post('/settings/permissions', requirePermission('settings'), async (req, res) => {
  const selectedRoles = req.body.role ? (Array.isArray(req.body.role) ? req.body.role : [req.body.role]) : [];
  const permsSelected = req.body.perm ? (Array.isArray(req.body.perm) ? req.body.perm : [req.body.perm]) : [];

  for (const role of selectedRoles) {
    await query("DELETE FROM role_permissions WHERE role=?", [role.toUpperCase()], 'commit');
    for (const p of permsSelected) {
      await query("INSERT INTO role_permissions (role, permission, enabled) VALUES (?, ?, 1)", [role.toUpperCase(), p], 'commit');
    }
  }
  
  invalidatePermCache();
  req.flash('success', 'Permissions saved successfully.');
  res.redirect(`/settings/permissions?role=${selectedRoles[0]}`);
});

module.exports = router;