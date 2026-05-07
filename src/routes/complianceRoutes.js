/**
 * File: src/routes/complianceRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../core/authUtils');
const { query } = require('../core/db');

// Notify Compliance Page (For MRs Only)
router.get('/notify_compliance', requireLogin, async (req, res) => {
  try {
    const complianceTeam = await query(
      `SELECT employee_code, employee_name, title 
       FROM employees 
       WHERE title IN ('Performance Excellence Manager', 'Associate Compliance', 'Field Compliance Specialist', 'Performance Excellence Manager') 
       ORDER BY title, employee_name`,
      [],
      'fetchall'
    ) || [];

    res.render('compliance/notify', {
      user: req.session.user,
      pageTitle: 'Notify Compliance',
      compliance_team: complianceTeam
    });
  } catch (error) {
    console.error("Notify Compliance Error:", error);
    res.status(500).send('Error loading page.');
  }
});

// Submit Compliance Message
router.post('/notify_compliance', requireLogin, async (req, res) => {
  try {
    const { compliance_code, message } = req.body;
    
    if (!compliance_code || !message) {
      req.flash('danger', 'Please select a compliance member and write a message.');
      return res.redirect('/notify_compliance');
    }

    const complianceMember = await query(
      "SELECT employee_name FROM employees WHERE employee_code = ?", 
      [compliance_code], 
      'fetchone'
    );

    const manager = await query(
      "SELECT employee_code, employee_name FROM employees WHERE employee_code = ?", 
      [req.session.user.manager_code], 
      'fetchone'
    );

    if (!complianceMember || !manager) {
      req.flash('danger', 'Invalid recipient or manager not found.');
      return res.redirect('/notify_compliance');
    }

    const sql = `
      INSERT INTO compliance_messages (
        mr_code, mr_name, compliance_recipient, compliance_code, 
        manager_code, manager_name, message, status, created_at, deleted_by_user_code
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 'New', NOW(), NULL)
    `;
    
    const params = [
      req.session.user.employee_code,
      req.session.user.employee_name,
      complianceMember.employee_name,
      compliance_code,
      manager.employee_code,
      manager.employee_name,
      message
    ];

    await query(sql, params, 'commit');

    req.flash('success', 'Message sent to Compliance and your Manager successfully.');
    res.redirect('/notify_compliance');
  } catch (error) {
    console.error("Submit Compliance Error:", error);
    req.flash('danger', 'Failed to send message: ' + error.message);
    res.redirect('/notify_compliance');
  }
});

// Report Compliance Page (For Compliance Team & Managers ONLY)
router.get('/report_compliance', requireLogin, async (req, res) => {
  try {
    const userCode = req.session.user.employee_code;
    const userTitle = req.session.user.title;

    const allowedComplianceRoles = [
      'Performance Excellence Manager',
      'Associate Compliance',
      'Field Compliance Specialist'
    ];

    const allowedManagerRoles = ['DM', 'AM'];

    const isComplianceUser = allowedComplianceRoles.includes(userTitle);
    const isManagerUser = allowedManagerRoles.includes(userTitle);

    if (!isComplianceUser && !isManagerUser) {
      return res.status(403).send('Access Denied. You are not authorized to view this page.');
    }

    let sql = "";
    let params = [];

    // IMPORTANT: We now exclude messages where deleted_by_user_code = current user
    if (isComplianceUser) {
      sql = `
        SELECT * FROM compliance_messages 
        WHERE compliance_code = ? 
        AND (deleted_by_user_code IS NULL OR deleted_by_user_code != ?)
        ORDER BY created_at DESC
      `;
      params = [userCode, userCode];
    } else if (isManagerUser) {
      const mrCodesResult = await query(
        "SELECT employee_code FROM employees WHERE manager_code = ?",
        [userCode],
        'fetchall'
      );
      
      if (!mrCodesResult || mrCodesResult.length === 0) {
        return res.render('compliance/report', {
          user: req.session.user,
          pageTitle: 'Report Compliance',
          messages_list: []
        });
      }

      const mrCodes = mrCodesResult.map(r => r.employee_code);
      const placeholders = mrCodes.map(() => '?').join(',');
      
      sql = `
        SELECT * FROM compliance_messages 
        WHERE mr_code IN (${placeholders}) 
        AND (deleted_by_user_code IS NULL OR deleted_by_user_code != ?)
        ORDER BY created_at DESC
      `;
      params = [...mrCodes, userCode];
    }

    const messages_list = await query(sql, params, 'fetchall') || [];

    res.render('compliance/report', {
      user: req.session.user,
      pageTitle: 'Report Compliance',
      messages_list: messages_list
    });
  } catch (error) {
    console.error("Report Compliance Error:", error);
    res.status(500).send('Error loading reports: ' + error.message);
  }
});

// Delete (Hide) Compliance Message for Current User Only
router.post('/report_compliance/delete/:id', requireLogin, async (req, res) => {
  try {
    const messageId = req.params.id;
    const userCode = req.session.user.employee_code;
    const userTitle = req.session.user.title;

    const allowedRoles = [
      'Performance Excellence Manager',
      'Associate Compliance',
      'Field Compliance Specialist',
      'DM',
      'AM'
    ];

    if (!allowedRoles.includes(userTitle)) {
      return res.status(403).send('Access Denied.');
    }

    // Instead of DELETE, we UPDATE the record to mark it as deleted by this user
    const sql = `
      UPDATE compliance_messages 
      SET deleted_by_user_code = ? 
      WHERE id = ?
    `;
    
    await query(sql, [userCode, messageId], 'commit');

    req.flash('success', 'Message removed from your view successfully.');
    res.redirect('/report_compliance');

  } catch (error) {
    console.error("Hide Compliance Message Error:", error);
    req.flash('danger', 'Failed to remove message: ' + error.message);
    res.redirect('/report_compliance');
  }
});

module.exports = router;