const { query } = require('./db');
const { getAllItemKeys } = require('./appraisalTemplate');

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS mr_appraisals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_code VARCHAR(32) NOT NULL,
      employee_name VARCHAR(255) NOT NULL,
      manager_code VARCHAR(32) NULL,
      manager_name VARCHAR(255) NULL,
      self_ratings JSON NOT NULL,
      final_ratings JSON NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Submitted',
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      final_submitted_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_mr_appraisal_employee (employee_code),
      INDEX idx_mr_appraisals_manager (manager_code),
      INDEX idx_mr_appraisals_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
    'commit'
  );
}

function normalizeRatings(body, prefix) {
  const ratings = {};
  for (const key of getAllItemKeys()) {
    const raw = body[`${prefix}_${key}`];
    const value = raw === undefined || raw === null ? '' : String(raw).trim();
    ratings[key] = value;
  }
  return ratings;
}

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    self_ratings: parseJsonField(row.self_ratings),
    final_ratings: parseJsonField(row.final_ratings)
  };
}

async function getForEmployee(employeeCode) {
  await ensureTables();
  const row = await query(
    `SELECT a.*, e.title, e.department
     FROM mr_appraisals a
     LEFT JOIN employees e ON TRIM(e.employee_code)=TRIM(a.employee_code)
     WHERE TRIM(a.employee_code)=?
     LIMIT 1`,
    [String(employeeCode || '').trim()],
    'fetchone'
  );
  return hydrate(row);
}

async function saveSelfAppraisal(user, ratings) {
  await ensureTables();
  const employeeCode = String(user.employee_code || '').trim();
  const employeeName = user.employee_name || employeeCode;
  const managerCode = user.manager_code ? String(user.manager_code).trim() : null;
  const managerName = user.manager_name || null;

  await query(
    `INSERT INTO mr_appraisals
      (employee_code, employee_name, manager_code, manager_name, self_ratings, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, 'Submitted', NOW())
     ON DUPLICATE KEY UPDATE
      employee_name=VALUES(employee_name),
      manager_code=VALUES(manager_code),
      manager_name=VALUES(manager_name),
      self_ratings=VALUES(self_ratings),
      status=IF(final_ratings IS NULL, 'Submitted', 'Final Rated'),
      submitted_at=NOW()`,
    [employeeCode, employeeName, managerCode, managerName, JSON.stringify(ratings)],
    'commit'
  );

  return getForEmployee(employeeCode);
}

async function listForManager(managerCode) {
  await ensureTables();
  const rows = await query(
    `SELECT a.*, e.title, e.department
     FROM mr_appraisals a
     LEFT JOIN employees e ON TRIM(e.employee_code)=TRIM(a.employee_code)
     WHERE TRIM(a.manager_code)=?
     ORDER BY a.submitted_at DESC`,
    [String(managerCode || '').trim()],
    'fetchall'
  );
  return (rows || []).map(hydrate);
}

async function listAll() {
  await ensureTables();
  const rows = await query(
    `SELECT a.*, e.title, e.department
     FROM mr_appraisals a
     LEFT JOIN employees e ON TRIM(e.employee_code)=TRIM(a.employee_code)
     ORDER BY a.submitted_at DESC`,
    [],
    'fetchall'
  );
  return (rows || []).map(hydrate);
}

async function getById(id) {
  await ensureTables();
  const row = await query(
    `SELECT a.*, e.title, e.department
     FROM mr_appraisals a
     LEFT JOIN employees e ON TRIM(e.employee_code)=TRIM(a.employee_code)
     WHERE a.id=?
     LIMIT 1`,
    [parseInt(id, 10) || 0],
    'fetchone'
  );
  return hydrate(row);
}

async function saveFinalRatings(id, ratings) {
  await ensureTables();
  await query(
    `UPDATE mr_appraisals
     SET final_ratings=?,
         status='Final Rated',
         final_submitted_at=NOW()
     WHERE id=?`,
    [JSON.stringify(ratings), parseInt(id, 10) || 0],
    'commit'
  );
  return getById(id);
}

async function deleteById(id) {
  await ensureTables();
  const report = await getById(id);
  if (!report) return null;
  await query(`DELETE FROM mr_appraisals WHERE id=?`, [parseInt(id, 10) || 0], 'commit');
  return report;
}

module.exports = {
  ensureTables,
  normalizeRatings,
  getForEmployee,
  saveSelfAppraisal,
  listForManager,
  listAll,
  getById,
  saveFinalRatings,
  deleteById
};
