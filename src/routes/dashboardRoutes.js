/**
 * File: src/routes/dashboardRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requirePermission } = require('../core/authUtils');
const employeeService = require('../core/employeeService');

router.get('/dashboard', requirePermission('dashboard'), async (req, res) => {
  const user = req.session.user;

  try {
    // 1. Get Total Employees
    const totalEmp = await employeeService.totalEmployees ? await employeeService.totalEmployees() : 0;
    
    // 2. Get Headcount by Department
    const byDept = await employeeService.headcountByDepartment ? await employeeService.headcountByDepartment() : [];

    // Render Dashboard with Stats
    res.render('dashboard', { 
      user: user, 
      pageTitle: 'Dashboard Overview',
      stats: { 
        total: totalEmp, 
        by_department: byDept 
      } 
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send('Server Error loading dashboard stats.');
  }
});

module.exports = router;