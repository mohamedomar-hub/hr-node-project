/**
 * File: src/core/selfDevService.js
 */
const path = require('path');
const fs = require('fs');
const { query } = require('./db');
const multer = require('multer');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const ATTACH_DIR = path.join(__dirname, '..', '..', 'static', 'self_dev');
const LEGACY_ATTACH_DIR = path.join(PROJECT_ROOT, '..', 'hr_system_flask', 'static', 'self_dev');
if (!fs.existsSync(ATTACH_DIR)) {
  fs.mkdirSync(ATTACH_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ATTACH_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

function toPublicPath(filePath) {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return normalized;
  }
  const staticIndex = normalized.toLowerCase().lastIndexOf('/static/');
  if (staticIndex >= 0) {
    return normalized.slice(staticIndex + 1);
  }
  return normalized;
}

function resolveAttachmentPath(filePath) {
  if (!filePath) return null;

  const normalized = String(filePath).replace(/\\/g, '/');
  const candidates = [];

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  } else {
    candidates.push(path.join(PROJECT_ROOT, normalized));

    if (normalized.startsWith('static/')) {
      candidates.push(path.join(PROJECT_ROOT, normalized.replace(/^static\//, '')));
    }
  }

  const baseName = path.basename(normalized);
  candidates.push(path.join(ATTACH_DIR, baseName));
  candidates.push(path.join(LEGACY_ATTACH_DIR, baseName));

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS self_development (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    goal TEXT,
    skills TEXT,
    plan TEXT,
    attachment VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, [], 'commit');
}

async function saveEntry(employeeCode, employeeName, goal, skills, plan, filePath = null) {
  await ensureTable();
  await query(
    `INSERT INTO self_development (employee_code, employee_name, goal, skills, plan, attachment)
    VALUES (?,?,?,?,?,?)`,
    [employeeCode, employeeName, goal, skills, plan, toPublicPath(filePath)],
    'commit'
  );
  return true;
}

async function listEntries(employeeCode) {
  await ensureTable();
  const rows = await query(
    "SELECT * FROM self_development WHERE employee_code=? ORDER BY created_at DESC",
    [employeeCode],
    'fetchall'
  ) || [];

  return rows.map((row) => ({
    ...row,
    attachment: toPublicPath(row.attachment)
  }));
}

async function listAllEntries() {
  await ensureTable();
  const rows = await query(
    "SELECT * FROM self_development ORDER BY created_at DESC",
    [],
    'fetchall'
  ) || [];

  return rows.map((row) => ({
    ...row,
    attachment: toPublicPath(row.attachment)
  }));
}

async function getEntry(id, employeeCode) {
  await ensureTable();
  return await query(
    "SELECT * FROM self_development WHERE id=? AND employee_code=?",
    [id, employeeCode],
    'fetchone'
  );
}

async function getResolvedAttachmentPath(id, employeeCode) {
  const entry = await getEntry(id, employeeCode);
  if (!entry || !entry.attachment) return null;
  return resolveAttachmentPath(entry.attachment);
}

async function getEntryById(id) {
  await ensureTable();
  return await query(
    "SELECT * FROM self_development WHERE id=?",
    [id],
    'fetchone'
  );
}

async function getResolvedAttachmentPathById(id) {
  const entry = await getEntryById(id);
  if (!entry || !entry.attachment) return null;
  return resolveAttachmentPath(entry.attachment);
}

async function deleteEntry(id, employeeCode) {
  await ensureTable();
  const entry = await getEntry(id, employeeCode);
  if (!entry) return false;

  const filePath = resolveAttachmentPath(entry.attachment);

  await query(
    "DELETE FROM self_development WHERE id=? AND employee_code=?",
    [id, employeeCode],
    'commit'
  );

  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Could not delete self development attachment:', err.message);
    }
  }

  return true;
}

async function deleteEntryById(id) {
  await ensureTable();
  const entry = await getEntryById(id);
  if (!entry) return false;

  const filePath = resolveAttachmentPath(entry.attachment);

  await query(
    "DELETE FROM self_development WHERE id=?",
    [id],
    'commit'
  );

  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Could not delete self development attachment:', err.message);
    }
  }

  return true;
}

module.exports = {
  upload,
  saveEntry,
  listEntries,
  listAllEntries,
  getEntry,
  getResolvedAttachmentPath,
  getEntryById,
  getResolvedAttachmentPathById,
  deleteEntry,
  deleteEntryById
};
