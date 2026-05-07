/**
 * File: src/routes/authRoutes.js
 */
const express = require('express');
const router = express.Router();
const { verifyPassword, hashPassword } = require('../core/utils'); 
const employeeService = require('../core/employeeService');
const notificationsService = require('../core/notificationsService');

// --- LOGIN ROUTES ---

// Login Page (GET)
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  
  // Render login page without layout to ensure it's a standalone full-page view
  res.render('auth/login', { 
      layout: false, 
      pageTitle: 'Login',
      error: null 
  });
});

// Login Action (POST)
router.post('/login', async (req, res) => {
  const { employee_code, password } = req.body;

  try {
    if (!employee_code || !password) {
        return res.render('auth/login', { 
            layout: false,
            pageTitle: 'Login',
            error: 'Please provide both Employee Code and Password.' 
        });
    }

    const user = await employeeService.getEmployeeByCode(employee_code);

    if (user) {
        const isMatch = await verifyPassword(password, user.password_hash);
        
        if (isMatch) {
          req.session.user = user;
          req.flash('success', 'Logged in successfully.');
          return res.redirect('/dashboard');
        } else {
          return res.render('auth/login', { 
              layout: false,
              pageTitle: 'Login',
              error: 'Invalid Employee Code or Password.' 
          });
        }
    } else {
        return res.render('auth/login', { 
            layout: false,
            pageTitle: 'Login',
            error: 'Invalid Employee Code or Password.' 
        });
    }

  } catch (error) {
    console.error("Login Error:", error);
    return res.render('auth/login', { 
        layout: false,
        pageTitle: 'Login',
        error: 'A database error occurred. Please try again later.' 
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout Error:", err);
    res.redirect('/login');
  });
});

// --- PASSWORD RESET ROUTES ---

// Reset Password Page (GET)
router.get('/password/reset', (req, res) => {
  // Render reset password page without layout
  res.render('auth/reset_password', { 
      layout: false, 
      pageTitle: 'Reset Password'
  });
});

// Reset Password Action (POST)
router.post('/password/reset', async (req, res) => {
  const { employee_code, new_password, confirm_password } = req.body;

  if (!employee_code || !new_password || !confirm_password) {
      req.flash('danger', 'All fields are required.');
      return res.redirect('/password/reset');
  }

  if (new_password !== confirm_password) {
    req.flash('danger', 'New passwords do not match.');
    return res.redirect('/password/reset');
  }

  try {
    const user = await employeeService.getEmployeeByCode(employee_code);
    if (!user) {
      req.flash('danger', 'Employee code not found in the system.');
      return res.redirect('/password/reset');
    }

    const newHash = await hashPassword(new_password);
    const { query } = require('../core/db');
    
    // Update the password in the database
    await query("UPDATE employees SET password_hash = ? WHERE employee_code = ?", [newHash, employee_code], 'commit');

    req.flash('success', 'Password reset successfully. Please login with your new password.');
    res.redirect('/login');

  } catch (error) {
    console.error("Reset Password Error:", error);
    req.flash('danger', 'An error occurred while resetting password. Please try again.');
    res.redirect('/password/reset');
  }
});

// --- CHANGE PASSWORD ROUTES (For Logged-in Users) ---

// Change Password Page (GET)
router.get('/password/change', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('auth/change_password', { 
      user: req.session.user, 
      pageTitle: 'Change Password',
      error: null, 
      success: null 
  });
});

// Change Password Action (POST)
router.post('/password/change', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  
  const { current_password, new_password, confirm_password } = req.body;
  
  if (new_password !== confirm_password) {
    return res.render('auth/change_password', { 
      user: req.session.user, 
      pageTitle: 'Change Password',
      error: 'New passwords do not match.', 
      success: null 
    });
  }

  try {
      const dbUser = await employeeService.getEmployeeByCode(req.session.user.employee_code);
      
      if (!dbUser || !(await verifyPassword(current_password, dbUser.password_hash))) {
        return res.render('auth/change_password', { 
          user: req.session.user, 
          pageTitle: 'Change Password',
          error: 'Current password is incorrect.', 
          success: null 
        });
      }

      const newHash = await hashPassword(new_password);
      const { query } = require('../core/db');
      
      // Update the password in the database
      await query("UPDATE employees SET password_hash=? WHERE employee_code=?", [newHash, req.session.user.employee_code], 'commit');
      
      // Update session reference
      req.session.user.password_hash = newHash;
      
      // Optional: Log notification for security audit
      if (notificationsService && notificationsService.addNotification) {
          await notificationsService.addNotification(null, 'HR', `Employee ${req.session.user.employee_code} changed their password.`);
      }
      
      res.render('auth/change_password', { 
        user: req.session.user, 
        pageTitle: 'Change Password',
        error: null, 
        success: 'Password updated successfully.' 
      });

  } catch (error) {
      console.error("Change Password Error:", error);
      res.render('auth/change_password', { 
        user: req.session.user, 
        pageTitle: 'Change Password',
        error: 'An error occurred while updating password.', 
        success: null 
      });
  }
});

module.exports = router;