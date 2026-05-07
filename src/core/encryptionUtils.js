/**
 * File: src/core/encryptionUtils.js
 */
const crypto = require('crypto');
require('dotenv').config();

function getFernetKey() {
  const secret = process.env.SALARY_SECRET_KEY || 'default_secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSalary(v) {
  if (v === null || v === '') return '';
  const key = getFernetKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(parseFloat(v)), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decryptSalary(v) {
  try {
    if (!v) return 0.0;
    const parts = v.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encryptedText = parts[1];
    const key = getFernetKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return parseFloat(decrypted);
  } catch (e) {
    return 0.0;
  }
}

module.exports = {
  encryptSalary,
  decryptSalary
};