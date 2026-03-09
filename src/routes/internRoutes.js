/**
 * Intern Routes
 * Routes for intern-specific operations
 */

const express = require('express');
const router = express.Router();
const internController = require('../controllers/internController');

// Import auth middleware
const { protect, authorize } = require('../middleware/authMiddleware');
const { writeLimiter, reportLimiter } = require('../utils/rateLimiter');

// Apply protection to all routes
router.use(protect);
router.use(authorize('INTERN'));

// Profile routes
router.get('/profile', internController.getInternProfile);
router.put('/profile', writeLimiter, internController.updateInternProfile);

// Task routes
router.get('/tasks', internController.getTaskHistory);
router.post('/tasks', writeLimiter, internController.submitDailyTask);
router.get('/assigned-tasks', internController.getAssignedTasks);
router.patch('/assigned-tasks/:taskId', writeLimiter, internController.updateAssignedTaskStatus);

// Report routes
router.post('/reports', reportLimiter, internController.submitWeeklyReport);

module.exports = router;
