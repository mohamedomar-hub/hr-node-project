/**
 * File: src/core/salaryService.js
 * Description: Handles DB operations for Salaries. 
 * NOTE: Encryption/Decryption is handled in Routes to ensure consistency.
 */
const { query } = require('./db');

/**
 * List salaries for a specific employee or all employees
 * Returns raw data from DB. Decryption should happen in the Controller/Route.
 */
async function listSalaries(employeeCode = null) {
  let sql = `
    SELECT s.*, e.employee_name
    FROM salaries s
    LEFT JOIN employees e ON s.employee_code = e.employee_code
  `;
  let params = [];
  
  if (employeeCode) {
    sql += " WHERE s.employee_code = ?";
    params.push(employeeCode);
  }
  
  sql += " ORDER BY s.month DESC, s.employee_code ASC";
  
  try {
    const rows = await query(sql, params, 'fetchall');
    return rows || [];
  } catch (error) {
    console.error("Error listing salaries:", error);
    throw error;
  }
}

/**
 * Upsert (Insert or Update) a single salary record
 * Expects data to be already prepared (encrypted if needed) by the caller.
 */
async function upsertSalary(data) {
  const sql = `
    INSERT INTO salaries (
      employee_code, month, title, hiring_date, basic_salary, car_allowance,
      transportation, inflation_allowance, mobile_allowance, maintenance,
      gross_salary, social_ins, tax, medical_ins, zero_tracking, bonus,
      deduction, monthly_kpis, total_deductions, net_salary, deductions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      hiring_date = VALUES(hiring_date),
      basic_salary = VALUES(basic_salary),
      car_allowance = VALUES(car_allowance),
      transportation = VALUES(transportation),
      inflation_allowance = VALUES(inflation_allowance),
      mobile_allowance = VALUES(mobile_allowance),
      maintenance = VALUES(maintenance),
      gross_salary = VALUES(gross_salary),
      social_ins = VALUES(social_ins),
      tax = VALUES(tax),
      medical_ins = VALUES(medical_ins),
      zero_tracking = VALUES(zero_tracking),
      bonus = VALUES(bonus),
      deduction = VALUES(deduction),
      monthly_kpis = VALUES(monthly_kpis),
      total_deductions = VALUES(total_deductions),
      net_salary = VALUES(net_salary),
      deductions = VALUES(deductions)
  `;

  const params = [
    data.employee_code, data.month, data.title, data.hiring_date,
    data.basic_salary, data.car_allowance, data.transportation,
    data.inflation_allowance, data.mobile_allowance, data.maintenance,
    data.gross_salary, data.social_ins, data.tax, data.medical_ins,
    data.zero_tracking, data.bonus, data.deduction, data.monthly_kpis,
    data.total_deductions, data.net_salary, data.deductions
  ];

  try {
    await query(sql, params, 'commit');
  } catch (error) {
    console.error("Error upserting salary:", error);
    throw error;
  }
}

module.exports = {
  listSalaries,
  upsertSalary
};