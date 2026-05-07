/**
 * File: src/core/db.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config(); // <--- هذا السطر مهم جداً لقراءة .env

// تأكد أن أسماء المتغيرات هنا تطابق تماماً ما في ملف .env
const dbConfig = {
  host: process.env.MYSQL_HOST,      
  port: parseInt(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,      
  password: process.env.MYSQL_PASSWORD, 
  database: process.env.MYSQL_DB,    
  dateStrings: ['DATE'],
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

const pool = mysql.createPool(dbConfig);

async function query(sql, params = [], type = 'fetchall') {
  try {
    if (typeof params === 'string' && type === 'fetchall') {
      type = params;
      params = [];
    }
    if (params == null) {
      params = [];
    }
    if (!Array.isArray(params)) {
      params = [params];
    }

    const [rows] = await pool.execute(sql, params);
    
    if (type === 'fetchone') {
      return rows.length > 0 ? rows[0] : null;
    } else if (type === 'commit') {
      return rows; // سيعيد معلومات مثل affectedRows و insertId
    } else {
      return rows; // fetchall
    }
  } catch (error) {
    console.error('DB Error:', error.message, 'SQL:', sql, 'PARAMS:', params);
    throw error;
  }
}

module.exports = { query };
