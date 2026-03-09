/**
 * Security Utilities
 * Provides security-focused helper functions to prevent injection attacks
 * and sanitize user input for database queries
 */

/**
 * Escapes special regex characters in a string to prevent NoSQL injection
 * This sanitizes user input before using it in MongoDB $regex queries
 * 
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for use in regex patterns
 * 
 * @example
 * // Instead of: { fullName: { $regex: userInput, $options: 'i' } }
 * // Use:       { fullName: { $regex: escapeRegex(userInput), $options: 'i' } }
 */
const escapeRegex = (str) => {
    if (typeof str !== 'string') {
        return '';
    }
    // Escape all special regex metacharacters
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Validates and sanitizes email input
 * Prevents email-based injection attacks
 * 
 * @param {string} email - The email to validate
 * @returns {string|null} - Normalized email or null if invalid
 */
const sanitizeEmail = (email) => {
    if (typeof email !== 'string') {
        return null;
    }
    // Basic email validation and normalization
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalized = email.trim().toLowerCase();
    
    if (!emailRegex.test(normalized)) {
        return null;
    }
    
    return normalized;
};

/**
 * Validates and sanitizes string input for search operations
 * Ensures maximum length and removes suspicious characters
 * 
 * @param {string} input - The input string to validate
 * @param {number} maxLength - Maximum allowed length (default: 100)
 * @returns {string|null} - Sanitized string or null if invalid
 */
const sanitizeSearchInput = (input, maxLength = 100) => {
    if (typeof input !== 'string') {
        return null;
    }
    
    const trimmed = input.trim();
    
    // Check length
    if (trimmed.length === 0 || trimmed.length > maxLength) {
        return null;
    }
    
    // Allow alphanumeric, spaces, hyphens, underscores, dots
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(trimmed)) {
        return null;
    }
    
    return trimmed;
};

/**
 * Creates a safe regex query object for MongoDB
 * Prevents NoSQL injection by escaping user input before regex creation
 * 
 * @param {string} input - The user input to search for
 * @param {string} options - Regex options (e.g., 'i' for case-insensitive)
 * @returns {Object} - A safe MongoDB regex query object
 */
const createSafeRegexQuery = (input, options = 'i') => {
    const escaped = escapeRegex(input);
    return {
        $regex: escaped,
        $options: options
    };
};

/**
 * Validates pagination parameters
 * Prevents invalid skip/limit values
 * 
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Object} - Safe { page, limit, skip } values
 */
const validatePaginationParams = (page = 1, limit = 20) => {
    let p = parseInt(page, 10);
    let l = parseInt(limit, 10);
    
    // Ensure valid numbers
    if (isNaN(p) || p < 1) p = 1;
    if (isNaN(l) || l < 1 || l > 100) l = 20;
    
    return {
        page: p,
        limit: l,
        skip: (p - 1) * l
    };
};

/**
 * Sanitizes and validates ObjectId input
 * Prevents invalid MongoDB ObjectId usage
 * 
 * @param {string} id - The ID string to validate
 * @returns {boolean} - True if valid MongoDB ObjectId format, false otherwise
 */
const isValidObjectId = (id) => {
    if (typeof id !== 'string') {
        return false;
    }
    // MongoDB ObjectId is a 24-character hex string
    return /^[0-9a-fA-F]{24}$/.test(id);
};

module.exports = {
    escapeRegex,
    sanitizeEmail,
    sanitizeSearchInput,
    createSafeRegexQuery,
    validatePaginationParams,
    isValidObjectId
};
