/**
 * File: app.js
 * Description: Main Entry Point for HR Node.js Backend - Cleaned & Optimized
 */

const expressLayouts = require('express-ejs-layouts');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session); // ✅ MySQL Session Store
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

// Import Core Services
const employeeService = require('./src/core/employeeService');
const { getUserRole, getRolePerms, invalidatePermissionCache } = require('./src/core/authUtils');
const { formatDisplayDate, toIsoDateOnly } = require('./src/core/dateUtils');
const notificationsService = require('./src/core/notificationsService');
const { query } = require('./src/core/db');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const structureRoutes = require('./src/routes/structureRoutes');
const salariesRoutes = require('./src/routes/salariesRoutes');
const hrManagerRoutes = require('./src/routes/hrManagerRoutes');
const expensesRoutes = require('./src/routes/expensesRoutes');
const leavesRoutes = require('./src/routes/leavesRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const permissionsRoutes = require('./src/routes/permissionsRoutes');
const reportsRoutes = require('./src/routes/reportsRoutes');
const photosRoutes = require('./src/routes/photosRoutes');
const notificationsRoutes = require('./src/routes/notificationsRoutes');
const askHrRoutes = require('./src/routes/askHrRoutes');
const requestHrRoutes = require('./src/routes/requestHrRoutes');
const rewardsRoutes = require('./src/routes/businessRewardsRoutes');
const complianceRoutes = require('./src/routes/complianceRoutes');
const recruitmentRoutes = require('./src/routes/recruitmentRoutes');
const communityRoutes = require('./src/routes/communityRoutes');
const idpRoutes = require('./src/routes/idpRoutes');
const askEmployeesRoutes = require('./src/routes/askEmployeesRoutes');
const hrInboxRoutes = require('./src/routes/hrInboxRoutes');
const salaryAliasRoutes = require('./src/routes/salaryAliasRoutes');
const extraRoutes = require('./src/routes/extraRoutes');
const appraisalRoutes = require('./src/routes/appraisalRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View Engine Setup (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use Express Layouts
app.use(expressLayouts);
app.set('layout', './base');

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/employee_photos', express.static(path.join(__dirname, 'employee_photos')));

// ✅ MySQL Session Store Configuration
const sessionStore = new MySQLStore({
  host:     process.env.MYSQL_HOST,
  port:     parseInt(process.env.MYSQL_PORT),
  user:     process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  clearExpired: true,              // بيمسح Sessions المنتهية تلقائياً
  checkExpirationInterval: 900000, // بيتحقق كل 15 دقيقة
  expiration: 86400000,            // الـ Session بتنتهي بعد 24 ساعة
  createDatabaseTable: true,       // بيعمل جدول sessions تلقائياً لو مش موجود
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires:    'expires',
      data:       'data'
    }
  }
});

// Session & Flash Messages
app.use(session({
  secret: process.env.SESSION_SECRET || 'hr_secret_key_change_in_prod',
  resave: false,
  saveUninitialized: false, // ✅ false أحسن للـ performance
  store: sessionStore,      // ✅ Sessions بتتخزن في MySQL مش في RAM
  cookie: {
    secure: false,          // لو بتستخدم HTTPS خليها true
    maxAge: 86400000        // 24 ساعة
  }
}));
app.use(flash());

// --- CRITICAL FIX: Disable Layout for Auth Pages ---
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/password/reset') {
    res.locals.layout = false;
  }
  next();
});

// Global Variables for Templates
app.use(async (req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.messages = req.flash();
  // تعريف افتراضي لمنع الخطأ في القوالب
  res.locals.notificationsUnreadCount = 0;
  res.locals.hrInboxPendingCount = 0;
  res.locals.expensePendingCount = 0;
  res.locals.leavePendingCount = 0;
  res.locals.pendingApprovalsCount = 0;

  if (req.session && req.session.user) {
    try {
      const role = getUserRole(req.session.user);
      req.userPermissions = await getRolePerms(role);
      res.locals.notificationsUnreadCount = await notificationsService.unreadCount(req.session.user.employee_code, role);
      try {
        const userCode = String(req.session.user.employee_code || '').trim();
        const isHr = String(role || '').toUpperCase().includes('HR');

        if (isHr) {
          const hrInboxRow = await query(
            "SELECT COUNT(*) AS cnt FROM hr_messages WHERE recipient_code = ? AND status IN ('New', 'Read')",
            [userCode],
            'fetchone'
          );
          res.locals.hrInboxPendingCount = parseInt(hrInboxRow?.cnt || 0);
        }

        const expenseRow = await query(
          "SELECT COUNT(*) AS cnt FROM expenses WHERE status='Pending' AND current_approver=?",
          [userCode],
          'fetchone'
        );
        const leaveRow = await query(
          "SELECT COUNT(*) AS cnt FROM leaves WHERE status='Pending' AND manager_code=?",
          [userCode],
          'fetchone'
        );
        res.locals.expensePendingCount = parseInt(expenseRow?.cnt || 0);
        res.locals.leavePendingCount   = parseInt(leaveRow?.cnt  || 0);
        res.locals.pendingApprovalsCount = res.locals.expensePendingCount + res.locals.leavePendingCount;
      } catch (badgeErr) {
        console.error('Error loading sidebar badges:', badgeErr.message);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
      req.userPermissions = [];
    }
  } else {
    req.userPermissions = [];
  }

  res.locals.userPermissions = req.userPermissions;
  res.locals.getUserRole     = () => getUserRole(req.session.user);
  res.locals.hasPermission   = (perm) => req.userPermissions.includes(perm);
  res.locals.formatDisplayDate = formatDisplayDate;
  res.locals.toIsoDateOnly     = toIsoDateOnly;

  next();
});

// --- Home Page Route ---
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  return res.redirect('/login');
});

// --- Routes Registration ---
app.use('/', authRoutes);
app.use('/', structureRoutes);
app.use('/', dashboardRoutes);
app.use('/', profileRoutes);
app.use('/', salariesRoutes);
app.use('/', hrManagerRoutes);
app.use('/', expensesRoutes);
app.use('/', leavesRoutes);
app.use('/', settingsRoutes);
app.use('/', permissionsRoutes);
app.use('/', reportsRoutes);
app.use('/', photosRoutes);
app.use('/', notificationsRoutes);
app.use('/', askHrRoutes);
app.use('/', rewardsRoutes);
app.use('/', complianceRoutes);
app.use('/', recruitmentRoutes);
app.use('/', communityRoutes);
app.use('/', idpRoutes);
app.use('/', askEmployeesRoutes);
app.use('/', requestHrRoutes);
app.use('/', hrInboxRoutes);
app.use('/', salaryAliasRoutes);
app.use('/', extraRoutes);
app.use('/', appraisalRoutes);

// Clear permission cache on startup
invalidatePermissionCache();
console.log('✓ Permission cache cleared on startup');

// Start Server
app.listen(PORT, () => {
  console.log(`HR System Backend running on http://localhost:${PORT}`);
});
