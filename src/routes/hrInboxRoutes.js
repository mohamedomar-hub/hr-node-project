/**
 * File: src/routes/hrInboxRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin, getUserRole } = require('../core/authUtils');
const { query } = require('../core/db');
const notificationsService = require('../core/notificationsService');
const ExcelJS = require('exceljs');

// ✅ الـ roles اللي مسموحلها تدخل HR Inbox
const HR_INBOX_ALLOWED_ROLES = [
  'HR',
  'HR MANAGER',
  'HR & TRAINING MANAGER',
  'HR SPECIALIST',
  'PAYROLL & PERSONAL SPECIALIST',
  'SENIOR TALENT ACQUISITION',
  'COMPENSATION & BENEFITS SPECIALIST'
];

// ✅ Middleware للتحقق من الصلاحية
function hrInboxAccess(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  const role = (getUserRole(req.session.user) || '').toUpperCase().trim();
  if (HR_INBOX_ALLOWED_ROLES.includes(role) || role.includes('HR')) {
    return next();
  }
  return res.redirect('/my-profile');
}

// ✅ HR Inbox Page
router.get('/hr_inbox', requireLogin, hrInboxAccess, async (req, res) => {
  try {
    const hrCode = String(req.session.user.employee_code).trim();

    const messages_list = await query(
      `SELECT * FROM hr_messages 
       WHERE recipient_code = ? 
       ORDER BY created_at DESC`,
      [hrCode],
      'fetchall'
    ) || [];

    res.render('hr/hr_inbox', {
      user: req.session.user,
      pageTitle: 'HR Inbox',
      messages_list: messages_list
    });
  } catch (error) {
    console.error("HR Inbox Error:", error);
    res.status(500).send('Error loading inbox.');
  }
});

// ✅ Export HR Inbox to Excel
router.get('/hr_inbox/export', requireLogin, hrInboxAccess, async (req, res) => {
  try {
    const hrCode = String(req.session.user.employee_code).trim();

    const messages_list = await query(
      `SELECT * FROM hr_messages 
       WHERE recipient_code = ? 
       ORDER BY created_at DESC`,
      [hrCode],
      'fetchall'
    ) || [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('HR Inbox');

    // Header row
    worksheet.columns = [
      { header: 'Date',          key: 'created_at',    width: 22 },
      { header: 'From (Name)',   key: 'sender_name',   width: 28 },
      { header: 'From (Code)',   key: 'sender_code',   width: 14 },
      { header: 'Message',       key: 'message',       width: 50 },
      { header: 'Status',        key: 'status',        width: 12 },
      { header: 'HR Reply',      key: 'reply',         width: 50 },
      { header: 'Reply Date',    key: 'updated_at',    width: 22 },
    ];

    // Style header
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3352' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    worksheet.getRow(1).height = 28;

    // Data rows
    messages_list.forEach(m => {
      const row = worksheet.addRow({
        created_at:  m.created_at ? new Date(m.created_at).toLocaleString('en-US') : '',
        sender_name: m.sender_name || '',
        sender_code: m.sender_code || '',
        message:     m.message    || '',
        status:      m.status     || '',
        reply:       m.reply      || '',
        updated_at:  m.updated_at ? new Date(m.updated_at).toLocaleString('en-US') : '',
      });

      // Color status cell
      const statusCell = row.getCell('status');
      if (m.status === 'New')     { statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } }; }
      if (m.status === 'Replied') { statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6EE7B7' } }; }
      if (m.status === 'Read')    { statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; }

      // Wrap text for long fields
      row.getCell('message').alignment = { wrapText: true };
      row.getCell('reply').alignment   = { wrapText: true };
    });

    const hrName = (req.session.user.employee_name || 'HR').replace(/\s+/g, '_');
    const date   = new Date().toISOString().slice(0, 10);
    const filename = `HR_Inbox_${hrName}_${date}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error("Export Error:", error);
    req.flash('danger', 'Failed to export inbox.');
    res.redirect('/hr_inbox');
  }
});

// ✅ Handle Reply to Message
router.post('/hr_inbox/reply/:id', requireLogin, hrInboxAccess, async (req, res) => {
  try {
    const messageId = req.params.id;
    const replyText = req.body.reply_text;
    const hrCode    = String(req.session.user.employee_code).trim();

    if (!replyText || replyText.trim() === '') {
      req.flash('danger', 'Reply cannot be empty.');
      return res.redirect('/hr_inbox');
    }

    const msgRow = await query(
      "SELECT sender_code, sender_name FROM hr_messages WHERE id = ? AND recipient_code = ? LIMIT 1",
      [messageId, hrCode],
      'fetchone'
    );

    const result = await query(
      `UPDATE hr_messages 
       SET reply = ?, status = 'Replied', updated_at = NOW() 
       WHERE id = ? AND recipient_code = ?`,
      [replyText, messageId, hrCode],
      'commit'
    );

    if (result.affectedRows > 0) {
      if (msgRow && msgRow.sender_code) {
        await notificationsService.addNotification(msgRow.sender_code, null, 'HR replied to your message.', {
          category: 'message_out',
          link_url: '/request_hr'
        });
      }
      req.flash('success', 'Reply sent successfully.');
    } else {
      req.flash('warning', 'Message not found or you are not authorized to reply to it.');
    }

    res.redirect('/hr_inbox');
  } catch (error) {
    console.error("Reply Error:", error);
    req.flash('danger', 'Failed to send reply: ' + error.message);
    res.redirect('/hr_inbox');
  }
});

module.exports = router;
