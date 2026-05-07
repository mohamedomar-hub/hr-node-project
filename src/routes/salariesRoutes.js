/**
 * File: src/routes/salariesRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { requirePermission } = require('../core/authUtils');
const salaryService = require('../core/salaryService');
const { query } = require('../core/db');
const { encrypt, decrypt } = require('../core/cryptoUtils'); // Import Crypto Utils
const notificationsService = require('../core/notificationsService');
const { toIsoDateOnly } = require('../core/dateUtils');

// Configure Multer for Salary Uploads
const UPLOAD_FOLDER = 'static/uploads/salaries';
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

// Helper Function to Read Excel with Formulas Resolved
function readExcelWithValues(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { cellValues: true, type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });
    return data;
  } catch (error) {
    console.error("Error reading Excel file:", error);
    throw new Error("Failed to process Excel file.");
  }
}

// My Salary Page (For Individual Employees)
router.get('/salary/my', requirePermission('salary_monthly'), async (req, res) => {
  try {
    const user = req.session.user;
    const result = await salaryService.listSalaries(user.employee_code);
    
    // Decrypt all financial fields for display
    const decrypted = result.map(row => {
      const newRow = { ...row };
      // List of columns that contain money and need decryption
      const moneyColumns = [
        'basic_salary', 'car_allowance', 'transportation', 'inflation_allowance',
        'mobile_allowance', 'maintenance', 'gross_salary', 'social_ins', 'tax',
        'medical_ins', 'zero_tracking', 'bonus', 'deduction', 'monthly_kpis',
        'total_deductions', 'net_salary', 'deductions'
      ];

      moneyColumns.forEach(col => {
        if (newRow[col]) {
          newRow[col] = decrypt(newRow[col]);
        }
      });
      return newRow;
    }); 

    // Extract unique months for dropdown
    const months = [...new Set(decrypted.map(r => r.month || r.Month))].sort().reverse();
    
    // Determine selected month
    let selectedMonth = req.query.m;
    let currentSalary = null;

    if (selectedMonth) {
      currentSalary = decrypted.find(r => String(r.month || r.Month) === String(selectedMonth));
    } else if (months.length > 0) {
      selectedMonth = months[0];
      currentSalary = decrypted.find(r => String(r.month || r.Month) === String(selectedMonth));
    }

    res.render('salaries/my_salary', {
      user: user,
      pageTitle: 'My Monthly Salary',
      items: decrypted,
      months: months,
      current: currentSalary,
      selected_month: selectedMonth
    });
  } catch (error) {
    console.error("Salary Error:", error);
    res.status(500).send('Error loading salary data.');
  }
});

// Download Salary Slip for a Specific Month (NEW ROUTE)
router.get('/salary/my/download', requirePermission('salary_monthly'), async (req, res) => {
  try {
    const user = req.session.user;
    const selectedMonth = req.query.m;

    if (!selectedMonth) {
      req.flash('warning', 'No month selected.');
      return res.redirect('/salary/my');
    }

    // Fetch salary data for the selected month
    const allSalaries = await salaryService.listSalaries(user.employee_code);
    // Find and decrypt the specific row
    let currentSalary = allSalaries.find(r => String(r.month || r.Month) === String(selectedMonth));

    if (!currentSalary) {
      req.flash('danger', `No salary data found for month: ${selectedMonth}`);
      return res.redirect('/salary/my');
    }

    // Decrypt fields for the Excel report
    const moneyColumns = [
        'basic_salary', 'car_allowance', 'transportation', 'inflation_allowance',
        'mobile_allowance', 'maintenance', 'gross_salary', 'social_ins', 'tax',
        'medical_ins', 'zero_tracking', 'bonus', 'deduction', 'monthly_kpis',
        'total_deductions', 'net_salary', 'deductions'
    ];
    
    // Create a copy to decrypt without modifying the original object in memory if needed elsewhere
    const decryptedSalary = { ...currentSalary };
    moneyColumns.forEach(col => {
        if (decryptedSalary[col]) {
            decryptedSalary[col] = decrypt(decryptedSalary[col]);
        }
    });

    // Create Excel Workbook using exceljs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Salary Slip');

    // Add Title
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Salary Slip - ${selectedMonth}`;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    // Add Employee Info
    worksheet.addRow(['Employee Name:', user.employee_name]);
    worksheet.addRow(['Employee Code:', user.employee_code]);
    worksheet.addRow(['Title:', decryptedSalary.title || '']);
    worksheet.addRow(['Month:', selectedMonth]);
    worksheet.addRow([]); // Empty row

    // Add Financial Details (Using Decrypted Values)
    worksheet.addRow(['Description', 'Amount']);
    worksheet.addRow(['Gross Salary', decryptedSalary.gross_salary || 0]);
    worksheet.addRow(['Basic Salary', decryptedSalary.basic_salary || 0]);
    worksheet.addRow(['Car Allowance', decryptedSalary.car_allowance || 0]);
    worksheet.addRow(['Transportation', decryptedSalary.transportation || 0]);
    worksheet.addRow(['Inflation Allowance', decryptedSalary.inflation_allowance || 0]);
    worksheet.addRow(['Mobile Allowance', decryptedSalary.mobile_allowance || 0]);
    worksheet.addRow(['Maintenance', decryptedSalary.maintenance || 0]);
    worksheet.addRow(['KPI Bonus', decryptedSalary.monthly_kpis || 0]);
    worksheet.addRow(['Bonus', decryptedSalary.bonus || 0]);
    worksheet.addRow([]); // Empty row
    
    worksheet.addRow(['Deductions', 'Amount']);
    worksheet.addRow(['Social Ins.', decryptedSalary.social_ins || 0]);
    worksheet.addRow(['Tax', decryptedSalary.tax || 0]);
    worksheet.addRow(['Medical Ins.', decryptedSalary.medical_ins || 0]);
    worksheet.addRow(['Zero Tracking', decryptedSalary.zero_tracking || 0]);
    worksheet.addRow(['Deduction (Manual)', decryptedSalary.deduction || 0]);
    worksheet.addRow(['Total Deductions', decryptedSalary.total_deductions || 0]);
    worksheet.addRow([]); // Empty row
    
    const netRow = worksheet.addRow(['Net Salary', decryptedSalary.net_salary || 0]);
    netRow.font = { bold: true, color: { argb: 'FF008000' } }; // Green Bold

    // Set column widths
    worksheet.columns = [
      { width: 25 },
      { width: 15 }
    ];

    // Write to buffer and send as response
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Salary_Slip_${user.employee_code}_${selectedMonth}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error("Download Error:", error);
    req.flash('danger', 'Failed to generate salary slip.');
    res.redirect('/salary/my');
  }
});

// All Salaries Page (HR Only)
router.get('/salary/all', requirePermission('salary_report'), async (req, res) => {
  try {
    const result = await salaryService.listSalaries(); 
    
    // Decrypt for HR view as well
    const decrypted = result.map(row => {
      const newRow = { ...row };
      const moneyColumns = [
        'basic_salary', 'car_allowance', 'transportation', 'inflation_allowance',
        'mobile_allowance', 'maintenance', 'gross_salary', 'social_ins', 'tax',
        'medical_ins', 'zero_tracking', 'bonus', 'deduction', 'monthly_kpis',
        'total_deductions', 'net_salary', 'deductions'
      ];
      moneyColumns.forEach(col => {
        if (newRow[col]) {
          newRow[col] = decrypt(newRow[col]);
        }
      });
      return newRow;
    });

    res.render('salaries/all_salaries', {
      user: req.session.user,
      pageTitle: 'All Employees Salaries',
      items: decrypted
    });
  } catch (error) {
    console.error("All Salaries Error:", error);
    res.status(500).send('Server Error loading all salaries.');
  }
});

// Report Redirect (alias to upload)
router.get('/salary/report', (req, res) => {
  res.redirect('/salary/upload');
});

// Upload Salaries (HR Only)
router.post('/salary/upload', requirePermission('salary_report'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      req.flash('warning', 'No file selected.');
      return res.redirect('/salary/upload');
    }

    const excelData = readExcelWithValues(req.file.path);

    if (!excelData || excelData.length === 0) {
      req.flash('danger', 'Excel file is empty or invalid.');
      return res.redirect('/salary/upload');
    }

    let successCount = 0;
    let skipCount = 0;
    const notifiedSalaryRows = new Set();

    for (const row of excelData) {
      if (!row["Employee Code"] || !row["Month"]) {
        skipCount++;
        continue; 
      }

      const employeeCode = row["Employee Code"];
      const month = row["Month"];

      const formattedHiringDate = toIsoDateOnly(row["Hiring Date"]) || null;

      // ENCRYPT financial fields before saving to DB
      const dbRow = {
        employee_code: employeeCode,
        month: month,
        title: row["Title"],
        hiring_date: formattedHiringDate,
        basic_salary: encrypt(parseFloat(row["Basic Salary"]) || 0),
        car_allowance: encrypt(parseFloat(row["Car Allowance"]) || 0),
        transportation: encrypt(parseFloat(row["Transportation"]) || 0),
        inflation_allowance: encrypt(parseFloat(row["Inflation Allowance"]) || 0),
        mobile_allowance: encrypt(parseFloat(row["Mobile Allowance"]) || 0),
        maintenance: encrypt(parseFloat(row["Meintenance"]) || 0),
        gross_salary: encrypt(parseFloat(row["Gross Salary"]) || 0),
        social_ins: encrypt(parseFloat(row["Social Ins."]) || 0),
        tax: encrypt(parseFloat(row["Tax"]) || 0),
        medical_ins: encrypt(parseFloat(row["Medical Ins."]) || 0),
        zero_tracking: encrypt(parseFloat(row["Zero Tracking"]) || 0),
        bonus: encrypt(parseFloat(row["Bonus"]) || 0),
        deduction: encrypt(parseFloat(row["Deduction"]) || 0),
        monthly_kpis: encrypt(parseFloat(row["Monthly KPIs"]) || 0),
        total_deductions: encrypt(parseFloat(row["Total Deductions"]) || 0),
        net_salary: encrypt(parseFloat(row["Net Salary"]) || 0),
        deductions: encrypt(parseFloat(row["Deductions"]) || 0)
      };

      try {
        await salaryService.upsertSalary(dbRow);
        successCount++;

        const notificationKey = `${String(employeeCode).trim()}::${String(month).trim()}`;
        if (!notifiedSalaryRows.has(notificationKey)) {
          notifiedSalaryRows.add(notificationKey);
          await notificationsService.addNotification(employeeCode, null, `Your salary for ${month} has been published.`, {
            category: 'salary',
            link_url: `/salary/my?m=${encodeURIComponent(String(month))}`
          });
        }
      } catch (dbError) {
        console.error("DB Error for row:", row, dbError);
        skipCount++;
      }
    }

    req.flash('success', `Upload complete. ${successCount} processed, ${skipCount} skipped.`);
    res.redirect('/salary/all');

  } catch (error) {
    console.error("Upload Error:", error);
    req.flash('danger', 'Failed to upload/process file: ' + error.message);
    res.redirect('/salary/upload');
  }
});

router.get('/salary/upload', requirePermission('salary_report'), (req, res) => {
  res.render('salaries/upload_salaries', { user: req.session.user, pageTitle: 'Upload Salary Sheet' });
});

module.exports = router;
