/**
 * File: src/routes/notificationsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requireLogin, getUserRole } = require('../core/authUtils');
const notificationsService = require('../core/notificationsService');

router.get('/notifications', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = getUserRole(user);
  const rows = await notificationsService.listNotifications(user.employee_code, role);
  
  // Calculate unread count
  const unreadCount = await notificationsService.unreadCount(user.employee_code, role);
  
  res.render('notifications/list', { 
    rows: rows, 
    user: user,
    unreadCount: unreadCount
  });
});

router.get('/notifications/api/summary', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    const role = getUserRole(user);
    const unreadCount = await notificationsService.unreadCount(user.employee_code, role);
    const recent = await notificationsService.listRecentNotifications(user.employee_code, role, 8);
    res.json({
      unreadCount,
      recent: (recent || []).map((r) => ({
        id: r.id,
        message: r.message,
        is_read: !!r.is_read,
        created_at: r.created_at,
        link_url: r.link_url || null,
        category: r.category || null
      }))
    });
  } catch (e) {
    res.status(500).json({ unreadCount: 0, recent: [] });
  }
});

router.get('/notifications/open/:id', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = getUserRole(user);
  const row = await notificationsService.getById(req.params.id);
  if (!row) return res.redirect('/notifications');

  const userCode = String(user.employee_code || '').trim();
  const userTitle = String(role || '').trim();
  const allowed =
    (row.recipient_code && String(row.recipient_code).trim() === userCode) ||
    (row.recipient_title && String(row.recipient_title).trim() === userTitle);

  if (!allowed) {
    req.flash('danger', 'Not authorized to open this notification.');
    return res.redirect('/notifications');
  }

  await notificationsService.markReadById(row.id, user.employee_code, role);
  return res.redirect(row.link_url || '/notifications');
});

router.get('/notifications/mark_all', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = getUserRole(user);
  await notificationsService.markAllRead(user.employee_code, role);
  res.redirect('/notifications');
});

router.delete('/notifications/:id', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = getUserRole(user);
  const success = await notificationsService.deleteById(req.params.id, user.employee_code, role);
  res.json({ success });
});

router.post('/notifications/:id/save', requireLogin, async (req, res) => {
  const user = req.session.user;
  const role = getUserRole(user);
  const success = await notificationsService.toggleSavedForLater(req.params.id, user.employee_code, role);
  res.json({ success });
});

router.post('/notifications/batch-delete', requireLogin, async (req, res) => {
  let ids = req.body && req.body.ids;
  if (typeof ids === 'string') {
    ids = ids.split(',').map(item => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No notification IDs provided.' });
  }

  const success = await notificationsService.deleteBatch(ids);
  res.json({ success });
});

module.exports = router;
