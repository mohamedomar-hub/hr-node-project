/**
 * File: src/routes/requestHrRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireLogin } = require('../core/authUtils');
const { query } = require('../core/db');
const notificationsService = require('../core/notificationsService');

// Configure Multer for Document Uploads
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
const uploadDoc = multer({ storage: docStorage });

// Request HR Home Page (Shows Two Tabs: Inbox & Document Requests)
router.get('/request_hr', requireLogin, async (req, res) => {
  try {
    const empCode = req.session.user.employee_code;

    // Tab 1: Get Ask HR replies and direct text messages sent from HR to this employee.
    const askHrReplies = await query(
      `SELECT *,
        CASE
          WHEN sender_code = ? THEN 'reply'
          ELSE 'direct'
        END AS inbox_type
       FROM hr_messages
       WHERE (sender_code = ? AND reply IS NOT NULL)
          OR (recipient_code = ? AND (reply IS NULL OR reply = ''))
       ORDER BY COALESCE(updated_at, created_at) DESC`,
      [empCode, empCode, empCode],
      'fetchall'
    ) || [];

    // Tab 2: Get document requests sent to this employee
    const docRequests = await query(
      "SELECT * FROM hr_document_requests WHERE employee_code = ? AND attachment_path IS NOT NULL AND attachment_path <> '' ORDER BY created_at DESC",
      [empCode],
      'fetchall'
    ) || [];

    res.render('hr/request_hr', {
      user: req.session.user,
      pageTitle: 'HR Communicate Center',
      ask_hr_replies: askHrReplies,
      doc_requests: docRequests
    });
  } catch (error) {
    console.error("Request HR Error:", error);
    res.status(500).send('Error loading requests.');
  }
});

// Submit Document for a Request
router.post('/request_hr/submit_doc/:id', requireLogin, uploadDoc.single('document_file'), async (req, res) => {
  try {
    const requestId = req.params.id;
    const empCode = req.session.user.employee_code;
    const filePath = req.file ? `${DOC_UPLOAD_FOLDER}/${req.file.filename}` : null;

    if (!filePath) {
      req.flash('danger', 'Please upload a file.');
      return res.redirect('/request_hr');
    }

    const reqRow = await query(
      "SELECT requested_by_code, document_type FROM hr_document_requests WHERE id = ? AND employee_code = ? LIMIT 1",
      [requestId, empCode],
      'fetchone'
    );

    const sql = `
      UPDATE hr_document_requests 
      SET attachment_path = ?, status = 'Submitted', updated_at = NOW() 
      WHERE id = ? AND employee_code = ?
    `;
    
    await query(sql, [filePath, requestId, empCode], 'commit');

    if (reqRow && reqRow.requested_by_code) {
      await notificationsService.addNotification(reqRow.requested_by_code, null, `Employee ${empCode} submitted requested document (${reqRow.document_type || 'document'}).`, {
        category: 'hr_request_submit',
        link_url: '/ask_employees'
      });
    }

    req.flash('success', 'Document submitted successfully.');
    res.redirect('/request_hr');
  } catch (error) {
    console.error("Submit Doc Error:", error);
    req.flash('danger', 'Failed to submit document.');
    res.redirect('/request_hr');
  }
});

// Delete Ask HR Message (For Sender or Recipient)
router.post('/request_hr/delete_message/:id', requireLogin, async (req, res) => {
  try {
    const messageId = req.params.id;
    const userCode = req.session.user.employee_code;

    // Allow deletion if the user is either the sender or the recipient
    const sql = "DELETE FROM hr_messages WHERE id = ? AND (sender_code = ? OR recipient_code = ?)";
    await query(sql, [messageId, userCode, userCode], 'commit');

    req.flash('success', 'Message deleted successfully.');
    res.redirect('/request_hr');
  } catch (error) {
    console.error("Delete Message Error:", error);
    req.flash('danger', 'Failed to delete message.');
    res.redirect('/request_hr');
  }
});

// Delete Document Request (For Sender HR or Recipient Employee)
router.post('/request_hr/delete_doc_request/:id', requireLogin, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userCode = req.session.user.employee_code;

    // Allow deletion if the user is either the requester (HR) or the recipient (Employee)
    const sql = "DELETE FROM hr_document_requests WHERE id = ? AND (requested_by_code = ? OR employee_code = ?)";
    await query(sql, [requestId, userCode, userCode], 'commit');

    req.flash('success', 'Document request deleted successfully.');
    res.redirect('/request_hr');
  } catch (error) {
    console.error("Delete Doc Request Error:", error);
    req.flash('danger', 'Failed to delete request.');
    res.redirect('/request_hr');
  }
});

module.exports = router;
