/**
 * File: src/core/utils.js
 * Description: Utility functions for password hashing and verification
 */
const crypto = require('crypto');

/**
 * Hash a password using SHA-256
 * @param {string} password 
 * @returns {string} Hexadecimal hash
 */
function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify a password against a stored hash
 * @param {string} password 
 * @param {string} hash 
 * @returns {boolean} True if match, false otherwise
 */
function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
  return hashedInput === hash;
}

/**
 * Normalize employee codes to the same comparable string format used across services.
 * Keeps digits intact while trimming spaces and removing a trailing .0 from Excel-style values.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function cleanCode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\.0$/, '');
}

module.exports = {
  hashPassword,
  verifyPassword,
  cleanCode
};
