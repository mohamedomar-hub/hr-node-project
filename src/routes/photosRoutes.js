/**
 * File: src/routes/photosRoutes.js
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver'); // لتحميل جميع الصور كملف ZIP
const { requirePermission } = require('../core/authUtils');
const { query } = require('../core/db');

// Employee Photos Page (HR Only)
router.get('/employee_photos', requirePermission('employee_photos'), async (req, res) => {
  try {
    // Fetch all employees with photos
    const sql = `
      SELECT e.employee_code, e.employee_name, ep.photo_path 
      FROM employees e 
      JOIN employee_photos ep ON e.employee_code = ep.employee_code 
      ORDER BY e.employee_name
    `;
    const rows = await query(sql, [], 'fetchall') || [];

    // Format data for view
    const photos = rows.map(r => ({
      employee_code: r.employee_code,
      employee_name: r.employee_name,
      path: r.photo_path // Assuming photo_path is relative like 'employee_photos/1001.jpg'
    }));

    res.render('hr/photos', {
      user: req.session.user,
      pageTitle: 'Employee Photos',
      photos: photos
    });
  } catch (error) {
    console.error("Photos Error:", error);
    res.status(500).send('Server Error loading photos.');
  }
});

// Download All Photos as ZIP
router.get('/employee_photos/download/all', requirePermission('employee_photos'), async (req, res) => {
  try {
    const sql = `
      SELECT e.employee_code, e.employee_name, ep.photo_path 
      FROM employees e 
      JOIN employee_photos ep ON e.employee_code = ep.employee_code 
    `;
    const rows = await query(sql, [], 'fetchall') || [];

    if (rows.length === 0) {
      req.flash('warning', 'No photos available to download.');
      return res.redirect('/employee_photos');
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=All_Employee_Photos.zip');
    
    archive.pipe(res);

    // Add each photo to the archive
    rows.forEach(row => {
      const filePath = path.join(__dirname, '../../', row.photo_path); // Adjust path based on your structure
      const fileName = `${row.employee_code}_${row.employee_name.replace(/\s+/g, '_')}.jpg`;
      
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: fileName });
      }
    });

    await archive.finalize();
  } catch (error) {
    console.error("Download ZIP Error:", error);
    res.status(500).send('Failed to generate ZIP file.');
  }
});

module.exports = router;