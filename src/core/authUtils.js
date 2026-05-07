/**
 * File: src/core/authUtils.js
 * Description: Complete permission system ported from Flask HR System
 */

const bcrypt = require('bcrypt');
const { query } = require('./db');

// In-memory permission cache
const permissionCache = new Map();

/**
 * Default Role-Permission Mapping (Complete from Flask)
 */
const ROLE_PERMISSIONS = {
  "HR": [
    "reports", "hr_manager", "hr_movements", "hr_inbox",
    "employee_photos", "ask_employees", "recruitment",
    "expenses_report", "expenses_fuel", "employee_development",
    "salary_monthly", "salary_report", "settings",
    "structure", "idp_cert_development",
    "idp_plan", "self_development", "dashboard"
  ],
  "BUM": ["my_profile", "team_leaves", "ask_hr", "request_hr", "structure", "salary_monthly", "appraisal_team"],
  "LM":  ["my_profile", "team_leaves", "ask_hr", "request_hr", "structure", "salary_monthly"],
  "AM":  ["my_profile", "expenses_fuel", "report_compliance", "idp_cert_development",
          "business_rewards", "ask_hr", "request_hr", "structure", "salary_monthly", "leaves",
          "appraisal_team", "appraisal_am"],
  "DM":  ["my_profile", "expenses_fuel", "report_compliance", "idp_cert_development",
          "business_rewards", "ask_hr", "request_hr", "structure", "salary_monthly", "leaves",
          "appraisal_team", "appraisal_dm"],
  "MR":  ["my_profile", "expenses_fuel", "idp_plan", "self_development",
          "business_rewards", "notify_compliance", "ask_hr", "request_hr",
          "structure", "salary_monthly", "leaves", "appraisal_mr"],
  "ASSOCIATE COMPLIANCE": ["my_profile", "salary_monthly", "structure", "leaves", "report_compliance"],
  "FIELD COMPLIANCE SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves", "report_compliance"],
  "FIELD COMPLIANCE SPECIALIS": ["my_profile", "salary_monthly", "structure", "leaves", "report_compliance"],
  "PAYROLL & PERSONAL SPECIALIST": [
    "my_profile", "salary_monthly", "structure", "reports", "hr_manager",
    "ask_employees", "hr_inbox", "community", "hr_movements",
    "notifications", "salary_report", "expenses_report", "dashboard"
  ],
  "SENIOR TALENT ACQUISITION": [
    "my_profile", "salary_monthly", "structure", "hr_inbox",
    "employee_photos", "personal_email", "recruitment",
    "ask_employees", "dashboard", "notifications", "appraisal_team"
  ],
  "COMPENSATION & BENEFITS SPECIALIST": [
    "my_profile", "salary_monthly", "structure", "hr_inbox",
    "employee_photos", "ask_employees", "dashboard",
    "notifications", "appraisal_team"
  ]
};

/**
 * Additional roles stored in database (seeded by permissions UI)
 */
const EXTRA_ROLES = {
  "SFE SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "TRAINING SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "HR SPECIALIST": ["my_profile", "salary_monthly", "structure", "community", "notifications", "hr_inbox", "ask_employees", "hr_movements", "dashboard"],
  "HR & TRAINING MANAGER": [
    "reports", "hr_manager", "hr_movements", "hr_inbox",
    "employee_photos", "ask_employees", "recruitment",
    "expenses_report", "expenses_fuel", "employee_development",
    "salary_monthly", "settings",
    "structure", "idp_cert_development",
    "idp_plan", "self_development", "dashboard", "appraisal_team"
  ],
  "ASSOCIATE COMPLIANCE": ["my_profile", "salary_monthly", "leaves", "structure", "report_compliance"],
  "FIELD COMPLIANCE SPECIALIST": ["my_profile", "salary_monthly", "leaves", "structure", "report_compliance"],
  "OPERATION SUPERVISOR": ["my_profile", "salary_monthly", "structure", "leaves"],
  "PRODUCT MANAGER": ["my_profile", "salary_monthly", "structure", "leaves"],
  "COMMERCIAL MANAGER": ["my_profile", "salary_monthly", "structure", "team_leaves", "leaves"],
  "DISTRIBUTION SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "DIRECT SALES": ["my_profile", "salary_monthly", "structure", "leaves"],
  "OPERATION SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "OPERATION AND ANALYTICS SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "OFFICE BOY": ["my_profile", "salary_monthly", "structure", "leaves"],
  "KEY ACCOUNT MANAGER": ["my_profile", "salary_monthly", "structure", "team_leaves", "leaves"],
  "STORE SPECIALIST": ["my_profile", "salary_monthly", "structure", "leaves"],
  "PERFORMANCE EXCELLENCE MANAGER": ["my_profile", "salary_monthly", "team_leaves", "structure", "report_compliance"]
};

/**
 * Ensure role_permissions table exists in database
 */
async function ensurePermissionsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role VARCHAR(255) NOT NULL,
      permission VARCHAR(255) NOT NULL,
      enabled TINYINT(1) DEFAULT 1,
      UNIQUE KEY role_perm_unique (role, permission)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
  await query(sql, [], 'commit');
}

/**
 * Get all permissions for a role from DB or defaults (with caching)
 */
async function getRolePerms(role) {
  role = (role || "").toUpperCase().trim();
  if (!role) return [];

  // Check cache first
  if (permissionCache.has(role)) {
    return permissionCache.get(role);
  }

  try {
    await ensurePermissionsTable();

    // Fetch from database
    const dbPermsRows = await query(
      "SELECT permission FROM role_permissions WHERE role = ? AND enabled = 1",
      [role],
      'fetchall'
    );

    const dbPerms = dbPermsRows ? dbPermsRows.map(r => r.permission) : [];
    const defaultPerms = ROLE_PERMISSIONS[role] || [];
    const extraPerms = EXTRA_ROLES[role] || [];
    const fallbackPerms = [...new Set([...defaultPerms, ...extraPerms])]; // Remove duplicates

    // No DB entries → seed fallback permissions
    if (dbPerms.length === 0 && fallbackPerms.length > 0) {
      // Insert one by one to avoid complex array insertion issues with some mysql2 versions
      for (const p of fallbackPerms) {
        await query(
          "INSERT IGNORE INTO role_permissions (role, permission, enabled) VALUES (?, ?, 1)",
          [role, p],
          'commit'
        );
      }
      
      // Re-fetch to confirm
      const newRows = await query(
        "SELECT permission FROM role_permissions WHERE role = ? AND enabled = 1",
        [role],
        'fetchall'
      );
      const perms = newRows ? newRows.map(r => r.permission) : [];
      permissionCache.set(role, perms);
      return perms;
    }

    // DB entries exist → backfill missing fallback permissions
    if (dbPerms.length > 0) {
      const missing = fallbackPerms.filter(p => !dbPerms.includes(p));
      if (missing.length > 0) {
        for (const p of missing) {
           await query(
            "INSERT IGNORE INTO role_permissions (role, permission, enabled) VALUES (?, ?, 1)",
            [role, p],
            'commit'
          );
        }
        
        const newRows = await query(
          "SELECT permission FROM role_permissions WHERE role = ? AND enabled = 1",
          [role],
          'fetchall'
        );
        const perms = newRows ? newRows.map(r => r.permission) : [];
        permissionCache.set(role, perms);
        return perms;
      }

      permissionCache.set(role, dbPerms);
      return dbPerms;
    }
  } catch (error) {
    console.error('Error fetching permissions from DB:', error.message);
  }

  // Final fallback
  const fallback = [...(ROLE_PERMISSIONS[role] || []), ...(EXTRA_ROLES[role] || [])];
  permissionCache.set(role, fallback);
  return fallback;
}

/**
 * Determine employee role based on title
 * FIX: Specific titles must be checked BEFORE the generic title.includes("HR") check,
 * otherwise titles like "HR SPECIALIST", "PAYROLL & PERSONAL SPECIALIST" etc.
 * were incorrectly being mapped to the generic "HR" role.
 */
function getUserRole(user) {
  if (!user) return null;
  const title = (user.title || "").toString().trim().toUpperCase();

  // ✅ FIX: Specific HR-related titles FIRST (before generic HR check)
  if (title === "HR & TRAINING MANAGER") {
    return "HR & TRAINING MANAGER";
  }
  if (title === "PAYROLL & PERSONAL SPECIALIST") {
    return "PAYROLL & PERSONAL SPECIALIST";
  }
  if (title === "HR SPECIALIST") {
    return "HR SPECIALIST";
  }
  if (title === "SENIOR TALENT ACQUISITION") {
    return "SENIOR TALENT ACQUISITION";
  }
  if (title === "COMPENSATION & BENEFITS SPECIALIST") {
    return "COMPENSATION & BENEFITS SPECIALIST";
  }

  // Generic HR check AFTER specific titles
  if (title === "HR" || title === "HR MANAGER" || title === "HUMAN RESOURCES" || title.includes("HR")) {
    return "HR";
  }

  // BUM titles
  if (title === "BUM" || title === "BUSINESS UNIT MANAGER") {
    return "BUM";
  }
  // LM titles
  if (title === "LM" || title === "LINE MANAGER") {
    return "LM";
  }
  // AM titles
  if (title === "AM" || title === "AREA MANAGER") {
    return "AM";
  }
  // DM titles
  if (title === "DM" || title === "DISTRICT MANAGER") {
    return "DM";
  }
  // MR titles
  if (title === "MR" || title === "MEDICAL REPRESENTATIVE") {
    return "MR";
  }
  // Compliance roles
  if (title === "ASSOCIATE COMPLIANCE") {
    return "ASSOCIATE COMPLIANCE";
  }
  if (title === "FIELD COMPLIANCE SPECIALIST" || title === "FIELD COMPILIANCE SPECIALIST" || title === "FIELD COMPLIANCE SPECIALIS") {
    return "FIELD COMPLIANCE SPECIALIST";
  }

  // Unknown title → use title itself (for DB-driven permissions)
  if (title) {
    return title;
  }

  // Fallback → MR (lowest privileges)
  return "MR";
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Clear permission cache
 */
function invalidatePermissionCache() {
  permissionCache.clear();
}

/**
 * Check if user has a specific permission
 */
async function hasPermission(permissionName, req) {
  if (!req.session || !req.session.user) {
    return false;
  }
  const role = getUserRole(req.session.user);
  if (!role) return false;
  const permissions = await getRolePerms(role);
  return permissions.includes(permissionName);
}

/**
 * Express middleware to require login
 */
function loginRequired(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}

/**
 * Create permission-checking middleware
 */
function roleRequired(permissionName) {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    try {
      const hasPerm = await hasPermission(permissionName, req);
      if (!hasPerm) {
        return res.redirect('/profile');  // ✅ تم التعديل: من '/my-profile' إلى '/profile'
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).render('error', { message: 'Permission check failed' });
    }
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  EXTRA_ROLES,
  getUserRole,
  getRolePerms,
  hasPermission,
  invalidatePermissionCache,
  invalidatePermCache: invalidatePermissionCache,
  hashPassword,
  comparePassword,
  loginRequired,
  roleRequired,
  requireLogin: loginRequired,
  requirePermission: roleRequired,
  getCurrentUserPermissions: async (req) => {
     if (!req.session || !req.session.user) return [];
     return await getRolePerms(getUserRole(req.session.user));
  },
  hasAnyPermission: async (permissions, req) => {
    if (!Array.isArray(permissions)) permissions = [permissions];
    if (!req.session || !req.session.user) return false;
    const role = getUserRole(req.session.user);
    if (!role) return false;
    const userPerms = await getRolePerms(role);
    return permissions.some(p => userPerms.includes(p));
  },
  hasAllPermissions: async (permissions, req) => {
    if (!Array.isArray(permissions)) permissions = [permissions];
    if (!req.session || !req.session.user) return false;
    const role = getUserRole(req.session.user);
    if (!role) return false;
    const userPerms = await getRolePerms(role);
    return permissions.every(p => userPerms.includes(p));
  }
};
