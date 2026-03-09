const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { writeLimiter } = require('../utils/rateLimiter');

const {
    getMyNotifications,
    markAsRead,
    markAllAsRead
} = require('../controllers/notificationController');

router.use(protect); // All routes require authentication

router.get('/', getMyNotifications);
router.put('/:id/read', writeLimiter, markAsRead);
router.put('/mark-all-read', writeLimiter, markAllAsRead);

module.exports = router;
