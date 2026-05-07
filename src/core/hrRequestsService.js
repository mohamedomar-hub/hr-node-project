/**
 * File: src/core/hrRequestsService.js
 */
const { query } = require('./db');

async function createRequest(hrCode, employeeCode, employeeName, requestText, fileAttached = null) {
  await query(
    `INSERT INTO hr_requests (hr_code, employee_code, employee_name, request, file_attached, status, date_sent)
    VALUES (?,?,?,?,?,'Pending', NOW())`,
    [hrCode, employeeCode, employeeName, requestText, fileAttached],
    'commit'
  );
  return true;
}

async function listRequestsForEmployee(employeeCode) {
  return await query(
    "SELECT * FROM hr_requests WHERE employee_code=? ORDER BY date_sent DESC",
    [employeeCode],
    'fetchall'
  );
}

async function updateRequestResponse(reqId, responseText, responseFile = null) {
  await query(
    `UPDATE hr_requests SET response=?, response_file=?, status='Completed', date_responded=NOW()
    WHERE id=?`,
    [responseText, responseFile, reqId],
    'commit'
  );
  return true;
}

module.exports = {
  createRequest,
  listRequestsForEmployee,
  updateRequestResponse
};