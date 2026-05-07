/**
 * File: src/core/movementsService.js
 */
const { query } = require('./db');
const { getEmployeeByCode } = require('./employeeService');

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS employee_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    from_title VARCHAR(255),
    to_title VARCHAR(255),
    from_department VARCHAR(255),
    to_department VARCHAR(255),
    effective_date DATE NOT NULL,
    notes TEXT,
    created_by VARCHAR(50),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_emp_code (employee_code),
    INDEX idx_effective_date (effective_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, [], 'commit');
}

async function listMovements(employeeCode) {
  await ensureTable();
  return await query(
    `
      SELECT id, employee_code, action, from_title, to_title,
             from_department, to_department, effective_date,
             notes, created_by, created_by_name, created_at
      FROM employee_movements
      WHERE employee_code=?
      ORDER BY effective_date DESC, id DESC
    `,
    [String(employeeCode).trim()],
    'fetchall'
  ) || [];
}

async function listAllMovements() {
  await ensureTable();
  return await query(
    `
      SELECT id, employee_code, action, from_title, to_title,
             from_department, to_department, effective_date,
             notes, created_by, created_by_name, created_at
      FROM employee_movements
      ORDER BY effective_date DESC, id DESC
    `,
    [],
    'fetchall'
  ) || [];
}

async function addMovement(employeeCode, action, toTitle, toDepartment, effectiveDate, notes, createdBy, createdByName) {
  await ensureTable();
  const current = await getEmployeeByCode(String(employeeCode)) || {};
  const fromTitle = current.title;
  const fromDepartment = current.department;

  await query(
    `INSERT INTO employee_movements (
      employee_code, action, from_title, to_title,
      from_department, to_department, effective_date,
      notes, created_by, created_by_name
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      String(employeeCode).trim(),
      action,
      fromTitle,
      toTitle,
      fromDepartment,
      toDepartment,
      effectiveDate,
      notes,
      createdBy,
      createdByName
    ],
    'commit'
  );

  // Update employee master data if provided
  if (toTitle || toDepartment) {
    let setParts = [];
    let params = [];
    if (toTitle) {
      setParts.push("title=?");
      params.push(toTitle);
    }
    if (toDepartment) {
      setParts.push("department=?");
      params.push(toDepartment);
    }
    params.push(String(employeeCode).trim());
    await query(
      `UPDATE employees SET ${setParts.join(', ')} WHERE employee_code=?`,
      params,
      'commit'
    );
  }
  return true;
}

async function updateMovement(movementId, employeeCode, action, toTitle, toDepartment, effectiveDate, notes) {
  await ensureTable();
  await query(
    `
      UPDATE employee_movements
      SET action=?,
          to_title=?,
          to_department=?,
          effective_date=?,
          notes=?
      WHERE id=? AND employee_code=?
    `,
    [
      action,
      toTitle || null,
      toDepartment || null,
      effectiveDate,
      notes || null,
      Number(movementId),
      String(employeeCode).trim()
    ],
    'commit'
  );

  if (toTitle || toDepartment) {
    const setParts = [];
    const params = [];
    if (toTitle) {
      setParts.push('title=?');
      params.push(toTitle);
    }
    if (toDepartment) {
      setParts.push('department=?');
      params.push(toDepartment);
    }
    params.push(String(employeeCode).trim());
    await query(
      `UPDATE employees SET ${setParts.join(', ')} WHERE employee_code=?`,
      params,
      'commit'
    );
  }

  return true;
}

async function deleteMovement(movementId, employeeCode) {
  await ensureTable();
  return await query(
    "DELETE FROM employee_movements WHERE id=? AND employee_code=?",
    [Number(movementId), String(employeeCode).trim()],
    'commit'
  );
}

module.exports = {
  listMovements,
  listAllMovements,
  addMovement,
  updateMovement,
  deleteMovement,
  ensureTable
};
