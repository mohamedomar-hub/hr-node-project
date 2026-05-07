/**
 * File: src/routes/extraRoutes.js
 * Additional routes for specialized permissions:
 * - /hr_dev (employee_development) - HR only
 * - /hr_dev/export (employee_development) - HR only
 * - /hr_emails (hr_manager) - HR only
 * - /hr_emails/export (hr_manager) - HR only
 */
const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();
const { roleRequired } = require('../core/authUtils');
const { query } = require('../core/db');
const certificateService = require('../core/certificateService');
const idpService = require('../core/idpService');
const selfDevService = require('../core/selfDevService');
const personalEmailService = require('../core/personalEmailService');

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function stringifyList(value, separator = ', ') {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(separator);
  return String(value);
}

async function getHrDevelopmentPayload(req) {
  if (req.query.clear) {
    req.session.hide_hr_dev = true;
    req.session.clear_hr_dev_before = new Date().toISOString();
  }

  if (req.query.show) {
    delete req.session.hide_hr_dev;
    delete req.session.clear_hr_dev_before;
  }

  const hide = !!req.session.hide_hr_dev;
  const clearBefore = req.session.clear_hr_dev_before;

  let certs = [];
  let idpReports = [];
  let selfDevEntries = [];

  if (!hide) {
    certs = await certificateService.listCertificates();
    idpReports = await idpService.listAllReports();
    selfDevEntries = await selfDevService.listAllEntries();

    if (clearBefore) {
      const cutoff = new Date(clearBefore);
      if (!Number.isNaN(cutoff.getTime())) {
        certs = certs.filter((cert) => cert.created_at && new Date(cert.created_at) > cutoff);
        idpReports = idpReports.filter((report) => report.updated_at && new Date(report.updated_at) > cutoff);
        selfDevEntries = selfDevEntries.filter((entry) => entry.created_at && new Date(entry.created_at) > cutoff);
      }
    }
  }

  return {
    hide,
    certs,
    idpReports,
    selfDevEntries,
    stats: {
      certificates: certs.length,
      reports: idpReports.length,
      selfDev: selfDevEntries.length
    }
  };
}

// HR Dev Page (Employee Development)
router.get('/hr_dev', roleRequired('employee_development'), async (req, res) => {
  const payload = await getHrDevelopmentPayload(req);
  res.render('hr_dev', {
    user: req.session.user,
    hide: payload.hide,
    certs: payload.certs,
    idp_reports: payload.idpReports,
    self_dev_entries: payload.selfDevEntries,
    stats: payload.stats
  });
});

router.get('/hr_dev/export', roleRequired('employee_development'), async (req, res) => {
  const payload = await getHrDevelopmentPayload(req);
  const workbook = new ExcelJS.Workbook();

  const certSheet = workbook.addWorksheet('Certificates');
  certSheet.columns = [
    { header: 'Employee Code', key: 'employee_code', width: 18 },
    { header: 'Employee Name', key: 'employee_name', width: 30 },
    { header: 'Filename', key: 'filename', width: 38 },
    { header: 'Path', key: 'path', width: 50 },
    { header: 'Uploaded At', key: 'created_at', width: 24 }
  ];

  payload.certs.forEach((cert) => {
    certSheet.addRow({
      employee_code: cert.employee_code,
      employee_name: cert.employee_name,
      filename: cert.filename,
      path: cert.path,
      created_at: normalizeDate(cert.created_at)
    });
  });

  const idpSheet = workbook.addWorksheet('IDP Reports');
  idpSheet.columns = [
    { header: 'Employee Code', key: 'employee_code', width: 18 },
    { header: 'Employee Name', key: 'employee_name', width: 30 },
    { header: 'Departments', key: 'departments', width: 28 },
    { header: 'Strengths', key: 'strengths', width: 34 },
    { header: 'Development Areas', key: 'development', width: 34 },
    { header: 'Action Plan', key: 'action_plan', width: 44 },
    { header: 'Updated At', key: 'updated_at', width: 24 }
  ];

  payload.idpReports.forEach((report) => {
    idpSheet.addRow({
      employee_code: report.employee_code,
      employee_name: report.employee_name,
      departments: stringifyList(report.selected_departments),
      strengths: stringifyList(report.strengths, '\n'),
      development: stringifyList(report.development_areas, '\n'),
      action_plan: report.action_plan || '',
      updated_at: normalizeDate(report.updated_at)
    });
  });

  const selfDevSheet = workbook.addWorksheet('Self Development');
  selfDevSheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Employee Code', key: 'employee_code', width: 18 },
    { header: 'Employee Name', key: 'employee_name', width: 30 },
    { header: 'Goal', key: 'goal', width: 28 },
    { header: 'Skills', key: 'skills', width: 28 },
    { header: 'Plan', key: 'plan', width: 38 },
    { header: 'Attachment', key: 'attachment', width: 50 },
    { header: 'Created At', key: 'created_at', width: 24 }
  ];

  payload.selfDevEntries.forEach((entry) => {
    selfDevSheet.addRow({
      id: entry.id,
      employee_code: entry.employee_code,
      employee_name: entry.employee_name,
      goal: entry.goal || '',
      skills: entry.skills || '',
      plan: entry.plan || '',
      attachment: entry.attachment || '',
      created_at: normalizeDate(entry.created_at)
    });
  });

  [certSheet, idpSheet, selfDevSheet].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=employee_development_${Date.now()}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/hr_dev/certificate/:id', roleRequired('employee_development'), async (req, res) => {
  const filePath = await certificateService.getResolvedCertificatePath(req.params.id);

  if (!filePath) {
    return res.status(404).send('Certificate file not found.');
  }

  return res.sendFile(filePath);
});

router.get('/hr_dev/self_dev/:id/file', roleRequired('employee_development'), async (req, res) => {
  const filePath = await selfDevService.getResolvedAttachmentPathById(req.params.id);

  if (!filePath) {
    return res.status(404).send('Self development attachment not found.');
  }

  return res.sendFile(filePath);
});

router.post('/hr_dev/certificate/:id/delete', roleRequired('employee_development'), async (req, res) => {
  const deleted = await certificateService.deleteCertificate(req.params.id);
  if (deleted) {
    req.flash('success', 'Certificate deleted successfully.');
  } else {
    req.flash('danger', 'Certificate not found.');
  }
  res.redirect('/hr_dev');
});

router.post('/hr_dev/idp/:employeeCode/delete', roleRequired('employee_development'), async (req, res) => {
  await idpService.deleteReport(req.params.employeeCode);
  req.flash('success', 'IDP report deleted successfully.');
  res.redirect('/hr_dev');
});

router.post('/hr_dev/self_dev/:id/delete', roleRequired('employee_development'), async (req, res) => {
  const deleted = await selfDevService.deleteEntryById(req.params.id);
  if (deleted) {
    req.flash('success', 'Self development entry deleted successfully.');
  } else {
    req.flash('danger', 'Self development entry not found.');
  }
  res.redirect('/hr_dev');
});

// HR Emails Page (Personal Emails Management)
router.get('/hr_emails', roleRequired('personal_email'), async (req, res) => {
  if (req.query.clear) {
    req.session.hide_hr_emails = true;
    req.session.clear_hr_emails_before = new Date().toISOString();
  }

  if (req.query.show) {
    delete req.session.hide_hr_emails;
    delete req.session.clear_hr_emails_before;
  }

  const hide = !!req.session.hide_hr_emails;
  const clearBefore = req.session.clear_hr_emails_before;

  let emails = hide ? [] : await personalEmailService.listPersonalEmails();

  if (!hide && clearBefore) {
    const cutoff = new Date(clearBefore);
    if (!Number.isNaN(cutoff.getTime())) {
      emails = emails.filter((row) => row.updated_at && new Date(row.updated_at) > cutoff);
    }
  }

  res.render('hr/hr_emails', {
    user: req.session.user,
    pageTitle: 'Personal Emails',
    emails,
    hide
  });
});

// Export HR Emails
router.get('/hr_emails/export', roleRequired('personal_email'), async (req, res) => {
  const rows = await personalEmailService.listPersonalEmails();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Personal Emails');

  worksheet.columns = [
    { header: 'Employee Code', key: 'employee_code', width: 18 },
    { header: 'Employee Name', key: 'employee_name', width: 30 },
    { header: 'Title', key: 'title', width: 20 },
    { header: 'Department', key: 'department', width: 22 },
    { header: 'Email', key: 'email', width: 34 },
    { header: 'Facebook Email', key: 'facebook_email', width: 34 },
    { header: 'Updated At', key: 'updated_at', width: 24 }
  ];

  rows.forEach((row) => {
    worksheet.addRow({
      employee_code: row.employee_code,
      employee_name: row.employee_name,
      title: row.title || '',
      department: row.department || '',
      email: row.email || '',
      facebook_email: row.facebook_email || '',
      updated_at: normalizeDate(row.updated_at)
    });
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=hr_emails_${Date.now()}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
