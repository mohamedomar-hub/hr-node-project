/**
 * File: src/routes/businessRewardsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../core/authUtils');

// Business Rewards Home Page (For MR, DM, AM only)
router.get('/business_rewards', requireLogin, (req, res) => {
  // Optional: Check if user role is MR, DM, or AM
  const userRole = req.session.user ? req.session.user.title : '';
  const allowedRoles = ['MR', 'DM', 'AM'];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).send('Access Denied. This page is for MR, DM, and AM only.');
  }

  res.render('business_rewards', {
    user: req.session.user,
    pageTitle: 'Business Rewards'
  });
});

module.exports = router;