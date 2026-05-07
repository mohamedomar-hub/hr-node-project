/**
 * File: src/core/expensesService.js
 */
const fs = require('fs');
const path = require('path');
const { query } = require('./db');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function resolveAttachmentPath(attachmentPath) {
  if (!attachmentPath) return null;
  const normalized = String(attachmentPath).replace(/\\/g, '/');

  if (path.isAbsolute(normalized)) {
    return fs.existsSync(normalized) ? normalized : null;
  }

  const candidate = path.join(PROJECT_ROOT, normalized);
  return fs.existsSync(candidate) ? candidate : null;
}

function normalizeRoleFromTitle(title) {
  const value = String(title || '').trim().toUpperCase();
  if (!value) return '';
  if (value === 'MR' || value === 'MEDICAL REPRESENTATIVE') return 'MR';
  if (value === 'DM' || value === 'DISTRICT MANAGER') return 'DM';
  if (value === 'AM' || value === 'AREA MANAGER') return 'AM';
  if (value.includes('HR')) return 'HR';
  return value;
}

async function findFirstHrCode() {
  const hr = await query(
    "SELECT employee_code FROM employees WHERE UPPER(title) LIKE '%HR%' LIMIT 1",
    [],
    'fetchone'
  );
  return hr?.employee_code ? String(hr.employee_code).trim() : null;
}

async function createExpense(data) {
  const employee = await query(
    "SELECT title, manager_code FROM employees WHERE employee_code = ?",
    [data.employee_code],
    'fetchone'
  );

  if (!employee) {
    throw new Error('Employee not found for expense submission.');
  }

  const submitterRole = normalizeRoleFromTitle(employee.title);
  const managerCode = employee?.manager_code ? String(employee.manager_code).trim() : null;
  const hrCode = await findFirstHrCode();

  let initialApprover = null;
  if (submitterRole === 'AM') {
    initialApprover = hrCode || managerCode;
  } else if (submitterRole === 'DM' || submitterRole === 'MR') {
    initialApprover = managerCode || hrCode;
  } else {
    initialApprover = managerCode || hrCode;
  }

  if (!initialApprover) {
    throw new Error('No approver is configured for this expense request.');
  }

  const sql = `
    INSERT INTO expenses (
      employee_code,
      from_location,
      to_location,
      expense_date,
      num_days,
      allowance_type,
      total,
      transport_cost,
      description,
      attachment_path,
      status,
      current_approver,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, NOW())
  `;

  const params = [
    data.employee_code,
    data.from_location,
    data.to_location,
    data.expense_date,
    data.days_count,
    data.expense_type,
    data.amount,
    data.transport_cost,
    data.description,
    data.attachment_path,
    initialApprover
  ];

  try {
    await query(sql, params, 'commit');
  } catch (error) {
    console.error('Error creating expense:', error);
    throw error;
  }
}

async function listMyExpenses(employeeCode) {
  const sql = `
    SELECT * FROM expenses
    WHERE employee_code = ?
    ORDER BY created_at DESC
  `;
  return await query(sql, [employeeCode], 'fetchall') || [];
}

async function listPendingExpensesForManager(managerCode) {
  const sql = `
    SELECT e.*, emp.employee_name
    FROM expenses e
    JOIN employees emp ON e.employee_code = emp.employee_code
    WHERE e.current_approver = ? AND e.status = 'Pending'
    ORDER BY e.created_at DESC
  `;
  return await query(sql, [managerCode], 'fetchall') || [];
}

async function updateExpenseStatus(expenseId, status, reviewedBy) {
  const reviewerCode = String(reviewedBy || '').trim();
  console.log(`[Expense Update] ID: ${expenseId}, Action: ${status}, By: ${reviewerCode}`);

  if (!reviewerCode) {
    throw new Error('Reviewer code is required.');
  }

  if (!['Approved', 'Rejected'].includes(status)) {
    throw new Error('Invalid expense action.');
  }

  const expense = await query(
    "SELECT id, status, current_approver FROM expenses WHERE id = ?",
    [expenseId],
    'fetchone'
  );

  if (!expense) {
    throw new Error('Expense not found.');
  }

  if (String(expense.status || '').trim() !== 'Pending') {
    throw new Error(`Expense is already ${String(expense.status || 'processed').toLowerCase()}.`);
  }

  if (String(expense.current_approver || '').trim() !== reviewerCode) {
    throw new Error('This expense is not assigned to the current approver.');
  }

  if (status === 'Rejected') {
    const sql = `
      UPDATE expenses
      SET status = 'Rejected', current_approver = NULL, updated_at = NOW()
      WHERE id = ? AND current_approver = ? AND status = 'Pending'
    `;
    console.log(`[Expense] Rejected by ${reviewerCode}`);
    return await query(sql, [expenseId, reviewerCode], 'commit');
  }

  const reviewer = await query(
    "SELECT title, manager_code FROM employees WHERE employee_code = ?",
    [reviewerCode],
    'fetchone'
  );

  if (!reviewer) {
    throw new Error('Reviewer not found in database.');
  }

  const reviewerRole = normalizeRoleFromTitle(reviewer.title);
  let nextApprover = null;
  let finalStatus = 'Pending';

  if (reviewerRole === 'DM') {
    nextApprover = reviewer.manager_code ? String(reviewer.manager_code).trim() : null;
    if (!nextApprover) {
      nextApprover = await findFirstHrCode();
    }
    console.log(`[Expense] DM Approved. Next Approver (AM): ${nextApprover}`);
  } else if (reviewerRole === 'AM') {
    nextApprover = await findFirstHrCode();
    console.log(`[Expense] AM Approved. Next Approver (HR): ${nextApprover}`);
  } else {
    finalStatus = 'Approved';
    nextApprover = null;
    console.log(`[Expense] Final Approval by ${reviewerRole || reviewer.title}`);
  }

  if (finalStatus === 'Pending' && !nextApprover) {
    throw new Error('Next approver is not configured for this request.');
  }

  const sql = `
    UPDATE expenses
    SET status = ?, current_approver = ?, updated_at = NOW()
    WHERE id = ? AND current_approver = ? AND status = 'Pending'
  `;
  return await query(sql, [finalStatus, nextApprover, expenseId, reviewerCode], 'commit');
}

async function listAllExpensesForHR() {
  const sql = `
    SELECT e.*, emp.employee_name, emp.title as emp_title, mgr.employee_name as manager_name
    FROM expenses e
    JOIN employees emp ON e.employee_code = emp.employee_code
    LEFT JOIN employees mgr ON emp.manager_code = mgr.employee_code
    ORDER BY e.created_at DESC
  `;
  return await query(sql, [], 'fetchall') || [];
}

async function deleteExpense(expenseId, employeeCode) {
  const sql = "DELETE FROM expenses WHERE id = ? AND employee_code = ? AND status = 'Pending'";
  const result = await query(sql, [expenseId, employeeCode], 'commit');

  if (result.affectedRows === 0) {
    throw new Error('Cannot delete this expense. It may already be processed or does not belong to you.');
  }
}

async function deleteExpenseForHR(expenseId) {
  const expense = await query(
    "SELECT id, attachment_path FROM expenses WHERE id = ?",
    [expenseId],
    'fetchone'
  );

  if (!expense) {
    throw new Error('Expense not found.');
  }

  await query("DELETE FROM expenses WHERE id = ?", [expenseId], 'commit');

  const filePath = resolveAttachmentPath(expense.attachment_path);
  if (filePath) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Could not delete expense attachment:', error.message);
    }
  }

  return true;
}

module.exports = {
  createExpense,
  listMyExpenses,
  listPendingExpensesForManager,
  updateExpenseStatus,
  listAllExpensesForHR,
  deleteExpense,
  deleteExpenseForHR
};
