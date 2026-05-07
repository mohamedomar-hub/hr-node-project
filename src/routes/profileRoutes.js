/**
 * File: src/routes/profileRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { requireLogin } = require('../core/authUtils');
const { query } = require('../core/db');
const ExcelJS = require('exceljs');
const employeeService = require('../core/employeeService');
const movementsService = require('../core/movementsService');
const communityService = require('../core/communityService');
const { toIsoDateOnly } = require('../core/dateUtils');

// Configure Multer for Profile Photos
const UPLOAD_FOLDER = 'employee_photos'; // Folder in root directory
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_FOLDER);
  },
  filename: function (req, file, cb) {
    // Save as EmployeeCode.extension to make it easy to manage
    const ext = path.extname(file.originalname);
    cb(null, `${req.session.user.employee_code}${ext}`);
  }
});
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  }
});

function canManageMovements(req) {
  const perms = req.userPermissions || [];
  return perms.includes('hr_movements') || perms.includes('hr_manager');
}

function safeJsonString(value) {
  return JSON.stringify(value || []).replace(/</g, '\\u003c');
}

function normalizeDate(value) {
  return toIsoDateOnly(value);
}

async function buildMovementsWithBaseline(employeeCode) {
  const code = String(employeeCode || '').trim();
  if (!code) return [];

  const emp = await employeeService.getEmployeeByCode(code);
  const rows = await movementsService.listMovements(code);
  const baseline = emp ? {
    id: 0,
    employee_code: code,
    action: 'Hire',
    from_title: '',
    to_title: emp.title || '',
    from_department: '',
    to_department: emp.department || '',
    effective_date: emp.hire_date ? normalizeDate(emp.hire_date) : '',
    notes: 'Initial record',
    created_by: '',
    created_by_name: 'System',
    created_at: null
  } : null;

  const normalized = rows.map((r) => ({
    ...r,
    effective_date: normalizeDate(r.effective_date),
    created_at: r.created_at ? new Date(r.created_at).toISOString() : null
  }));

  return baseline ? [...normalized, baseline] : normalized;
}

// Profile Home Page
router.get('/profile', requireLogin, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const code = String(sessionUser.employee_code || '').trim();
    const fresh = await employeeService.getEmployeeByCode(code);
    const user = fresh ? { ...sessionUser, ...fresh } : sessionUser;
    req.session.user = user;
    
    // Get Manager Name (Safe check)
    let managerName = 'N/A';
    if (user.manager_code) {
      try {
        const mgr = await query("SELECT employee_name FROM employees WHERE employee_code = ?", [user.manager_code], 'fetchone');
        if (mgr && mgr.employee_name) managerName = mgr.employee_name;
      } catch (e) {
        console.log("Manager not found or error fetching:", e.message);
      }
    }

    // Check if photo exists
    let photo = null;
    const extensions = ['.jpg', '.jpeg', '.png', '.gif'];
    for (let ext of extensions) {
      const filePath = `${UPLOAD_FOLDER}/${user.employee_code}${ext}`;
      if (fs.existsSync(filePath)) {
        photo = filePath;
        break;
      }
    }

    const movements = await buildMovementsWithBaseline(user.employee_code);

    const canEditMovements = canManageMovements(req);
    let employeesList = [];
    let titles = [];
    let departments = [];
    let employeesJson = [];

    if (canEditMovements) {
      employeesList = await query(
        "SELECT employee_code, employee_name, title, department, hire_date, manager_code FROM employees ORDER BY employee_name",
        [],
        'fetchall'
      ) || [];
      titles = [...new Set(employeesList.map(e => e.title).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
      departments = [...new Set(employeesList.map(e => e.department).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
      employeesJson = employeesList.map((e) => ({
        employee_code: String(e.employee_code || '').trim(),
        employee_name: e.employee_name || '',
        title: e.title || '',
        department: e.department || '',
        hire_date: e.hire_date ? normalizeDate(e.hire_date) : '',
        manager_code: e.manager_code ? String(e.manager_code).trim() : ''
      }));
    }

    const activeTab = String(req.query.tab || '').trim().toLowerCase() || 'profile';
    const communityFeed = await communityService.listFeed(user.employee_code, 20);

    // Render Profile View
    res.render('profile', {
      user: user,
      pageTitle: 'My Profile',
      manager_name: managerName,
      photo: photo,
      movements,
      canEditMovements,
      activeTab,
      communityFeed,
      employees_list: employeesList,
      titles,
      departments,
      employees_json: employeesJson
    });
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).send('Error loading profile: ' + error.message);
  }
});

router.post('/profile/movement', requireLogin, async (req, res) => {
  try {
    if (!canManageMovements(req)) {
      req.flash('danger', 'Not authorized to add movements.');
      return res.redirect('/profile');
    }

    const employeeCode = String(req.body.employee_code || req.session.user.employee_code || '').trim();
    const action = String(req.body.action || '').trim();
    const toTitle = String(req.body.to_title || '').trim() || null;
    const toDepartment = String(req.body.to_department || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;
    const effectiveDate = String(req.body.effective_date || '').trim();
    const movementId = req.body.movement_id ? String(req.body.movement_id).trim() : '';

    if (!employeeCode || !action || !effectiveDate) {
      req.flash('warning', 'Employee, action, and date are required.');
      return res.redirect('/profile');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      req.flash('danger', 'Invalid date format. Use YYYY-MM-DD.');
      return res.redirect('/profile');
    }

    if (movementId) {
      await movementsService.updateMovement(
        Number(movementId),
        employeeCode,
        action,
        toTitle,
        toDepartment,
        effectiveDate,
        notes
      );
      req.flash('success', 'Movement updated.');
    } else {
      await movementsService.addMovement(
        employeeCode,
        action,
        toTitle,
        toDepartment,
        effectiveDate,
        notes,
        String(req.session.user.employee_code || '').trim(),
        String(req.session.user.employee_name || '').trim()
      );
      req.flash('success', 'Movement added.');
    }

    return res.redirect('/profile');
  } catch (error) {
    console.error('Movement add/update error:', error);
    req.flash('danger', error.message || 'Failed to save movement.');
    return res.redirect('/profile');
  }
});

router.post('/profile/movement/delete', requireLogin, async (req, res) => {
  try {
    if (!canManageMovements(req)) {
      req.flash('danger', 'Not authorized to delete movements.');
      return res.redirect('/profile');
    }

    const movementId = String(req.body.movement_id || '').trim();
    const employeeCode = String(req.body.employee_code || '').trim();

    if (!movementId || !employeeCode) {
      req.flash('warning', 'Missing movement id or employee code.');
      return res.redirect('/profile');
    }

    await movementsService.deleteMovement(Number(movementId), employeeCode);
    req.flash('success', 'Movement deleted.');
    return res.redirect('/profile');
  } catch (error) {
    console.error('Movement delete error:', error);
    req.flash('danger', error.message || 'Failed to delete movement.');
    return res.redirect('/profile');
  }
});

router.get('/profile/movements/data', requireLogin, async (req, res) => {
  try {
    const viewerCode = String(req.session.user.employee_code || '').trim();
    const targetCode = String(req.query.employee_code || viewerCode).trim() || viewerCode;

    if (viewerCode !== targetCode && !canManageMovements(req)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const emp = await employeeService.getEmployeeByCode(String(targetCode));
    const movements = await buildMovementsWithBaseline(targetCode);
    return res.json({ employee: emp || {}, movements });
  } catch (error) {
    console.error('Movements data error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.get('/profile/movements/export', requireLogin, async (req, res) => {
  try {
    const viewerCode = String(req.session.user.employee_code || '').trim();
    const targetCode = String(req.query.employee_code || viewerCode).trim() || viewerCode;
    const scope = String(req.query.scope || '').toLowerCase();

    if (scope === 'all') {
      if (!canManageMovements(req)) {
        req.flash('danger', 'Only HR can export all movements.');
        return res.redirect('/profile');
      }
      const rows = await movementsService.listAllMovements();
      const emps = await query(
        "SELECT employee_code, title, department, hire_date FROM employees",
        [],
        'fetchall'
      ) || [];

      const baselines = emps.map((e) => ({
        id: 0,
        employee_code: String(e.employee_code || '').trim(),
        action: 'Hire',
        from_title: '',
        to_title: e.title || '',
        from_department: '',
        to_department: e.department || '',
        effective_date: e.hire_date ? normalizeDate(e.hire_date) : '',
        notes: 'Initial record',
        created_by: '',
        created_by_name: 'System',
        created_at: ''
      }));

      await exportMovementsXlsx(res, [...rows, ...baselines], 'movements_all.xlsx');
      return;
    }

    if (viewerCode !== targetCode && !canManageMovements(req)) {
      req.flash('danger', 'Not authorized to export other employees.');
      return res.redirect('/profile');
    }

    const rows = await buildMovementsWithBaseline(targetCode);
    await exportMovementsXlsx(res, rows, `movements_${targetCode}.xlsx`);
  } catch (error) {
    console.error('Movements export error:', error);
    req.flash('danger', error.message || 'Failed to export movements.');
    return res.redirect('/profile');
  }
});

async function exportMovementsXlsx(res, rows, filename) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Movements');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Employee Code', key: 'employee_code', width: 16 },
    { header: 'Action', key: 'action', width: 20 },
    { header: 'From Title', key: 'from_title', width: 22 },
    { header: 'To Title', key: 'to_title', width: 22 },
    { header: 'From Department', key: 'from_department', width: 22 },
    { header: 'To Department', key: 'to_department', width: 22 },
    { header: 'Effective Date', key: 'effective_date', width: 14 },
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'Created By', key: 'created_by', width: 14 },
    { header: 'Created By Name', key: 'created_by_name', width: 22 },
    { header: 'Created At', key: 'created_at', width: 22 }
  ];

  (rows || []).forEach((r) => {
    sheet.addRow({
      id: r.id ?? '',
      employee_code: r.employee_code ?? '',
      action: r.action ?? '',
      from_title: r.from_title ?? '',
      to_title: r.to_title ?? '',
      from_department: r.from_department ?? '',
      to_department: r.to_department ?? '',
      effective_date: r.effective_date ? normalizeDate(r.effective_date) : '',
      notes: r.notes ?? '',
      created_by: r.created_by ?? '',
      created_by_name: r.created_by_name ?? '',
      created_at: r.created_at ? String(r.created_at).slice(0, 19).replace('T', ' ') : ''
    });
  });

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  await workbook.xlsx.write(res);
  res.end();
}

// Upload Photo
router.post('/profile/photo', requireLogin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      req.flash('danger', 'No file uploaded or invalid file type.');
      return res.redirect('/profile');
    }

    const user = req.session.user;
    const filePath = req.file.path; // e.g., employee_photos/1001.jpg

    // Upsert into employee_photos table to sync with HR view
    await query(`
      INSERT INTO employee_photos (employee_code, photo_path) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE photo_path = ?
    `, [user.employee_code, filePath, filePath], 'commit');

    req.flash('success', 'Photo uploaded successfully.');
    res.redirect('/profile');
  } catch (error) {
    console.error("Upload Photo Error:", error);
    req.flash('danger', 'Failed to upload photo.');
    res.redirect('/profile');
  }
});

// Delete Photo
router.post('/profile/photo/delete', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    
    // Delete from DB
    await query("DELETE FROM employee_photos WHERE employee_code = ?", [user.employee_code], 'commit');

    // Delete file from disk
    const extensions = ['.jpg', '.jpeg', '.png', '.gif'];
    let deleted = false;
    for (let ext of extensions) {
      const filePath = path.join(__dirname, '../../', `${UPLOAD_FOLDER}/${user.employee_code}${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
        break;
      }
    }

    if (deleted) {
      req.flash('success', 'Photo deleted successfully.');
    } else {
      req.flash('warning', 'No photo found to delete.');
    }
    
    res.redirect('/profile');
  } catch (error) {
    console.error("Delete Photo Error:", error);
    req.flash('danger', 'Failed to delete photo.');
    res.redirect('/profile');
  }
});

module.exports = router;