/**
 * File: src/routes/salaryAliasRoutes.js
 */
const express = require('express');
const router = express.Router();

router.get('/salary/monthly', (req, res) => {
  res.redirect('/salary/my');
});

module.exports = router;