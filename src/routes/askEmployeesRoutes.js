/**
 * File: src/routes/askEmployeesRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requirePermission } = require('../core/authUtils'); // Only for HR
const { query } = require('../core/db');
const notificationsService = require('../core/notificationsService');

// Configure Multer for Document Uploads from HR
const DOC_UPLOAD_FOLDER = 'static/uploads/hr_documents';
if (!fs.existsSync(DOC_UPLOAD_FOLDER)) {
  fs.mkdirSync(DOC_UPLOAD_FOLDER, { recursive: true });
}

const docStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, DOC_UPLOAD_FOLDER);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const uploadDocFromHR = multer({ 
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Ask Employees Page (For HR Only)
router.get('/ask_employees', requirePermission('ask_employees'), async (req, res) => {
  try {
    // Fetch all employees for the dropdown
    const employees = await query(
      "SELECT employee_code, employee_name, title, department FROM employees ORDER BY employee_name ASC", 
      [], 
      'fetchall'
    ) || [];

    res.render('hr/ask_employees', {
      user: req.session.user,
      pageTitle: 'Ask Employees - Send Request',
      employees: employees
    });
  } catch (error) {
    console.error("Ask Employees View Error:", error);
    res.status(500).send('Error loading page.');
  }
});

// Submit Request to Employee
router.post('/ask_employees', requirePermission('ask_employees'), uploadDocFromHR.single('document_file'), async (req, res) => {
  try {
    const { recipient_code, document_type, message } = req.body;
    
    if (!recipient_code || !document_type) {
      req.flash('danger', 'Please select an employee and specify document type.');
      return res.redirect('/ask_employees');
    }

    // Get Recipient Name
    const recipient = await query(
      "SELECT employee_name FROM employees WHERE employee_code = ?", 
      [recipient_code], 
      'fetchone'
    );

    if (!recipient) {
      req.flash('danger', 'Invalid employee selected.');
      return res.redirect('/ask_employees');
    }

    const filePath = req.file ? `${DOC_UPLOAD_FOLDER}/${req.file.filename}` : null;
    const fileType = req.file ? req.file.mimetype : null;

    if (!filePath) {
      const textMessage = [document_type, message].filter(Boolean).join('\n\n');
      await query(
        `INSERT INTO hr_messages (sender_code, sender_name, recipient_code, recipient_name, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'New', NOW())`,
        [
          req.session.user.employee_code,
          req.session.user.employee_name,
          recipient_code,
          recipient.employee_name,
          textMessage
        ],
        'commit'
      );

      await notificationsService.addNotification(recipient_code, null, `New message from HR: ${document_type}.`, {
        category: 'hr_message',
        link_url: '/request_hr'
      });

      req.flash('success', 'Message sent to employee successfully.');
      return res.redirect('/ask_employees');
    }

    // Insert into hr_document_requests table
    const sql = `
      INSERT INTO hr_document_requests (
        employee_code, employee_name, requested_by_code, requested_by_name, 
        document_type, description, message, attachment_path, file_type, status, created_at
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())
    `;
    
    const params = [
      recipient_code,
      recipient.employee_name,
      req.session.user.employee_code,
      req.session.user.employee_name,
      document_type,
      '', // description can be empty or merged with message
      message,
      filePath,
      fileType
    ];

    await query(sql, params, 'commit');

    await notificationsService.addNotification(recipient_code, null, `New request from HR: ${document_type}.`, {
      category: 'hr_request',
      link_url: '/request_hr'
    });

    req.flash('success', 'Request sent to employee successfully.');
    res.redirect('/ask_employees');
  } catch (error) {
    console.error("Submit Request Error:", error);
    req.flash('danger', 'Failed to send request: ' + error.message);
    res.redirect('/ask_employees');
  }
});

module.exports = router;
