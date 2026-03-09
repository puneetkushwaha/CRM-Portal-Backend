/**
 * Admin Routes
 * All admin-related API endpoints
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { protect, authorize } = require('../middleware/authMiddleware');
const { writeLimiter, searchLimiter, exportLimiter, adminLimiter } = require('../utils/rateLimiter');

// Import controllers
const adminController = require('../controllers/adminController');
const attendanceController = require('../controllers/attendanceController');
const workReportController = require('../controllers/workReportController');
const exportController = require('../controllers/exportController');
const settingsController = require('../controllers/settingsController');
const geoController = require('../controllers/geoLocationController');

// All routes require authentication
router.use(protect);

// ==================== DASHBOARD ====================
router.get('/dashboard', authorize('ADMIN', 'HR'), adminController.getDashboardStats);

// ==================== USER MANAGEMENT ====================
router.get('/users', searchLimiter, authorize('ADMIN', 'HR'), adminController.getUsers);
router.post('/users', writeLimiter, authorize('ADMIN', 'HR'), adminController.createUser);
router.put('/users/:id', writeLimiter, authorize('ADMIN', 'HR'), adminController.updateUser);
router.patch('/users/:id/toggle-status', writeLimiter, authorize('ADMIN', 'HR'), adminController.toggleUserStatus);
router.delete('/users/:id', writeLimiter, authorize('ADMIN'), adminController.deleteUser);

// ==================== INTERN MANAGEMENT ====================
router.get('/interns/:userId', adminLimiter, authorize('ADMIN', 'HR', 'MANAGER'), adminController.getInternDetails);
router.put('/interns/:userId', writeLimiter, authorize('ADMIN', 'HR'), adminController.updateInternByAdmin);
router.post('/interns/:userId/assign-task', writeLimiter, authorize('ADMIN', 'HR', 'MANAGER'), adminController.assignTaskToIntern);

// ==================== ATTENDANCE ====================
router.get('/attendance', searchLimiter, authorize('ADMIN', 'HR'), attendanceController.getAttendance);
router.get('/attendance/summary', authorize('ADMIN', 'HR'), attendanceController.getAttendanceSummary);
router.get('/attendance/geo-logs', searchLimiter, authorize('ADMIN', 'HR'), attendanceController.getGeoLogs);
router.post('/attendance/manual', writeLimiter, authorize('ADMIN', 'HR'), attendanceController.createManualAttendance);
router.put('/attendance/:id', writeLimiter, authorize('ADMIN', 'HR'), attendanceController.updateAttendance);
router.delete('/attendance/:id', writeLimiter, authorize('ADMIN'), attendanceController.deleteAttendance);

// ==================== WORK REPORTS ====================
router.get('/reports', searchLimiter, authorize('ADMIN', 'HR', 'MANAGER'), workReportController.getWorkReports);
router.get('/reports/pending-count', authorize('ADMIN', 'HR', 'MANAGER'), workReportController.getPendingCount);
router.get('/reports/:id', authorize('ADMIN', 'HR', 'MANAGER'), workReportController.getWorkReportById);
router.put('/reports/:id/review', writeLimiter, authorize('ADMIN', 'HR', 'MANAGER'), workReportController.reviewWorkReport);
router.delete('/reports/:id', writeLimiter, authorize('ADMIN'), workReportController.deleteWorkReport);

// ==================== EXPORT ====================
router.post('/export', exportLimiter, authorize('ADMIN', 'HR'), exportController.exportData);

// ==================== SETTINGS ====================
router.get('/settings', authorize('ADMIN'), settingsController.getSettings);
router.put('/settings', writeLimiter, authorize('ADMIN'), settingsController.updateSettings);
router.get('/settings/holidays', authorize('ADMIN', 'HR'), settingsController.getHolidays);
router.post('/settings/holidays', writeLimiter, authorize('ADMIN'), settingsController.addHoliday);
router.delete('/settings/holidays/:date', writeLimiter, authorize('ADMIN'), settingsController.deleteHoliday);

// ==================== GEO-LOCATION LOGS ====================
router.get('/geo-logs', authorize('ADMIN', 'HR'), geoController.getGeoLogs);
router.get('/geo-logs/stats', authorize('ADMIN', 'HR'), geoController.getGeoStats);
router.get('/geo-logs/outside-office', authorize('ADMIN', 'HR'), geoController.getUsersOutsideOffice);
router.get('/geo-logs/user/:userId', authorize('ADMIN', 'HR'), geoController.getUserLocationHistory);
router.get('/geo-logs/:id', authorize('ADMIN', 'HR'), geoController.getGeoLogById);
router.post('/geo-logs/export', authorize('ADMIN', 'HR'), geoController.exportGeoLogs);
router.post('/geo-logs/verify-location', authorize('ADMIN', 'HR'), geoController.verifyLocation);

module.exports = router;