const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { requireLogin, getUserRole } = require('../core/authUtils');
const notificationsService = require('../core/notificationsService');
const appraisalService = require('../core/appraisalService');
const dmAppraisalService = require('../core/dmAppraisalService');
const amAppraisalService = require('../core/amAppraisalService');
const { APPRAISAL_SECTIONS } = require('../core/appraisalTemplate');
const { DM_APPRAISAL_SECTIONS } = require('../core/dmAppraisalTemplate');
const { AM_APPRAISAL_SECTIONS } = require('../core/amAppraisalTemplate');

const HR_APPRAISAL_ROLES = new Set([
  'SENIOR TALENT ACQUISITION',
  'COMPENSATION & BENEFITS SPECIALIST',
  'HR & TRAINING MANAGER'
]);

const APPRAISAL_CONFIG = {
  MR: { service: appraisalService, sections: APPRAISAL_SECTIONS, finalPrefix: '/appraisal_team', category: 'mr_appraisal' },
  DM: { service: dmAppraisalService, sections: DM_APPRAISAL_SECTIONS, finalPrefix: '/appraisal_team/dm', category: 'dm_appraisal' },
  AM: { service: amAppraisalService, sections: AM_APPRAISAL_SECTIONS, finalPrefix: '/appraisal_team/am', category: 'am_appraisal' }
};

function isHrAppraisalRole(role) {
  return HR_APPRAISAL_ROLES.has(String(role || '').toUpperCase().trim());
}

function isManagerRole(role) {
  return ['DM', 'AM', 'BUM'].includes(String(role || '').toUpperCase().trim()) || isHrAppraisalRole(role);
}

function decorateReports(reports, type, sections, finalUrlPrefix) {
  return (reports || []).map(report => ({
    ...report,
    appraisal_type: type,
    sections,
    final_url: `${finalUrlPrefix}/${report.id}/final`,
    delete_url: `/appraisal_team/${type.toLowerCase()}/${report.id}/delete`
  }));
}

async function getVisibleReports(role, user) {
  if (isHrAppraisalRole(role)) {
    const [mrReports, dmReports, amReports] = await Promise.all([
      appraisalService.listAll(),
      dmAppraisalService.listAll(),
      amAppraisalService.listAll()
    ]);
    return [
      ...decorateReports(mrReports, 'MR', APPRAISAL_SECTIONS, '/appraisal_team'),
      ...decorateReports(dmReports, 'DM', DM_APPRAISAL_SECTIONS, '/appraisal_team/dm'),
      ...decorateReports(amReports, 'AM', AM_APPRAISAL_SECTIONS, '/appraisal_team/am')
    ];
  }
  if (role === 'DM') {
    const mrReports = await appraisalService.listForManager(user.employee_code);
    return decorateReports(mrReports, 'MR', APPRAISAL_SECTIONS, '/appraisal_team');
  }
  if (role === 'AM') {
    const dmReports = await dmAppraisalService.listForManager(user.employee_code);
    return decorateReports(dmReports, 'DM', DM_APPRAISAL_SECTIONS, '/appraisal_team/dm');
  }
  if (role === 'BUM') {
    const amReports = await amAppraisalService.listForManager(user.employee_code);
    return decorateReports(amReports, 'AM', AM_APPRAISAL_SECTIONS, '/appraisal_team/am');
  }
  return [];
}

function canManageReport(role, user, report) {
  if (isHrAppraisalRole(role)) return true;
  return String(report.manager_code || '').trim() === String(user.employee_code || '').trim();
}

async function writeReportsWorkbook(res, reports, filename) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Appraisal Team');
  worksheet.columns = [
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Employee Code', key: 'employee_code', width: 18 },
    { header: 'Employee Name', key: 'employee_name', width: 28 },
    { header: 'Manager', key: 'manager_name', width: 28 },
    { header: 'Section', key: 'section', width: 32 },
    { header: 'Competency', key: 'competency', width: 30 },
    { header: 'Description', key: 'description', width: 80 },
    { header: 'Self Rate', key: 'self_rate', width: 12 },
    { header: 'Final Rate', key: 'final_rate', width: 12 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Submitted At', key: 'submitted_at', width: 22 }
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF860000' } };

  for (const report of reports) {
    for (const section of report.sections) {
      for (const row of section.rows) {
        worksheet.addRow({
          type: report.appraisal_type,
          employee_code: report.employee_code,
          employee_name: report.employee_name,
          manager_name: report.manager_name || report.manager_code || '',
          section: section.title,
          competency: row.competency,
          description: row.points.join(' | '),
          self_rate: report.self_ratings[row.key] || '',
          final_rate: (report.final_ratings || {})[row.key] || '',
          status: report.status,
          submitted_at: report.submitted_at
        });
      }
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

router.get('/appraisal_mr', requireLogin, async (req, res) => {
  const role = getUserRole(req.session.user);
  if (role !== 'MR') return res.redirect('/profile');

  const existing = await appraisalService.getForEmployee(req.session.user.employee_code);
  res.render('appraisal/mr', {
    sections: APPRAISAL_SECTIONS,
    existing: existing || {},
    pageTitle: 'Appraisl MR'
  });
});

router.post('/appraisal_mr', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (role !== 'MR') return res.redirect('/profile');

    const ratings = appraisalService.normalizeRatings(req.body, 'self');
    const saved = await appraisalService.saveSelfAppraisal(req.session.user, ratings);
    const mrName = saved.employee_name || req.session.user.employee_name;
    const mrCode = saved.employee_code || req.session.user.employee_code;

    if (saved.manager_code) {
      await notificationsService.addNotification(
        saved.manager_code,
        null,
        `New MR appraisal submitted by ${mrName} (${mrCode}).`,
        { category: 'mr_appraisal', link_url: '/appraisal_team' }
      );
    }

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `MR appraisal submitted by ${mrName} (${mrCode}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `MR appraisal submitted by ${mrName} (${mrCode}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `MR appraisal submitted by ${mrName} (${mrCode}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Your appraisal has been saved and sent to your direct manager.');
    res.redirect('/appraisal_mr');
  } catch (error) {
    console.error('MR appraisal save error:', error);
    req.flash('danger', 'Failed to save appraisal.');
    res.redirect('/appraisal_mr');
  }
});

router.get('/appraisal_dm', requireLogin, async (req, res) => {
  const role = getUserRole(req.session.user);
  if (role !== 'DM') return res.redirect('/profile');

  const existing = await dmAppraisalService.getForEmployee(req.session.user.employee_code);
  res.render('appraisal/dm', {
    sections: DM_APPRAISAL_SECTIONS,
    existing: existing || {},
    pageTitle: 'Appraisl DM'
  });
});

router.post('/appraisal_dm', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (role !== 'DM') return res.redirect('/profile');

    const ratings = dmAppraisalService.normalizeRatings(req.body, 'self');
    const saved = await dmAppraisalService.saveSelfAppraisal(req.session.user, ratings);
    const dmName = saved.employee_name || req.session.user.employee_name;
    const dmCode = saved.employee_code || req.session.user.employee_code;

    if (saved.manager_code) {
      await notificationsService.addNotification(
        saved.manager_code,
        null,
        `New DM appraisal submitted by ${dmName} (${dmCode}).`,
        { category: 'dm_appraisal', link_url: '/appraisal_team' }
      );
    }

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `DM appraisal submitted by ${dmName} (${dmCode}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `DM appraisal submitted by ${dmName} (${dmCode}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `DM appraisal submitted by ${dmName} (${dmCode}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Your appraisal has been saved and sent to your direct manager.');
    res.redirect('/appraisal_dm');
  } catch (error) {
    console.error('DM appraisal save error:', error);
    req.flash('danger', 'Failed to save appraisal.');
    res.redirect('/appraisal_dm');
  }
});

router.get('/appraisal_am', requireLogin, async (req, res) => {
  const role = getUserRole(req.session.user);
  if (role !== 'AM') return res.redirect('/profile');

  const existing = await amAppraisalService.getForEmployee(req.session.user.employee_code);
  res.render('appraisal/am', {
    sections: AM_APPRAISAL_SECTIONS,
    existing: existing || {},
    pageTitle: 'Appraisl AM'
  });
});

router.post('/appraisal_am', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (role !== 'AM') return res.redirect('/profile');

    const ratings = amAppraisalService.normalizeRatings(req.body, 'self');
    const saved = await amAppraisalService.saveSelfAppraisal(req.session.user, ratings);
    const amName = saved.employee_name || req.session.user.employee_name;
    const amCode = saved.employee_code || req.session.user.employee_code;

    if (saved.manager_code) {
      await notificationsService.addNotification(
        saved.manager_code,
        null,
        `New AM appraisal submitted by ${amName} (${amCode}).`,
        { category: 'am_appraisal', link_url: '/appraisal_team' }
      );
    }

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `AM appraisal submitted by ${amName} (${amCode}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `AM appraisal submitted by ${amName} (${amCode}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `AM appraisal submitted by ${amName} (${amCode}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Your appraisal has been saved and sent to your direct manager.');
    res.redirect('/appraisal_am');
  } catch (error) {
    console.error('AM appraisal save error:', error);
    req.flash('danger', 'Failed to save appraisal.');
    res.redirect('/appraisal_am');
  }
});

async function exportOwnAppraisal(req, res, type) {
  const role = getUserRole(req.session.user);
  if (role !== type) return res.redirect('/profile');
  const config = APPRAISAL_CONFIG[type];
  const report = await config.service.getForEmployee(req.session.user.employee_code);
  if (!report) {
    req.flash('warning', 'No appraisal found to export.');
    return res.redirect(`/appraisal_${type.toLowerCase()}`);
  }
  const [decorated] = decorateReports([report], type, config.sections, config.finalPrefix);
  await writeReportsWorkbook(res, [decorated], `Appraisl_${type}_${report.employee_code}.xlsx`);
}

async function deleteOwnAppraisal(req, res, type) {
  const role = getUserRole(req.session.user);
  if (role !== type) return res.redirect('/profile');
  const config = APPRAISAL_CONFIG[type];
  const report = await config.service.getForEmployee(req.session.user.employee_code);
  if (!report) {
    req.flash('warning', 'No appraisal found to delete.');
    return res.redirect(`/appraisal_${type.toLowerCase()}`);
  }
  await config.service.deleteById(report.id);
  req.flash('success', 'Your appraisal has been deleted.');
  return res.redirect(`/appraisal_${type.toLowerCase()}`);
}

router.get('/appraisal_mr/export', requireLogin, (req, res) => exportOwnAppraisal(req, res, 'MR'));
router.post('/appraisal_mr/delete', requireLogin, (req, res) => deleteOwnAppraisal(req, res, 'MR'));
router.get('/appraisal_dm/export', requireLogin, (req, res) => exportOwnAppraisal(req, res, 'DM'));
router.post('/appraisal_dm/delete', requireLogin, (req, res) => deleteOwnAppraisal(req, res, 'DM'));
router.get('/appraisal_am/export', requireLogin, (req, res) => exportOwnAppraisal(req, res, 'AM'));
router.post('/appraisal_am/delete', requireLogin, (req, res) => deleteOwnAppraisal(req, res, 'AM'));

router.get('/appraisal_team', requireLogin, async (req, res) => {
  const role = getUserRole(req.session.user);
  if (!isManagerRole(role)) return res.redirect('/profile');

  const reports = await getVisibleReports(role, req.session.user);

  res.render('appraisal/team', {
    reports,
    role,
    pageTitle: 'Appraisl Team'
  });
});

router.get('/appraisal_team/export', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (!isManagerRole(role)) return res.redirect('/profile');
    const reports = await getVisibleReports(role, req.session.user);
    const date = new Date().toISOString().slice(0, 10);
    await writeReportsWorkbook(res, reports, `Appraisl_Team_${date}.xlsx`);
  } catch (error) {
    console.error('Appraisal export error:', error);
    req.flash('danger', 'Failed to export appraisal report.');
    res.redirect('/appraisal_team');
  }
});

router.post('/appraisal_team/:id/final', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (!isManagerRole(role)) return res.redirect('/profile');

    const report = await appraisalService.getById(req.params.id);
    if (!report) {
      req.flash('danger', 'Appraisal not found.');
      return res.redirect('/appraisal_team');
    }

    const isOwnerManager = String(report.manager_code || '').trim() === String(req.session.user.employee_code || '').trim();
    if (!isOwnerManager && !isHrAppraisalRole(role)) {
      req.flash('danger', 'You are not allowed to update this appraisal.');
      return res.redirect('/appraisal_team');
    }

    const ratings = appraisalService.normalizeRatings(req.body, 'final');
    const saved = await appraisalService.saveFinalRatings(req.params.id, ratings);

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `Final rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `Final rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `Final rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'mr_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Final rate saved successfully.');
    res.redirect(`/appraisal_team#appraisal-${saved.id}`);
  } catch (error) {
    console.error('Final appraisal save error:', error);
    req.flash('danger', 'Failed to save final rate.');
    res.redirect('/appraisal_team');
  }
});

router.post('/appraisal_team/dm/:id/final', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (!isManagerRole(role)) return res.redirect('/profile');

    const report = await dmAppraisalService.getById(req.params.id);
    if (!report) {
      req.flash('danger', 'Appraisal not found.');
      return res.redirect('/appraisal_team');
    }

    const isOwnerManager = String(report.manager_code || '').trim() === String(req.session.user.employee_code || '').trim();
    if (!isOwnerManager && !isHrAppraisalRole(role)) {
      req.flash('danger', 'You are not allowed to update this appraisal.');
      return res.redirect('/appraisal_team');
    }

    const ratings = dmAppraisalService.normalizeRatings(req.body, 'final');
    const saved = await dmAppraisalService.saveFinalRatings(req.params.id, ratings);

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `Final DM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `Final DM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `Final DM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'dm_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Final rate saved successfully.');
    res.redirect(`/appraisal_team#appraisal-dm-${saved.id}`);
  } catch (error) {
    console.error('Final DM appraisal save error:', error);
    req.flash('danger', 'Failed to save final rate.');
    res.redirect('/appraisal_team');
  }
});

router.post('/appraisal_team/am/:id/final', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (!isManagerRole(role)) return res.redirect('/profile');

    const report = await amAppraisalService.getById(req.params.id);
    if (!report) {
      req.flash('danger', 'Appraisal not found.');
      return res.redirect('/appraisal_team');
    }

    if (!canManageReport(role, req.session.user, report)) {
      req.flash('danger', 'You are not allowed to update this appraisal.');
      return res.redirect('/appraisal_team');
    }

    const ratings = amAppraisalService.normalizeRatings(req.body, 'final');
    const saved = await amAppraisalService.saveFinalRatings(req.params.id, ratings);

    await notificationsService.addNotification(
      null,
      'SENIOR TALENT ACQUISITION',
      `Final AM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'COMPENSATION & BENEFITS SPECIALIST',
      `Final AM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );
    await notificationsService.addNotification(
      null,
      'HR & TRAINING MANAGER',
      `Final AM rate added for ${saved.employee_name} (${saved.employee_code}).`,
      { category: 'am_appraisal', link_url: '/appraisal_team' }
    );

    req.flash('success', 'Final rate saved successfully.');
    res.redirect(`/appraisal_team#appraisal-am-${saved.id}`);
  } catch (error) {
    console.error('Final AM appraisal save error:', error);
    req.flash('danger', 'Failed to save final rate.');
    res.redirect('/appraisal_team');
  }
});

router.post('/appraisal_team/:type/:id/delete', requireLogin, async (req, res) => {
  try {
    const role = getUserRole(req.session.user);
    if (!isManagerRole(role)) return res.redirect('/profile');

    const type = String(req.params.type || '').toUpperCase();
    const config = APPRAISAL_CONFIG[type];
    if (!config) {
      req.flash('danger', 'Invalid appraisal type.');
      return res.redirect('/appraisal_team');
    }

    const report = await config.service.getById(req.params.id);
    if (!report) {
      req.flash('danger', 'Appraisal not found.');
      return res.redirect('/appraisal_team');
    }

    if (!canManageReport(role, req.session.user, report)) {
      req.flash('danger', 'You are not allowed to delete this appraisal.');
      return res.redirect('/appraisal_team');
    }

    await config.service.deleteById(req.params.id);
    req.flash('success', `${type} appraisal deleted successfully.`);
    res.redirect('/appraisal_team');
  } catch (error) {
    console.error('Appraisal delete error:', error);
    req.flash('danger', 'Failed to delete appraisal.');
    res.redirect('/appraisal_team');
  }
});

module.exports = router;
