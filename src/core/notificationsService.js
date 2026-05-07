/**
 * File: src/core/notificationsService.js
 */
const { query } = require('./db');

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_code VARCHAR(50) NULL,
      recipient_title VARCHAR(150) NULL,
      message VARCHAR(600) NOT NULL,
      link_url VARCHAR(400) NULL,
      category VARCHAR(50) NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME NULL,
      INDEX idx_notifications_recipient_code (recipient_code),
      INDEX idx_notifications_recipient_title (recipient_title),
      INDEX idx_notifications_recipient_read_created (recipient_code, is_read, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
    'commit'
  );

  const columnUpgrades = [
    ['link_url', "ALTER TABLE notifications ADD COLUMN link_url VARCHAR(400) NULL"],
    ['category', "ALTER TABLE notifications ADD COLUMN category VARCHAR(50) NULL"],
    ['read_at', "ALTER TABLE notifications ADD COLUMN read_at DATETIME NULL"],
    ['saved_for_later', "ALTER TABLE notifications ADD COLUMN saved_for_later TINYINT(1) DEFAULT 0"]
  ];
  for (const [columnName, stmt] of columnUpgrades) {
    const existing = await query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'notifications'
         AND COLUMN_NAME = ?`,
      [columnName],
      'fetchone'
    );
    if (!existing) await query(stmt, [], 'commit');
  }
}

async function addNotification(recipientCode, recipientTitle, message, options = {}) {
  await ensureTables();
  const linkUrl = options && options.link_url ? String(options.link_url) : null;
  const category = options && options.category ? String(options.category) : null;
  await query(
    `INSERT INTO notifications (recipient_code, recipient_title, message, link_url, category, is_read)
    VALUES (?,?,?,?,?,FALSE)`,
    [recipientCode || null, recipientTitle || null, message, linkUrl, category],
    'commit'
  );
  return true;
}

function whereClause(recipientCode, recipientTitle) {
  let clause = "";
  let args = [];
  if (recipientCode && recipientTitle) {
    clause = " AND (recipient_code=? OR recipient_title=?)";
    args.push(recipientCode, recipientTitle);
  } else if (recipientCode) {
    clause = " AND recipient_code=?";
    args.push(recipientCode);
  } else if (recipientTitle) {
    clause = " AND recipient_title=?";
    args.push(recipientTitle);
  }
  return { clause, args };
}

async function listNotifications(recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const { clause, args } = whereClause(recipientCode, recipientTitle);
  return await query(
    `SELECT * FROM notifications WHERE 1=1 ${clause} ORDER BY created_at DESC`,
    args,
    'fetchall'
  );
}

async function listRecentNotifications(recipientCode = null, recipientTitle = null, limit = 8) {
  await ensureTables();
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 8));
  const { clause, args } = whereClause(recipientCode, recipientTitle);
  return await query(
    `SELECT * FROM notifications WHERE 1=1 ${clause} ORDER BY created_at DESC LIMIT ${safeLimit}`,
    args,
    'fetchall'
  );
}

async function markAllRead(recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const { clause, args } = whereClause(recipientCode, recipientTitle);
  await query(
    `UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE 1=1 ${clause}`,
    args,
    'commit'
  );
  return true;
}

async function markReadById(notificationId, recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const id = parseInt(notificationId, 10);
  if (!id) return false;

  const { clause, args } = whereClause(recipientCode, recipientTitle);
  const result = await query(
    `UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE id=? ${clause}`,
    [id, ...args],
    'commit'
  );
  return (result && result.affectedRows > 0) || false;
}

async function getById(notificationId) {
  await ensureTables();
  const id = parseInt(notificationId, 10);
  if (!id) return null;
  return await query(
    `SELECT * FROM notifications WHERE id=? LIMIT 1`,
    [id],
    'fetchone'
  );
}

async function unreadCount(recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const { clause, args } = whereClause(recipientCode, recipientTitle);
  const row = await query(
    `SELECT COUNT(*) as cnt FROM notifications WHERE is_read=FALSE ${clause}`,
    args,
    'fetchone'
  );
  return parseInt(row?.cnt || 0);
}

async function deleteById(notificationId, recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const id = parseInt(notificationId, 10);
  if (!id) return false;

  // Verify ownership: notification must exist and belong to the requesting user
  const notification = await query(
    `SELECT * FROM notifications WHERE id=? LIMIT 1`,
    [id],
    'fetchone'
  );
  
  if (!notification) return false;

  // Check if user is authorized to delete this notification
  const userCode = String(recipientCode || '').trim();
  const userTitle = String(recipientTitle || '').trim();
  const allowed =
    (!notification.recipient_code && !notification.recipient_title) || // Allow if notification is for everyone
    (notification.recipient_code && notification.recipient_code === userCode) ||
    (notification.recipient_title && notification.recipient_title === userTitle);

  if (!allowed) return false;

  const result = await query(
    `DELETE FROM notifications WHERE id=?`,
    [id],
    'commit'
  );
  return (result && result.affectedRows > 0) || false;
}

async function toggleSavedForLater(notificationId, recipientCode = null, recipientTitle = null) {
  await ensureTables();
  const id = parseInt(notificationId, 10);
  if (!id) return false;

  // Verify ownership: notification must exist and belong to the requesting user
  const notification = await query(
    `SELECT * FROM notifications WHERE id=? LIMIT 1`,
    [id],
    'fetchone'
  );
  
  if (!notification) return false;

  // Check if user is authorized to modify this notification
  const userCode = String(recipientCode || '').trim();
  const userTitle = String(recipientTitle || '').trim();
  const allowed =
    (!notification.recipient_code && !notification.recipient_title) || // Allow if notification is for everyone
    (notification.recipient_code && notification.recipient_code === userCode) ||
    (notification.recipient_title && notification.recipient_title === userTitle);

  if (!allowed) return false;

  const result = await query(
    `UPDATE notifications SET saved_for_later = NOT saved_for_later WHERE id=?`,
    [id],
    'commit'
  );
  return (result && result.affectedRows > 0) || false;
}

async function deleteBatch(notificationIds = []) {
  await ensureTables();
  if (!Array.isArray(notificationIds)) {
    if (typeof notificationIds === 'string') {
      notificationIds = notificationIds.split(',').map(item => item.trim()).filter(Boolean);
    } else {
      return false;
    }
  }

  if (notificationIds.length === 0) return false;

  const normalizedIds = notificationIds.map(item => {
    if (item && typeof item === 'object') {
      return item.id || item.value || item.notificationId || '';
    }
    return item;
  });

  const ids = normalizedIds.map(id => parseInt(id, 10)).filter(id => id > 0);
  if (ids.length === 0) return false;
  
  const placeholders = ids.map(() => '?').join(',');
  const result = await query(
    `DELETE FROM notifications WHERE id IN (${placeholders})`,
    ids,
    'commit'
  );
  return (result && result.affectedRows > 0) || false;
}

module.exports = {
  addNotification,
  listNotifications,
  listRecentNotifications,
  markAllRead,
  markReadById,
  getById,
  unreadCount,
  deleteById,
  toggleSavedForLater,
  deleteBatch
};
