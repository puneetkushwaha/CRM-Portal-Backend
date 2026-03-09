const express = require('express');
const router = express.Router();
const hr = require('../controllers/hrController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { writeLimiter, searchLimiter, reportLimiter } = require('../utils/rateLimiter');

router.use(protect);
router.use(authorize('HR', 'ADMIN'));

// Dashboard
router.get('/dashboard', hr.getDashboard);
router.get('/dashboard/activity', hr.getRecentActivity);

// Attendance
router.get('/attendance/employees', hr.getEmployeesForAttendance);
router.post('/attendance/save', writeLimiter, hr.saveAttendance);
router.get('/attendance', searchLimiter, hr.getAttendanceRecords);
router.put('/attendance/:id', writeLimiter, hr.updateAttendanceRecord);

// Employees
router.get('/employees', searchLimiter, hr.getEmployees);
router.get('/employees/:id', hr.getEmployeeDetails);

// Leaves
router.get('/leaves', searchLimiter, hr.getLeaveRequests);
router.put('/leaves/:id/review', writeLimiter, hr.reviewLeave);

// Interns
router.get('/interns', searchLimiter, hr.getInterns);
router.get('/interns/:userId', hr.getInternDetails);
router.post('/interns/:userId/assign-task', writeLimiter, hr.assignTask);

// Reports
router.get('/reports/:type', reportLimiter, hr.getReport);
router.post('/reports/:type/export', reportLimiter, hr.exportReport);

// Profile
router.get('/profile', hr.getMyProfile);
router.put('/profile', writeLimiter, hr.updateMyProfile);
router.put('/profile/password', writeLimiter, hr.changePassword);

module.exports = router;