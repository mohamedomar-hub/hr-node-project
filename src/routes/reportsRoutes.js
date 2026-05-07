/**
 * File: src/routes/reportsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requirePermission } = require('../core/authUtils');
const { query } = require('../core/db');
const ExcelJS = require('exceljs');

// Reports Home Page (Leaves Report)
router.get('/reports', requirePermission('reports'), async (req, res) => {
  try {
    // Fetch all leaves with employee names
    // REPLACE 'created_at' WITH THE CORRECT COLUMN NAME FROM YOUR DB
    const sql = `
      SELECT l.*, e.employee_name 
      FROM leaves l 
      JOIN employees e ON l.employee_code = e.employee_code 
      ORDER BY l.created_at DESC 
    `;
    const leaves = await query(sql, [], 'fetchall') || [];

    res.render('reports/reports', {
      user: req.session.user,
      pageTitle: 'HR Reports - Leaves',
      leaves: leaves
    });
  } catch (error) {
    console.error("Reports Error:", error);
    res.status(500).send('Server Error loading reports: ' + error.message);
  }
});

// Download Leaves Report as Excel
router.get('/reports/download/leaves', requirePermission('reports'), async (req, res) => {
  try {
    // REPLACE 'created_at' WITH THE CORRECT COLUMN NAME FROM YOUR DB
    const sql = `
      SELECT l.*, e.employee_name 
      FROM leaves l 
      JOIN employees e ON l.employee_code = e.employee_code 
      ORDER BY l.created_at DESC
    `;
    const leaves = await query(sql, [], 'fetchall') || [];

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leaves Report');

    // Add Headers (Adjust keys if column names are different)
    worksheet.columns = [
      { header: 'Employee Code', key: 'employee_code', width: 15 },
      { header: 'Employee Name', key: 'employee_name', width: 25 },
      { header: 'Leave Type', key: 'leave_type', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Days', key: 'days', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Request Date', key: 'created_at', width: 15 } // Adjust key here too
    ];

    // Add Data
    worksheet.addRows(leaves.map(l => ({
      employee_code: l.employee_code,
      employee_name: l.employee_name,
      leave_type: l.leave_type,
      start_date: l.start_date,
      end_date: l.end_date,
      days: l.days,
      status: l.status,
      created_at: l.created_at // Adjust key here too
    })));

    // Style Header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' }
    };

    // Write to buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Leaves_Report.xlsx');
    res.send(buffer);

  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).send('Failed to generate report.');
  }
});

module.exports = router;