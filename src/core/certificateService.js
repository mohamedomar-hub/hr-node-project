/**
 * File: src/core/certificateService.js
 */
const path = require('path');
const fs = require('fs');
const { query } = require('./db');
const multer = require('multer');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CERT_DIR = path.join(__dirname, '..', '..', 'static', 'certificates');
const LEGACY_CERT_DIR = path.join(PROJECT_ROOT, '..', 'hr_system_flask', 'static', 'certificates');
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

// Configure Multer for storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, CERT_DIR);
  },
  filename: function (req, file, cb) {
    // Use original name but secure it (basic implementation)
    // In production, consider renaming to UUID to avoid collisions
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

function resolveCertificatePath(filePath) {
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
  candidates.push(path.join(CERT_DIR, baseName));
  candidates.push(path.join(LEGACY_CERT_DIR, baseName));

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_code VARCHAR(50) NOT NULL,
      employee_name VARCHAR(100) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      path VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, [], 'commit');
}

async function saveCertificate(file, employeeCode, employeeName) {
  await ensureTable();
  if (!file) return false;

  const fname = file.filename;
  const filePath = toPublicPath(file.path);

  await query(
    `INSERT INTO certificates (employee_code, employee_name, filename, path) VALUES (?,?,?,?)`,
    [employeeCode, employeeName, fname, filePath],
    'commit'
  );
  
  return true;
}

async function listCertificates(employeeCode = null) {
  await ensureTable();
  let baseSql = "SELECT * FROM certificates";
  let args = [];

  if (employeeCode) {
    baseSql += " WHERE employee_code=?";
    args.push(employeeCode);
  }
  
  baseSql += " ORDER BY created_at DESC";
  
  const rows = await query(baseSql, args, 'fetchall') || [];
  return rows.map((row) => ({
    ...row,
    path: toPublicPath(row.path)
  }));
}

async function getCertificate(id) {
  await ensureTable();
  return await query(
    "SELECT * FROM certificates WHERE id=?",
    [id],
    'fetchone'
  );
}

async function getResolvedCertificatePath(id) {
  const cert = await getCertificate(id);
  if (!cert || !cert.path) return null;
  return resolveCertificatePath(cert.path);
}

async function deleteCertificate(id) {
  await ensureTable();
  const cert = await getCertificate(id);
  if (!cert) return false;

  const filePath = resolveCertificatePath(cert.path);

  await query(
    "DELETE FROM certificates WHERE id=?",
    [id],
    'commit'
  );

  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Could not delete certificate file:', err.message);
    }
  }

  return true;
}

module.exports = {
  upload, // Middleware to use in routes: upload.single('fileField')
  saveCertificate,
  listCertificates,
  getCertificate,
  getResolvedCertificatePath,
  deleteCertificate
};
