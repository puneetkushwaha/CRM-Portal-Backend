/**
 * Attendance Routes
 * Routes for employee/intern attendance marking
 */

const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');

// Import middleware
const { protect, authorize } = require('../middleware/authMiddleware');
const { writeLimiter } = require('../utils/rateLimiter');

// All routes require authentication
router.use(protect);

// Check In - Employee & Intern (Strict rate limit to prevent duplicate check-ins)
router.post(
  '/check-in',
  writeLimiter,
  authorize('EMPLOYEE', 'INTERN'),
  attendanceController.checkIn
);

// Check Out - Employee & Intern (Strict rate limit)
router.post(
  '/check-out',
  writeLimiter,
  authorize('EMPLOYEE', 'INTERN'),
  attendanceController.checkOut
);

// Get My Attendance History
router.get(
  '/my-history',
  authorize('EMPLOYEE', 'INTERN'),
  attendanceController.getMyAttendanceHistory
);

// Request Correction
router.post(
  '/correction',
  writeLimiter,
  authorize('EMPLOYEE', 'INTERN'),
  attendanceController.requestCorrection
);

module.exports = router;