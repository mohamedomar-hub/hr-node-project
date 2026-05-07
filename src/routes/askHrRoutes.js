/**
 * File: src/routes/askHrRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../core/authUtils');
const { query } = require('../core/db');
const notificationsService = require('../core/notificationsService');

// Ask HR Page (For All Employees)
router.get('/ask_hr', requireLogin, async (req, res) => {
  try {
    // Fetch HR employees for the dropdown
    // Using TRIM to handle any extra spaces in the department column
    const sql = `
      SELECT employee_code, employee_name, title, department 
      FROM employees 
      WHERE TRIM(department) = 'HR' 
         OR TRIM(title) LIKE '%HR%' 
      ORDER BY employee_name ASC
    `;
    
    const hrEmployees = await query(sql, [], 'fetchall') || [];

    console.log("=== DEBUG: Found HR Employees ===");
    console.log(hrEmployees); // This will print the actual data found in terminal
    console.log("Total Count:", hrEmployees.length);

    res.render('hr/ask_hr', {
      user: req.session.user,
      pageTitle: 'Ask HR',
      hr_employees: hrEmployees
    });
  } catch (error) {
    console.error("Ask HR View Error:", error);
    res.status(500).send('Error loading Ask HR page.');
  }
});

// Submit Ask HR Message
router.post('/ask_hr', requireLogin, async (req, res) => {
  try {
    const { recipient_code, message } = req.body;
    
    if (!recipient_code || !message) {
      req.flash('danger', 'Please select an HR member and write a message.');
      return res.redirect('/ask_hr');
    }

    const recipient = await query(
      "SELECT employee_name FROM employees WHERE employee_code = ?", 
      [recipient_code], 
      'fetchone'
    );

    if (!recipient) {
      req.flash('danger', 'Invalid HR member selected.');
      return res.redirect('/ask_hr');
    }

    const sql = `
      INSERT INTO hr_messages (sender_code, sender_name, recipient_code, recipient_name, message, status, created_at) 
      VALUES (?, ?, ?, ?, ?, 'New', NOW())
    `;
    const params = [
      req.session.user.employee_code,
      req.session.user.employee_name,
      recipient_code,
      recipient.employee_name,
      message
    ];

    await query(sql, params, 'commit');

    await notificationsService.addNotification(recipient_code, null, `New message from ${req.session.user.employee_name} (${req.session.user.employee_code}).`, {
      category: 'message_in',
      link_url: '/hr_inbox'
    });

    req.flash('success', 'Your message has been sent to HR successfully.');
    res.redirect('/ask_hr');
  } catch (error) {
    console.error("Submit Ask HR Error:", error);
    req.flash('danger', 'Failed to send message: ' + error.message);
    res.redirect('/ask_hr');
  }
});

module.exports = router;
