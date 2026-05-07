/**
 * File: src/core/leavesService.js
 */
const { query } = require('./db');
const { cleanCode } = require('./utils'); // Assuming utils.js has cleanCode or define it here

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    manager_code VARCHAR(50),
    manager_name VARCHAR(150),
    leave_type VARCHAR(50),
    start_date DATE,
    end_date DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    comment TEXT,
    decision_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');

  await query(`CREATE TABLE IF NOT EXISTS leave_balances (
    employee_code VARCHAR(50) PRIMARY KEY,
    total_days INT DEFAULT 30,
    used_days INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');
}

async function createLeave(leave) {
  await ensureTables();
  
  const empCode = String(leave['Employee Code'] || '').trim();
  if (!empCode) {
    throw new Error('Employee Code is required');
  }
  
  // Ensure balance row exists
  await query("INSERT IGNORE INTO leave_balances (employee_code, total_days, used_days) VALUES (?, 30, 0)", [empCode], 'commit');
  
  // ✅ تأكد إن كل القيم مش undefined
  const managerCode = leave['Manager Code'] ? String(leave['Manager Code']).trim() : null;
  const managerName = leave['Manager Name'] || null;
  const leaveType = leave['Leave Type'] || 'Annual';
  const startDate = leave['Start Date'];
  const endDate = leave['End Date'];
  const reason = leave['Reason'] || '';
  const status = leave['Status'] || 'Pending';
  const comment = leave['Comment'] || null;
  const decisionDate = leave['Decision Date'] || null;
  
  // ✅ تحقق من التواريخ
  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required');
  }
  
  await query(
    `INSERT INTO leaves (
      employee_code, manager_code, manager_name, leave_type,
      start_date, end_date, reason, status, comment, decision_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      empCode,
      managerCode,
      managerName,
      leaveType,
      startDate,
      endDate,
      reason,
      status,
      comment,
      decisionDate
    ],
    'commit'
  );
  
  return true;
}
async function updateLeaveStatus(leaveId, status, comment = null) {
  await ensureTables();
  const row = await query(
    "SELECT employee_code, status, start_date, end_date FROM leaves WHERE id=?",
    [leaveId],
    'fetchone'
  );
  if (!row) return false;

  const prevStatus = row.status;
  const empCode = row.employee_code;
  
  // Calculate days difference
  let days = 0;
  if (row.start_date && row.end_date) {
    const start = new Date(row.start_date);
    const end = new Date(row.end_date);
    const diffTime = Math.abs(end - start);
    days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
  }

  await query(
    "UPDATE leaves SET status=?, comment=?, decision_date=NOW() WHERE id=?",
    [status, comment, leaveId],
    'commit'
  );

  // Update Balance Logic
  if (status === 'Approved' && prevStatus !== 'Approved') {
    await query("UPDATE leave_balances SET used_days = used_days + ? WHERE employee_code=?", [days, empCode], 'commit');
  } else if (prevStatus === 'Approved' && status !== 'Approved') {
    await query("UPDATE leave_balances SET used_days = GREATEST(used_days - ?, 0) WHERE employee_code=?", [days, empCode], 'commit');
  }

  return true;
}

async function getLeaveBalance(empCode) {
  await ensureTables();
  await query("INSERT IGNORE INTO leave_balances (employee_code, total_days, used_days) VALUES (?,30,0)", [empCode], 'commit');
  
  // Recalculate used from approved requests to stay accurate
  const approved = await query(
    "SELECT COALESCE(SUM(GREATEST(DATEDIFF(end_date, start_date),1)),0) AS days FROM leaves WHERE employee_code=? AND status='Approved'",
    [empCode],
    'fetchone'
  );
  const usedDays = parseInt(approved?.days || 0);
  
  await query("UPDATE leave_balances SET used_days=? WHERE employee_code=?", [usedDays, empCode], 'commit');

  const row = await query(
    "SELECT total_days, used_days FROM leave_balances WHERE employee_code=?",
    [empCode],
    'fetchone'
  ) || { total_days: 0, used_days: 0 };

  return {
    total: row.total_days,
    used: row.used_days,
    remaining: Math.max(row.total_days - row.used_days, 0)
  };
}
/**
 * List all leaves for an employee
 */
async function listEmployeeLeaves(employeeCode) {
    await ensureTables();
    const rows = await query(
        `SELECT l.*, 
         CASE 
            WHEN l.status = 'Pending' THEN 'warning'
            WHEN l.status = 'Approved' THEN 'success'
            ELSE 'danger'
         END as badge_class
         FROM leaves l 
         WHERE l.employee_code = ? 
         ORDER BY l.created_at DESC`,
        [employeeCode],
        'fetchall'
    );
    return rows || [];
}

/**
 * List leaves for manager (pending or history)
 */
async function listManagerLeaves(managerCode, history = false) {
    await ensureTables();
    let sql = `
        SELECT l.*, e.employee_name 
        FROM leaves l 
        JOIN employees e ON l.employee_code = e.employee_code 
        WHERE l.manager_code = ?
    `;
    
    if (!history) {
        sql += ` AND l.status = 'Pending'`;
    } else {
        sql += ` AND l.status IN ('Approved', 'Rejected')`;
    }
    
    sql += ` ORDER BY l.created_at DESC`;
    
    const rows = await query(sql, [managerCode], 'fetchall');
    return rows || [];
}

module.exports = {
  createLeave,
  updateLeaveStatus,
  getLeaveBalance,
  listEmployeeLeaves,
  listManagerLeaves,
  ensureTables
};