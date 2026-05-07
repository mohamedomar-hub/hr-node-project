/**
 * File: src/core/idpService.js
 */
const { query } = require('./db');
const { cleanCode } = require('./utils');

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS idb_reports (
      employee_code VARCHAR(50) PRIMARY KEY,
      employee_name VARCHAR(100) NOT NULL,
      selected_departments JSON NULL,
      strengths JSON NULL,
      development_areas JSON NULL,
      action_plan TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    [],
    'commit'
  );
}

async function getReport(employeeCode) {
  await ensureTable();
  const code = cleanCode(employeeCode);
  const row = await query(
    `SELECT employee_code, employee_name, selected_departments,
     strengths, development_areas, action_plan, updated_at
     FROM idb_reports
     WHERE employee_code=?`,
    [code],
    'fetchone'
  );
  if (!row) return null;

  // Parse JSON fields
  ['selected_departments', 'strengths', 'development_areas'].forEach(key => {
    if (row[key]) {
      try {
        row[key] = JSON.parse(row[key]);
      } catch (e) {
        row[key] = [];
      }
    } else {
      row[key] = [];
    }
  });
  return row;
}

async function saveReport(employeeCode, employeeName, departments, strengths, development, actionPlan) {
  await ensureTable();
  const code = cleanCode(employeeCode);
  await query(
    `INSERT INTO idb_reports (
      employee_code, employee_name, selected_departments,
      strengths, development_areas, action_plan
    ) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
    employee_name=VALUES(employee_name),
    selected_departments=VALUES(selected_departments),
    strengths=VALUES(strengths),
    development_areas=VALUES(development_areas),
    action_plan=VALUES(action_plan)`,
    [
      code,
      employeeName,
      JSON.stringify(departments),
      JSON.stringify(strengths),
      JSON.stringify(development),
      actionPlan
    ],
    'commit'
  );
  return true;
}

async function listAllReports() {
  await ensureTable();
  const rows = await query(
    `SELECT employee_code, employee_name, selected_departments,
     strengths, development_areas, action_plan, updated_at
     FROM idb_reports
     ORDER BY updated_at DESC`,
    [],
    'fetchall'
  ) || [];

  return rows.map(r => {
    ['selected_departments', 'strengths', 'development_areas'].forEach(key => {
      if (r[key]) {
        try {
          r[key] = JSON.parse(r[key]);
        } catch (e) {
          r[key] = [];
        }
      } else {
        r[key] = [];
      }
    });
    return r;
  });
}

async function deleteReport(employeeCode) {
  await ensureTable();
  const code = cleanCode(employeeCode);
  await query(
    "DELETE FROM idb_reports WHERE employee_code=?",
    [code],
    'commit'
  );
  return true;
}

module.exports = {
  getReport,
  saveReport,
  listAllReports,
  deleteReport
};
