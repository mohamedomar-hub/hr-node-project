/**
 * File: src/routes/expensesRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { requireLogin, requirePermission, getUserRole } = require('../core/authUtils');
const { query } = require('../core/db');
const expensesService = require('../core/expensesService');

// Configure Multer for Attachments
const ATTACHMENT_FOLDER = 'static/uploads/expenses';
if (!fs.existsSync(ATTACHMENT_FOLDER)) {
    fs.mkdirSync(ATTACHMENT_FOLDER, { recursive: true });
}

const attachmentStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, ATTACHMENT_FOLDER);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const uploadAttachments = multer({
    storage: attachmentStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});

function padMonth(value) {
    return String(value).padStart(2, '0');
}

function formatMonthKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${padMonth(date.getMonth() + 1)}`;
}

function formatMonthLabel(monthKey) {
    if (!monthKey) return '';
    const [year, month] = String(monthKey).split('-').map(Number);
    if (!year || !month) return monthKey;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateOnly(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
}

function monthKey(row) {
    return formatMonthKey(row.expense_date || row.created_at);
}

const TEAM_EXPENSE_ROLES = new Set(['AM', 'DM']);
const EXPENSE_APPROVER_ROLES = new Set(['AM', 'DM', 'HR']);

function getExpenseRedirect(role) {
    return role === 'HR' ? '/expense/report' : '/expense/team';
}

function ensureExpenseRole(req, res, allowedRoles) {
    const role = getUserRole(req.session.user);
    if (!allowedRoles.has(role)) {
        req.flash('danger', 'You are not allowed to access this page.');
        res.redirect('/');
        return null;
    }
    return role;
}

async function buildExpenseReportData(req) {
    if (req.query.clear) {
        req.session.hide_expense_report = true;
        req.session.clear_expense_report_before = new Date().toISOString();
    }
    if (req.query.show) {
        delete req.session.hide_expense_report;
        delete req.session.clear_expense_report_before;
    }
    const hide = !!req.session.hide_expense_report;
    const clearBefore = req.session.clear_expense_report_before;
    const selectedMonth = (req.query.m || '').trim();
    const selectedTitle = (req.query.title || '').trim();

    let expenses = hide ? [] : await expensesService.listAllExpensesForHR();

    if (!hide && clearBefore) {
        const cutoff = new Date(clearBefore);
        if (!Number.isNaN(cutoff.getTime())) {
            expenses = expenses.filter((row) => {
                const current = row.updated_at || row.created_at;
                return current && new Date(current) > cutoff;
            });
        }
    }

    const employees = await query(
        "SELECT employee_code, employee_name, title, manager_code FROM employees",
        [],
        'fetchall'
    ) || [];

    const employeeMap = new Map(employees.map((emp) => [String(emp.employee_code).trim(), emp]));

    const enriched = expenses.map((row) => {
        const expense = { ...row };
        const employeeCode = String(expense.employee_code || '').trim();
        const employee = employeeMap.get(employeeCode);
        const managerCode = String(expense.manager_code || (employee && employee.manager_code) || '').trim();
        const manager = managerCode ? employeeMap.get(managerCode) : null;

        if (!expense.employee_name && employee) expense.employee_name = employee.employee_name;
        if (!expense.employee_title && employee) expense.employee_title = employee.title;

        expense.manager_code = managerCode || expense.manager_code || '';
        expense.manager_name = expense.manager_name || (manager && manager.employee_name) || '';
        expense.manager_title = expense.manager_title || (manager && manager.title) || '';

        expense.report_month = monthKey(expense);
        expense.report_month_label = formatMonthLabel(expense.report_month);
        expense.expense_date_only = formatDateOnly(expense.expense_date);
        expense.created_at_only = formatDateOnly(expense.created_at);
        expense.updated_at_only = formatDateOnly(expense.updated_at);

        return expense;
    });

    const months = [...new Set(enriched.map((row) => row.report_month).filter(Boolean))].sort().reverse();
    const monthOptions = months.map((key) => ({
        value: key,
        label: formatMonthLabel(key)
    }));

    const titles = [...new Set(enriched.map((row) => String(row.employee_title || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const filtered = enriched.filter((row) => {
        if (selectedMonth && row.report_month !== selectedMonth) return false;
        if (selectedTitle && String(row.employee_title || '').trim() !== selectedTitle) return false;
        return true;
    });

    return {
        hide,
        expenses: filtered,
        months: monthOptions,
        titles,
        selectedMonth,
        selectedTitle
    };
}

// New Expense Form
router.get('/expense/new', requireLogin, (req, res) => {
    res.render('expenses/new_expense', {
        user: req.session.user,
        pageTitle: 'New Expense Request'
    });
});

// Submit New Expense (Handles Multiple Items & Optional Files)
router.post('/expense/new', requireLogin, uploadAttachments.any(), async (req, res) => {
    try {
        const { from_location, to_location, expense_date, days_count, expense_type, amount, description, transport_cost } = req.body;

        // Ensure we have arrays to loop through
        if (!Array.isArray(from_location) || !from_location.length) {
            req.flash('danger', 'No expense items found.');
            return res.redirect('/expense/new');
        }

        const itemCount = from_location.length;
        let successCount = 0;
        const files = req.files || [];

        for (let i = 0; i < itemCount; i++) {
            // Basic validation for each item
            if (!from_location[i] || !to_location[i] || !amount[i]) {
                continue; // Skip invalid items
            }

            // Map files to items by index if available
            const filePath = files[i] ? `${ATTACHMENT_FOLDER}/${files[i].filename}` : null;

            await expensesService.createExpense({
                employee_code: req.session.user.employee_code,
                from_location: from_location[i],
                to_location: to_location[i],
                expense_date: expense_date[i],
                days_count: days_count[i] || 1,
                expense_type: expense_type[i] || 'Daily Allowance', // Default to Daily Allowance if empty
                amount: amount[i],
                transport_cost: transport_cost ? (transport_cost[i] || 0) : 0,
                description: description[i] || '',
                attachment_path: filePath
            });
            successCount++;
        }

        if (successCount > 0) {
            req.flash('success', `${successCount} expense item(s) submitted successfully.`);
        } else {
            req.flash('warning', 'No valid expense items were submitted.');
        }
        res.redirect('/expense/my');
    } catch (error) {
        console.error("Expense Submit Error:", error);
        req.flash('danger', 'Failed to submit expenses: ' + error.message);
        res.redirect('/expense/new');
    }
});

// My Expenses
router.get('/expense/my', requireLogin, async (req, res) => {
    try {
        const expenses = await expensesService.listMyExpenses(req.session.user.employee_code);
        res.render('expenses/my_expenses', {
            user: req.session.user,
            pageTitle: 'My Expenses',
            expenses: expenses
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading my expenses.');
    }
});

// Download My Expenses as Excel
router.get('/expense/my/download', requireLogin, async (req, res) => {
    try {
        const expenses = await expensesService.listMyExpenses(req.session.user.employee_code);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('My Expenses');

        worksheet.columns = [
            { header: 'Date', key: 'expense_date', width: 15 },
            { header: 'From', key: 'from_location', width: 20 },
            { header: 'To', key: 'to_location', width: 20 },
            { header: 'Type', key: 'allowance_type', width: 15 },
            { header: 'Days', key: 'num_days', width: 10 },
            { header: 'Transport Cost', key: 'transport_cost', width: 15 },
            { header: 'Total Amount', key: 'total', width: 15 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        worksheet.addRows(expenses.map(e => ({
            expense_date: e.expense_date,
            from_location: e.from_location,
            to_location: e.to_location,
            allowance_type: e.allowance_type,
            num_days: e.num_days,
            transport_cost: e.transport_cost,
            total: e.total,
            status: e.status
        })));

        // Style Header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCCCC' }
        };

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=My_Expenses.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).send('Failed to generate report.');
    }
});

// Delete Expense Item (NEW ROUTE)
router.post('/expense/delete/:id', requireLogin, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const employeeCode = req.session.user.employee_code;
        await expensesService.deleteExpense(expenseId, employeeCode);
        req.flash('success', 'Expense item deleted successfully.');
        res.redirect('/expense/my');
    } catch (error) {
        console.error("Delete Expense Error:", error);
        req.flash('danger', 'Failed to delete expense: ' + error.message);
        res.redirect('/expense/my');
    }
});

// --- NEW ROUTE: Expenses Team (For DM/AM) ---
// This route matches the link in base.ejs: /expense/team
router.get('/expense/team', requirePermission('expenses_fuel'), async (req, res) => {
    try {
        const role = ensureExpenseRole(req, res, TEAM_EXPENSE_ROLES);
        if (!role) return;

        const expenses = await expensesService.listPendingExpensesForManager(req.session.user.employee_code);

        res.render('expenses/team_expenses', { 
            user: req.session.user,
            pageTitle: 'Expenses Team', 
            expenses: expenses,
            isTeamView: true
        });
    } catch (error) {
        console.error("Error loading team expenses:", error);
        res.status(500).send('Error loading team expenses.');
    }
});

router.get('/expense/approve', requirePermission('expenses_fuel'), async (req, res) => {
    try {
        const role = ensureExpenseRole(req, res, EXPENSE_APPROVER_ROLES);
        if (!role) return;

        if (role === 'HR') {
            return res.redirect('/expense/report');
        }

        const expenses = await expensesService.listPendingExpensesForManager(req.session.user.employee_code);
        res.render('expenses/manager_expenses', {
            user: req.session.user,
            pageTitle: role === 'HR' ? 'HR Expense Approvals' : 'Pending Expense Approvals',
            expenses: expenses
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading pending expenses.');
    }
});

// Approve/Reject Action
router.post('/expense/approve', requirePermission('expenses_fuel'), async (req, res) => {
    try {
        const role = ensureExpenseRole(req, res, EXPENSE_APPROVER_ROLES);
        if (!role) return;

        const { id, action } = req.body; // action: 'Approved' or 'Rejected'
        
        if (!id || !action || !['Approved', 'Rejected'].includes(action)) {
            req.flash('danger', 'Invalid request.');
            return res.redirect(getExpenseRedirect(role));
        }

        const result = await expensesService.updateExpenseStatus(id, action, req.session.user.employee_code);
        
        if (result.affectedRows === 0) {
            req.flash('warning', 'No record was updated. Please check if the expense exists.');
        } else {
            req.flash('success', `Expense ${action.toLowerCase()} successfully.`);
        }
        
        res.redirect(getExpenseRedirect(role)); 
    } catch (error) {
        console.error(error);
        req.flash('danger', error.message || 'Failed to update status.');
        res.redirect(getExpenseRedirect(getUserRole(req.session.user)));
    }
});

// HR Review Page
router.get('/hr/expenses', requirePermission('hr_manager'), async (req, res) => {
    try {
        const expenses = await expensesService.listAllExpensesForHR();
        res.render('hr/hr_expenses', {
            user: req.session.user,
            pageTitle: 'HR Expenses Review',
            expenses: expenses
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading HR expenses.');
    }
});

router.get('/expense/report', requirePermission('expenses_report'), async (req, res) => {
    try {
        const report = await buildExpenseReportData(req);
        res.render('expenses/report', {
            user: req.session.user,
            pageTitle: 'Expenses Report',
            expenses: report.expenses,
            months: report.months,
            titles: report.titles,
            selected_month: report.selectedMonth,
            selected_title: report.selectedTitle,
            hide: report.hide
        });
    } catch (error) {
        console.error('Expense report load error:', error);
        res.status(500).send('Error loading expenses report.');
    }
});

router.get('/expense/report/export', requirePermission('expenses_report'), async (req, res) => {
    try {
        const report = await buildExpenseReportData(req);
        if (!report.expenses.length) {
            req.flash('warning', 'No expenses to export.');
            return res.redirect('/expense/report');
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Expenses Report');

        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Employee Code', key: 'employee_code', width: 16 },
            { header: 'Employee Name', key: 'employee_name', width: 28 },
            { header: 'Title', key: 'employee_title', width: 20 },
            { header: 'Month', key: 'report_month', width: 14 },
            { header: 'From', key: 'from_location', width: 18 },
            { header: 'To', key: 'to_location', width: 18 },
            { header: 'Expense Date', key: 'expense_date', width: 18 },
            { header: 'Type', key: 'allowance_type', width: 18 },
            { header: 'Days', key: 'num_days', width: 10 },
            { header: 'Total', key: 'total', width: 14 },
            { header: 'Transport Cost', key: 'transport_cost', width: 16 },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Current Approver', key: 'current_approver', width: 18 },
            { header: 'Manager', key: 'manager_name', width: 28 },
            { header: 'Manager Code', key: 'manager_code', width: 16 },
            { header: 'Description', key: 'description', width: 30 },
            { header: 'Attachment Path', key: 'attachment_path', width: 42 },
            { header: 'Created At', key: 'created_at', width: 22 },
            { header: 'Updated At', key: 'updated_at', width: 22 }
        ];

        report.expenses.forEach((expense) => {
            worksheet.addRow({
                id: expense.id,
                employee_code: expense.employee_code,
                employee_name: expense.employee_name,
                employee_title: expense.employee_title || '',
                report_month: expense.report_month || '',
                from_location: expense.from_location || '',
                to_location: expense.to_location || '',
                expense_date: formatDateOnly(expense.expense_date),
                allowance_type: expense.allowance_type || '',
                num_days: expense.num_days || '',
                total: expense.total || '',
                transport_cost: expense.transport_cost || '',
                status: expense.status || '',
                current_approver: expense.current_approver || '',
                manager_name: expense.manager_name || '',
                manager_code: expense.manager_code || '',
                description: expense.description || '',
                attachment_path: expense.attachment_path || '',
                created_at: formatDateOnly(expense.created_at),
                updated_at: formatDateOnly(expense.updated_at)
            });
        });

        worksheet.getRow(1).font = { bold: true };
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=expenses_report_${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Expense report export error:', error);
        res.status(500).send('Failed to generate expense report export.');
    }
});

router.post('/expense/report/:id/delete', requirePermission('expenses_report'), async (req, res) => {
    try {
        await expensesService.deleteExpenseForHR(req.params.id);
        req.flash('success', 'Expense record deleted successfully.');
    } catch (error) {
        console.error('Expense report delete error:', error);
        req.flash('danger', error.message || 'Failed to delete expense record.');
    }
    const params = new URLSearchParams();
    if (req.query.m) params.set('m', req.query.m);
    if (req.query.title) params.set('title', req.query.title);
    const redirectUrl = params.toString() ? `/expense/report?${params.toString()}` : '/expense/report';
    res.redirect(redirectUrl);
});

router.post('/expense/report/:id/action', requirePermission('expenses_report'), async (req, res) => {
    try {
        const role = ensureExpenseRole(req, res, new Set(['HR']));
        if (!role) return;

        const action = String(req.body.action || '').trim();
        if (!['Approved', 'Rejected'].includes(action)) {
            req.flash('danger', 'Invalid request.');
        } else {
            const result = await expensesService.updateExpenseStatus(req.params.id, action, req.session.user.employee_code);
            if (result.affectedRows === 0) {
                req.flash('warning', 'No record was updated. Please check if the expense exists.');
            } else {
                req.flash('success', `Expense ${action.toLowerCase()} successfully.`);
            }
        }
    } catch (error) {
        console.error('Expense report action error:', error);
        req.flash('danger', error.message || 'Failed to update expense status.');
    }

    const params = new URLSearchParams();
    if (req.query.m) params.set('m', req.query.m);
    if (req.query.title) params.set('title', req.query.title);
    const redirectUrl = params.toString() ? `/expense/report?${params.toString()}` : '/expense/report';
    res.redirect(redirectUrl);
});

module.exports = router;
