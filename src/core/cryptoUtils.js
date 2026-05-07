/**
 * File: src/core/cryptoUtils.js
 * Description: Encryption/Decryption for Salaries (Supports Negative Numbers)
 */
const crypto = require('crypto');

// Secret Key - Must be consistent across the app
const SECRET_KEY = process.env.SALARY_SECRET_KEY || 'a_very_secure_secret_key_for_salaries_32chars!';
const IV_LENGTH = 16;

function getKey() {
    return Buffer.from(SECRET_KEY.padEnd(32, '0').slice(0, 32));
}

/**
 * Encrypts a number (positive or negative) or string
 * @param {number|string} text 
 * @returns {string} Hexadecimal encrypted string with IV
 */
function encrypt(text) {
    // Handle null/undefined/empty
    if (text === null || text === undefined || text === '') return null;
    
    // Convert to string explicitly to handle negative signs correctly
    const textToStr = String(text);
    
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(getKey()), iv);
        
        // Update with UTF8 string (handles '-' sign correctly)
        let encrypted = cipher.update(textToStr, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Return IV:EncryptedHex
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error("Encryption Error:", error.message);
        return null;
    }
}

/**
 * Decrypts an encrypted string back to its original value (number or string)
 * @param {string} text 
 * @returns {number|string|null} Original value
 */
function decrypt(text) {
    // Handle null/undefined
    if (text === null || text === undefined) return null;
    
    // If it's already a number (legacy data), return as is
    if (typeof text === 'number') return text;
    
    // If it's not a string, return null
    if (typeof text !== 'string') {
        return null;
    }

    // Check if it looks like an encrypted value (must contain ':')
    if (!text.includes(':')) {
        // It might be plain text or a number stored as string (e.g., "-400")
        const num = parseFloat(text);
        // If it's a valid number (including negative), return it
        if (!isNaN(num) && isFinite(num)) {
            return num;
        }
        // Otherwise return the original string (if it was text)
        return text;
    }

    try {
        let textParts = text.split(':');
        if (textParts.length !== 2) {
            return null;
        }
        
        let iv = Buffer.from(textParts[0], 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(getKey()), iv);
        
        let decrypted = decipher.update(textParts[1], 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        // Try to parse as number (handles negative numbers correctly)
        const num = parseFloat(decrypted);
        
        // If it's a valid number, return it as Number type
        if (!isNaN(num) && isFinite(num)) {
            return num;
        }
        
        // If it's not a number (e.g., text), return the decrypted string
        return decrypted;
        
    } catch (error) {
        console.error("Decryption Error for text:", text, "Error:", error.message);
        return null;
    }
}

module.exports = {
    encrypt,
    decrypt
};