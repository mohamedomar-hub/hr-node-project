/**
 * File: src/routes/hrManagerRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { requirePermission } = require('../core/authUtils');
const employeeService = require('../core/employeeService');
const { query } = require('../core/db');
const { toIsoDateOnly } = require('../core/dateUtils');

// Configure Multer for Employee Uploads
const UPLOAD_FOLDER = 'static/uploads/employees';
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_FOLDER);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Helper to read Excel files
function readEmployeeExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: false, cellText: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    
    // Filter out completely empty rows and trim whitespace
    const cleanedData = data.filter(row => {
      // Check if row has any non-empty values
      const hasContent = Object.values(row).some(val => 
        val !== null && val !== undefined && String(val).trim() !== ''
      );
      return hasContent;
    }).map(row => {
      // Trim all string values in the row
      const trimmedRow = {};
      for (const [key, value] of Object.entries(row)) {
        trimmedRow[key] = typeof value === 'string' ? value.trim() : value;
      }
      return trimmedRow;
    });
    
    console.log(`Excel file read: ${data.length} total rows, ${cleanedData.length} valid rows`);
    return cleanedData;
  } catch (error) {
    console.error("Error reading Excel:", error);
    throw new Error("Failed to process Excel file.");
  }
}

function normalizeEmployeeRow(row) {
  return {
    employee_code: (row['Employee Code'] || row['Code'] || '').toString().trim(),
    employee_name: (row['Employee Name'] || row['Name'] || '').toString().trim(),
    title: (row['Title'] || row['Job Title'] || '').toString().trim() || null,
    department: (row['Department'] || row['Dept'] || '').toString().trim() || null,
    manager_code: (row['Manager Code'] || '').toString().trim() || null,
    hire_date: toIsoDateOnly(row['Hiring Date']) || null
  };
}

// HR Manager Home Page (View & Filter)
router.get('/hr_manager', requirePermission('hr_manager'), async (req, res) => {
  try {
    const titleFilter = req.query.title || '';
    const deptFilter = req.query.department || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    // 1. Prepare Base Conditions and Params for Filtering ONLY
    let whereConditions = [];
    let filterParams = [];

    if (titleFilter) {
      whereConditions.push("title LIKE ?");
      filterParams.push(`%${titleFilter}%`);
    }
    if (deptFilter) {
      whereConditions.push("department LIKE ?");
      filterParams.push(`%${deptFilter}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? "WHERE " + whereConditions.join(" AND ") 
      : "";

    // 2. Get Total Count for Pagination
    const countSql = "SELECT COUNT(*) as total FROM employees " + whereClause;
    const countResult = await query(countSql, filterParams, 'fetchone');
    const total = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // 3. Build Main Query with Pagination
    // CRITICAL FIX: We will NOT use ? for LIMIT and OFFSET to avoid mysql2 argument errors.
    // Instead, we verify they are integers and inject them directly into the string.
    // This is safe because limit/offset are calculated internally from page number.
    
    const safeLimit = Number.isInteger(limit) ? limit : 50;
    const safeOffset = Number.isInteger(offset) ? offset : 0;

    const mainSql = "SELECT employee_code, employee_name, title, department, manager_code, hire_date FROM employees " + 
                    whereClause + 
                    " ORDER BY employee_name LIMIT " + safeLimit + " OFFSET " + safeOffset;

    // 4. Execute Data Query (Only filter params are passed as placeholders)
    const employees = await query(mainSql, filterParams, 'fetchall') || [];

    // 5. Get Unique Titles and Departments for Filters
    const titles = await query("SELECT DISTINCT title FROM employees WHERE title IS NOT NULL ORDER BY title", [], 'fetchall').then(rows => rows.map(r => r.title));
    const departments = await query("SELECT DISTINCT department FROM employees WHERE department IS NOT NULL ORDER BY department", [], 'fetchall').then(rows => rows.map(r => r.department));

    res.render('hr/hr_manager', {
      user: req.session.user,
      pageTitle: 'HR Manager',
      employees: employees,
      titles: titles,
      departments: departments,
      title_filter: titleFilter,
      dept_filter: deptFilter,
      page: page,
      total_pages: totalPages,
      total: total
    });
  } catch (error) {
    console.error("HR Manager View Error:", error);
    res.status(500).send('Error loading HR Manager data: ' + error.message);
  }
});

// Handle Bulk Upload (Excel)
router.post('/hr_manager', requirePermission('hr_manager'), upload.single('employees_file'), async (req, res) => {
  try {
    if (!req.file) {
      req.flash('warning', 'No file selected.');
      return res.redirect('/hr_manager');
    }

    const excelData = readEmployeeExcel(req.file.path);
    const totalRowsRead = excelData.length;
    const normalizedRows = excelData.map(normalizeEmployeeRow);

    const uniqueEmployeeMap = new Map();
    let duplicateCount = 0;
    let invalidCount = 0;
    const invalidRows = [];
    const duplicateRows = [];

    normalizedRows.forEach((row, index) => {
      const rowNumber = index + 2; // Excel row number approximation (header row = 1)
      if (!row.employee_code || !row.employee_name) {
        invalidCount++;
        invalidRows.push({ rowNumber, reason: 'Missing code or name', row });
        return;
      }

      if (uniqueEmployeeMap.has(row.employee_code)) {
        duplicateCount++;
        duplicateRows.push({ rowNumber, employee_code: row.employee_code });
        return;
      }

      uniqueEmployeeMap.set(row.employee_code, row);
    });

    const employeeRows = Array.from(uniqueEmployeeMap.values());
    const uploadedCodes = Array.from(uniqueEmployeeMap.keys());

    let upsertedCount = 0;
    let upsertErrorCount = 0;

    for (const empData of employeeRows) {
      try {
        await employeeService.upsertEmployee(empData);
        upsertedCount++;
      } catch (err) {
        console.error("Error upserting employee:", empData.employee_code, err);
        upsertErrorCount++;
      }
    }

    if (uploadedCodes.length > 0) {
      const placeholders = uploadedCodes.map(() => '?').join(',');
      await query(`DELETE FROM employees WHERE TRIM(employee_code) NOT IN (${placeholders})`, uploadedCodes, 'commit');
    }

    const dbCountResult = await query('SELECT COUNT(*) as total FROM employees', [], 'fetchone');
    const dbTotal = dbCountResult ? dbCountResult.total : 0;

    console.log(`Upload sync complete: ${totalRowsRead} rows read, ${employeeRows.length} unique rows, ${duplicateCount} duplicate rows, ${invalidCount} invalid rows, ${upsertErrorCount} upsert errors. DB total after sync: ${dbTotal}`);

    const details = [`${totalRowsRead} rows read`, `${employeeRows.length} unique rows`];
    if (duplicateCount) details.push(`${duplicateCount} duplicate row(s)`);
    if (invalidCount) details.push(`${invalidCount} invalid row(s)`);
    if (upsertErrorCount) details.push(`${upsertErrorCount} upsert error(s)`);
    details.push(`DB total ${dbTotal}`);

    const messageType = (duplicateCount || invalidCount || upsertErrorCount) ? 'warning' : 'success';
    const messageText = `Upload complete. ${details.join(', ')}.`;
    req.flash(messageType, messageText);
    res.redirect('/hr_manager');

  } catch (error) {
    console.error("Upload Error:", error);
    req.flash('danger', 'Failed to process file: ' + error.message);
    res.redirect('/hr_manager');
  }
});

// Handle Single Add/Update
router.post('/hr_manager/add', requirePermission('hr_manager'), async (req, res) => {
  try {
    const { code, name, title, department, manager_code, password } = req.body;
    
    if (!code || !name) {
      req.flash('danger', 'Code and Name are required.');
      return res.redirect('/hr_manager');
    }

    const empData = {
      employee_code: code,
      employee_name: name,
      title: title,
      department: department,
      manager_code: manager_code,
    };

    await employeeService.upsertEmployee(empData);
    req.flash('success', 'Employee saved successfully.');
    res.redirect('/hr_manager');
  } catch (error) {
    console.error("Add Employee Error:", error);
    req.flash('danger', 'Error saving employee: ' + error.message);
    res.redirect('/hr_manager');
  }
});

// Handle Delete
router.post('/hr_manager/delete', requirePermission('hr_manager'), async (req, res) => {
  try {
    const { code_del } = req.body;
    if (!code_del) {
      req.flash('danger', 'Invalid employee code.');
      return res.redirect('/hr_manager');
    }

    await employeeService.deleteEmployee(code_del);
    req.flash('success', 'Employee deleted successfully.');
    res.redirect('/hr_manager');
  } catch (error) {
    console.error("Delete Employee Error:", error);
    req.flash('danger', 'Error deleting employee: ' + error.message);
    res.redirect('/hr_manager');
  }
});

module.exports = router;
