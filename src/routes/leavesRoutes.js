/**
 * File: src/routes/leavesRoutes.js
 * Updated to support new Manager Roles and fix access issues
 */

const express = require('express');
const router = express.Router();
const { requireLogin } = require('../core/authUtils'); // Removed roleRequired for more flexible check inside handler
const leavesService = require('../core/leavesService');
const employeeService = require('../core/employeeService');
const notificationsService = require('../core/notificationsService');

// ==================== HANDLERS ====================

// GET /leaves – Display employee's own leave balance and requests
async function getLeavesHandler(req, res) {
  const user = req.session.user;
  try {
    const emp = await employeeService.getEmployeeByCode(user.employee_code);
    const balance = await leavesService.getLeaveBalance(user.employee_code);
    const myLeaves = await leavesService.listEmployeeLeaves 
      ? await leavesService.listEmployeeLeaves(user.employee_code)
      : [];

    res.render('leaves/leaves', {
      user: user,
      balance: balance,
      leaves: myLeaves,
      manager: emp ? await employeeService.getEmployeeByCode(emp.manager_code) : null
    });
  } catch (error) {
    console.error('Error in getLeavesHandler:', error);
    req.flash('danger', 'Failed to load leave data.');
    res.redirect('/');
  }
}

/// POST /leaves – Submit new leave request
async function postLeavesHandler(req, res) {
  try {
    const user = req.session.user;
    const emp = await employeeService.getEmployeeByCode(user.employee_code);
    
    const startDate = req.body.start;
    const endDate = req.body.end;
    const leaveType = req.body.type || 'Annual';
    const reason = req.body.reason || '';
    
    if (!startDate || !endDate) {
      req.flash('danger', 'Start date and end date are required');
      return res.redirect('/leaves');
    }
    
    const leaveData = {
      'Employee Code': user.employee_code,
      'Manager Code': emp?.manager_code || null,
      'Manager Name': emp?.manager_name || '',
      'Leave Type': leaveType,
      'Start Date': startDate,
      'End Date': endDate,
      'Reason': reason,
      'Status': 'Pending',
      'Comment': null,
      'Decision Date': null
    };
    
    await leavesService.createLeave(leaveData);
    
    // Notify Manager
    if (emp?.manager_code) {
      await notificationsService.addNotification(emp.manager_code, null, `New leave request from ${user.employee_name || user.employee_code}`, {
        category: 'leave_request',
        link_url: '/leave/manager'
      });
    }
    
    req.flash('success', 'Leave request submitted successfully.');
    res.redirect('/leaves');
  } catch (error) {
    console.error('Leave request error:', error);
    req.flash('danger', 'Failed to submit leave request: ' + error.message);
    res.redirect('/leaves');
  }
}

// GET /leave/manager – Manager view of pending/historical leaves
async function managerLeavesHandler(req, res) {
  const user = req.session.user;
  
  // Check if user is a manager by checking if anyone reports to them
  // Or check specific roles if needed. Here we rely on the service returning empty if not a manager.
  try {
    const pending = await leavesService.listManagerLeaves 
      ? await leavesService.listManagerLeaves(user.employee_code, false)
      : [];
    const history = await leavesService.listManagerLeaves 
      ? await leavesService.listManagerLeaves(user.employee_code, true)
      : [];

    // If user has no team members, show a message or redirect, but don't crash
    if (pending.length === 0 && history.length === 0) {
       // Optional: You can add a flash message here if you want
       // req.flash('info', 'You have no team members with pending leave requests.');
    }

    res.render('leaves/manager', { 
      user, 
      leaves: pending, 
      history,
      pageTitle: 'Leave Approvals' // Ensure title is passed
    });
  } catch (error) {
    console.error('Error in managerLeavesHandler:', error);
    req.flash('danger', 'Failed to load manager leave requests.');
    res.redirect('/');
  }
}

// Approve leave
async function approveLeaveHandler(req, res) {
  const leaveId = req.params.id;
  const user = req.session.user;
  
  try {
    // Security Check: Ensure the leave belongs to a team member of this manager
    const leaveDetails = await require('../core/db').query(
      "SELECT employee_code, manager_code FROM leaves WHERE id=?", 
      [leaveId], 
      'fetchone'
    );

    if (!leaveDetails) {
      req.flash('danger', 'Leave request not found.');
      return res.redirect('/leave/manager');
    }

    // Verify authorization: The manager_code in the leave must match the current user's code
    // OR the current user is an HR/Admin with override permissions (optional logic)
    if (leaveDetails.manager_code !== user.employee_code) {
       // Allow HR or specific admins if needed, otherwise block
       // For now, strict check:
       req.flash('danger', 'Unauthorized action: This request does not belong to your team.');
       return res.redirect('/leave/manager');
    }

    await leavesService.updateLeaveStatus(leaveId, 'Approved', 'Approved by Manager');
    
    // Notify Employee
    if (leaveDetails.employee_code) {
      await notificationsService.addNotification(
        leaveDetails.employee_code, 
        null, 
        `Your leave request has been Approved.`, 
        {
          category: 'leave_status',
          link_url: '/leaves'
        }
      );
    }

    req.flash('success', 'Leave approved successfully.');
    res.redirect('/leave/manager');
  } catch (error) {
    console.error('Approve error:', error);
    req.flash('danger', 'Failed to approve leave: ' + error.message);
    res.redirect('/leave/manager');
  }
}

// Reject leave
async function rejectLeaveHandler(req, res) {
  const leaveId = req.params.id;
  const user = req.session.user;

  try {
    // Security Check
    const leaveDetails = await require('../core/db').query(
      "SELECT employee_code, manager_code FROM leaves WHERE id=?", 
      [leaveId], 
      'fetchone'
    );

    if (!leaveDetails) {
      req.flash('danger', 'Leave request not found.');
      return res.redirect('/leave/manager');
    }

    if (leaveDetails.manager_code !== user.employee_code) {
       req.flash('danger', 'Unauthorized action: This request does not belong to your team.');
       return res.redirect('/leave/manager');
    }

    await leavesService.updateLeaveStatus(leaveId, 'Rejected', 'Rejected by Manager');
    
    // Notify Employee
    if (leaveDetails.employee_code) {
      await notificationsService.addNotification(
        leaveDetails.employee_code, 
        null, 
        `Your leave request has been Rejected.`, 
        {
          category: 'leave_status',
          link_url: '/leaves'
        }
      );
    }

    req.flash('success', 'Leave rejected successfully.');
    res.redirect('/leave/manager');
  } catch (error) {
    console.error('Reject error:', error);
    req.flash('danger', 'Failed to reject leave: ' + error.message);
    res.redirect('/leave/manager');
  }
}

// ==================== ROUTES ====================

// Main leaves page (GET & POST)
router.get('/leaves', requireLogin, getLeavesHandler);
router.post('/leaves', requireLogin, postLeavesHandler);

// Aliases (Flask compatibility)
router.get('/leave/request', requireLogin, getLeavesHandler);
router.post('/leave/request', requireLogin, postLeavesHandler);

router.get('/leave/my', requireLogin, (req, res) => res.redirect('/leaves'));

// Manager leaves page - Removed strict roleRequired to allow new roles defined in Sidebar
// Authorization is now handled inside the handler by checking team membership
router.get('/leave/manager', requireLogin, managerLeavesHandler);
router.get('/leaves/team', requireLogin, managerLeavesHandler);

// Approve / Reject - Protected by Login + Internal Handler Check
router.get('/leave/approve/:id', requireLogin, approveLeaveHandler);
router.get('/leave/reject/:id', requireLogin, rejectLeaveHandler);

// Legacy CSV export endpoints (from Flask)
router.get('/leaves/report.csv', requireLogin, async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leaves_report.csv');
  res.send('Employee Code,Leave Type,Start,End,Status\n');
});

module.exports = router;