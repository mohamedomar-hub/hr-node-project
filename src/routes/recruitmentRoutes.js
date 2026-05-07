/**
 * File: src/routes/recruitmentRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requirePermission } = require('../core/authUtils');
const { query } = require('../core/db');

const UPLOAD_DIR = './static/uploads/recruitment';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS recruitment_candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255),
    path VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');
}

router.get('/recruitment', requirePermission('recruitment'), async (req, res) => {
  await ensureTable();
  const rows = await query("SELECT * FROM recruitment_candidates ORDER BY uploaded_at DESC", [], 'fetchall');
  res.render('hr/recruitment', {
    user: req.session.user,
    pageTitle: 'Recruitment',
    rows: rows
  });
});

router.post('/recruitment', requirePermission('recruitment'), upload.single('cv'), async (req, res) => {
  if (req.file) {
    await ensureTable();
    await query(
      "INSERT INTO recruitment_candidates (filename, path) VALUES (?,?)",
      [req.file.filename, req.file.path],
      'commit'
    );
  }
  res.redirect('/recruitment');
});

router.post('/recruitment/delete', requirePermission('recruitment'), async (req, res) => {
  const row = await query("SELECT path FROM recruitment_candidates WHERE id=?", [req.body.id], 'fetchone');
  if (row && fs.existsSync(row.path)) fs.unlinkSync(row.path);
  await query("DELETE FROM recruitment_candidates WHERE id=?", [req.body.id], 'commit');
  res.redirect('/recruitment');
});

module.exports = router;
