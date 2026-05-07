/**
 * File: src/core/personalEmailService.js
 */
const { query } = require('./db');
const { cleanCode } = require('./utils');

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS personal_emails (
    employee_code VARCHAR(50) PRIMARY KEY,
    employee_name VARCHAR(255),
    title VARCHAR(50),
    department VARCHAR(100),
    email VARCHAR(255),
    facebook_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, [], 'commit');
}

async function savePersonalEmail(code, name, title, department, email, facebookEmail = "") {
  await ensureTable();
  await query(
    `INSERT INTO personal_emails (employee_code, employee_name, title, department, email, facebook_email)
    VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
    employee_name=VALUES(employee_name),
    title=VALUES(title),
    department=VALUES(department),
    email=VALUES(email),
    facebook_email=VALUES(facebook_email)`,
    [cleanCode(code), name, title, department, email, facebookEmail],
    'commit'
  );
  return true;
}

async function listPersonalEmails() {
  await ensureTable();
  return await query(
    `SELECT pe.employee_code, pe.employee_name,
     COALESCE(pe.title, e.title) AS title,
     COALESCE(pe.department, e.department) AS department,
     pe.email, pe.facebook_email, pe.updated_at
     FROM personal_emails pe
     LEFT JOIN employees e ON e.employee_code = pe.employee_code
     ORDER BY pe.employee_name`,
    [],
    'fetchall'
  ) || [];
}

module.exports = {
  savePersonalEmail,
  listPersonalEmails
};