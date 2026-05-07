/**
 * File: src/routes/structureRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../core/authUtils'); // Changed from requirePermission to requireLogin
const { query } = require('../core/db');

// Structure Page - Accessible to ALL logged-in users
router.get('/structure', requireLogin, async (req, res) => {
  console.log("DEBUG: Structure route accessed by user:", req.session.user ? req.session.user.employee_code : 'Guest');
  
  try {
    // استعلام يجلب بيانات الموظف واسم مديره عبر JOIN
    const sql = `
      SELECT 
        e.employee_code, 
        e.employee_name, 
        e.title, 
        e.department, 
        e.manager_code,
        e.hire_date,
        e.email,
        e.mobile,
        m.employee_name AS manager_name 
      FROM employees e 
      LEFT JOIN employees m ON e.manager_code = m.employee_code 
      ORDER BY e.department ASC, e.employee_name ASC
    `;
    
    const employees = await query(sql, [], 'fetchall');

    res.render('structure/structure', {
      user: req.session.user,
      pageTitle: 'Company Structure',
      employees: employees || []
    });
  } catch (error) {
    console.error("CRITICAL ERROR in Structure Route:", error);
    res.status(500).send('Error loading structure: ' + error.message);
  }
});

module.exports = router;
