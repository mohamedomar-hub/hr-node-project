/**
 * File: src/core/employeeService.js
 * Description: Service layer for Employee operations (CRUD)
 */
const { query } = require('./db');
const crypto = require('crypto');
require('dotenv').config();

// Helper to hash passwords using SHA256 (Consistent with your original file)
function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Get total number of employees
 */
async function totalEmployees() {
  try {
    const result = await query("SELECT COUNT(*) as count FROM employees", [], 'fetchone');
    return result ? result.count : 0;
  } catch (error) {
    console.error("Error getting total employees:", error);
    throw error;
  }
}

/**
 * Get headcount by department
 */
async function headcountByDepartment() {
  try {
    const rows = await query("SELECT department, COUNT(*) as total FROM employees GROUP BY department ORDER BY total DESC", [], 'fetchall');
    return rows || [];
  } catch (error) {
    console.error("Error getting headcount by dept:", error);
    throw error;
  }
}

/**
 * Get employee by code
 * Added validation to ensure code is provided and trimmed
 */
async function getEmployeeByCode(code) {
  // Validate input
  if (!code || typeof code !== 'string') {
    console.warn("getEmployeeByCode called with invalid code:", code);
    return null;
  }

  try {
    // Trim whitespace to avoid issues with "123 " vs "123"
    const trimmedCode = code.trim();
    
    const sql = "SELECT * FROM employees WHERE TRIM(employee_code) = ?";
    const row = await query(sql, [trimmedCode], 'fetchone');
    
    return row || null;
  } catch (error) {
    console.error("Error getting employee by code:", error);
    throw error;
  }
}

/**
 * Upsert (Insert or Update) an employee
 */
async function upsertEmployee(data) {
  if (!data || !data.employee_code) {
    throw new Error("Employee code is required for upsert.");
  }

  // Check if employee exists
  const existing = await getEmployeeByCode(data.employee_code);
  
  let sql;
  let params;

  if (existing) {
    // Update existing employee
    sql = `
      UPDATE employees SET 
        employee_name = ?, 
        title = ?, 
        department = ?, 
        manager_code = ?, 
        hire_date = ?
      WHERE employee_code = ?
    `;
    params = [
      data.employee_name,
      data.title,
      data.department,
      data.manager_code,
      data.hire_date,
      data.employee_code
    ];
  } else {
    // Insert new employee
    // Note: If password_hash column exists and you want to set a default password, add it here
    sql = `
      INSERT INTO employees (
        employee_code, employee_name, title, department, manager_code, hire_date
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    params = [
      data.employee_code,
      data.employee_name,
      data.title,
      data.department,
      data.manager_code,
      data.hire_date
    ];
  }

  try {
    await query(sql, params, 'commit');
  } catch (error) {
    console.error("Error upserting employee:", error);
    throw error;
  }
}

/**
 * Delete an employee by code
 */
async function deleteEmployee(code) {
  if (!code) {
    throw new Error("Employee code is required for deletion.");
  }
  try {
    await query("DELETE FROM employees WHERE employee_code = ?", [code], 'commit');
  } catch (error) {
    console.error("Error deleting employee:", error);
    throw error;
  }
}

/**
 * Get all employees (for dropdowns or lists)
 */
async function getAllEmployees() {
  try {
    const rows = await query("SELECT employee_code, employee_name, title FROM employees ORDER BY employee_name", [], 'fetchall');
    return rows || [];
  } catch (error) {
    console.error("Error getting all employees:", error);
    throw error;
  }
}

module.exports = {
  totalEmployees,
  headcountByDepartment,
  getEmployeeByCode,
  upsertEmployee,
  deleteEmployee,
  getAllEmployees,
  listEmployees: getAllEmployees,
  hashPassword // Exported in case needed elsewhere
};