/**
 * File: src/core/complianceService.js
 */
const { query } = require('./db');

async function createMessage(data) {
  await query(
    `INSERT INTO compliance_messages (
      mr_code, mr_name, compliance_recipient, compliance_code,
      manager_code, manager_name, message, status
    ) VALUES (?,?,?,?,?,?,?,'Pending')`,
    [
      data['MR Code'] || '',
      data['MR Name'] || '',
      data['Compliance Recipient'] || '',
      data['Compliance Code'] || '',
      data['Manager Code'],
      data['Manager Name'],
      data.Message || ''
    ],
    'commit'
  );
  return true;
}

async function listMessages(mrCode = null, complianceCode = null, managerCode = null) {
  let base = `SELECT cm.*, emp.employee_name AS mr_name_resolved
              FROM compliance_messages cm
              LEFT JOIN employees emp ON emp.employee_code = cm.mr_code
              WHERE 1=1`;
  let args = [];

  if (mrCode) {
    if (Array.isArray(mrCode)) {
      const placeholders = mrCode.map(() => '?').join(',');
      base += ` AND cm.mr_code IN (${placeholders})`;
      args.push(...mrCode);
    } else {
      base += " AND cm.mr_code=?";
      args.push(mrCode);
    }
  }
  if (complianceCode) {
    base += " AND cm.compliance_code=?";
    args.push(complianceCode);
  }
  if (managerCode) {
    if (Array.isArray(managerCode)) {
      const placeholders = managerCode.map(() => '?').join(',');
      base += ` AND cm.manager_code IN (${placeholders})`;
      args.push(...managerCode);
    } else {
      base += " AND cm.manager_code=?";
      args.push(managerCode);
    }
  }
  base += " ORDER BY cm.created_at DESC";

  return await query(base, args, 'fetchall');
}

module.exports = {
  createMessage,
  listMessages
};