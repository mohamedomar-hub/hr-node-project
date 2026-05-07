/**
 * File: src/routes/idpRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requirePermission } = require('../core/authUtils');
const idpService = require('../core/idpService');
const selfDevService = require('../core/selfDevService');
const certificateService = require('../core/certificateService');
const notificationsService = require('../core/notificationsService');

function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// IDP for MR
router.get('/idpMR', requirePermission('idp_plan'), async (req, res) => {
  const user = req.session.user;
  const existing = await idpService.getReport(user.employee_code) || {};
  const departments = ["Sales", "Marketing", "HR", "SFE", "Distribution", "Market Access"];
  res.render('idp_mr', { user: user, existing: existing, departments: departments });
});

router.post('/idpMR', requirePermission('idp_plan'), async (req, res) => {
  const user = req.session.user;
  const selected = normalizeToArray(req.body.departments);
  if (selected.length > 2) {
    req.flash('danger', 'You can select up to two departments.');
    return res.redirect('/idpMR');
  }

  const strengths = [req.body.strength1, req.body.strength2, req.body.strength3].filter(s => s && s.trim());
  const development = [req.body.dev1, req.body.dev2, req.body.dev3].filter(d => d && d.trim());
  const action = req.body.action || '';

  await idpService.saveReport(user.employee_code, user.employee_name, selected, strengths, development, action);
  req.flash('success', 'Development plan saved.');
  res.redirect('/idpMR');
});

// Self Development
router.get('/self_dev', requirePermission('self_development'), async (req, res) => {
  const user = req.session.user;
  const entries = await selfDevService.listEntries(user.employee_code);
  res.render('self_dev', { user: user, entries: entries });
});

router.post('/self_dev', requirePermission('self_development'), selfDevService.upload.single('evidence'), async (req, res) => {
  try {
    const user = req.session.user;
    const filePath = req.file ? req.file.path : null;

    if (!filePath) {
      req.flash('warning', 'Please attach a file before saving.');
      return res.redirect('/self_dev');
    }

    await selfDevService.saveEntry(user.employee_code, user.employee_name, '', '', '', filePath);
    await notificationsService.addNotification(null, 'HR', `New self development entry from ${user.employee_name} (${user.employee_code}).`, {
      category: 'self_development',
      link_url: '/hr_dev'
    });
    req.flash('success', filePath ? 'Self development certificate saved and sent to HR.' : 'Self development plan saved and sent to HR.');
    res.redirect('/self_dev');
  } catch (error) {
    console.error('Self development save error:', error);
    req.flash('danger', 'Failed to save self development entry.');
    res.redirect('/self_dev');
  }
});

router.get('/self_dev/file/:id', requirePermission('self_development'), async (req, res) => {
  const user = req.session.user;
  const filePath = await selfDevService.getResolvedAttachmentPath(req.params.id, user.employee_code);

  if (!filePath) {
    return res.status(404).send('File not found.');
  }

  return res.sendFile(filePath);
});

router.post('/self_dev/:id/delete', requirePermission('self_development'), async (req, res) => {
  const user = req.session.user;
  const deleted = await selfDevService.deleteEntry(req.params.id, user.employee_code);

  if (deleted) {
    req.flash('success', 'Self development entry deleted successfully.');
  } else {
    req.flash('danger', 'Entry not found or could not be deleted.');
  }

  res.redirect('/self_dev');
});

// IDP for AM (with Certificates)
router.get('/idpAM', requirePermission('idp_cert_development'), async (req, res) => {
  const user = req.session.user;
  const existing = await idpService.getReport(user.employee_code) || {};
  const myCerts = await certificateService.listCertificates(user.employee_code);
  const departments = ["Sales", "Marketing", "HR", "SFE", "Distribution", "Market Access"];
  res.render('idp_am', { user: user, existing: existing, my_certs: myCerts, departments: departments });
});

router.post('/idpAM', requirePermission('idp_cert_development'), certificateService.upload.single('certificate'), async (req, res) => {
  const user = req.session.user;
  
  // Handle Plan Update
  if (req.body.departments) {
    const selected = normalizeToArray(req.body.departments);
    if (selected.length > 2) {
      req.flash('danger', 'You can select up to two departments.');
    } else {
      const strengths = [req.body.strength1, req.body.strength2, req.body.strength3].filter(s => s && s.trim());
      const development = [req.body.dev1, req.body.dev2, req.body.dev3].filter(d => d && d.trim());
      const action = req.body.action || '';
      await idpService.saveReport(user.employee_code, user.employee_name, selected, strengths, development, action);
      req.flash('success', 'Development plan saved successfully.');
    }
  }

  // Handle Certificate Upload
  if (req.file) {
    await certificateService.saveCertificate(req.file, user.employee_code, user.employee_name);
    req.flash('success', 'Certificate uploaded and sent to HR.');
  }

  res.redirect('/idpAM');
});

module.exports = router;
