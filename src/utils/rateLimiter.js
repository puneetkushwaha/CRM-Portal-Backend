/**
 * Rate Limiting Middleware & Utilities
 * Provides advanced rate limiting capabilities with multiple strategies
 */

// In-memory store for rate limit tracking (use Redis in production)
const rateLimitStore = new Map();

/**
 * Cleans up expired rate limit records periodically
 * Prevents memory leaks from old entries
 */
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.startTime > 3600000) { // 1 hour
            rateLimitStore.delete(key);
        }
    }
}, 300000); // Run cleanup every 5 minutes

/**
 * Generic rate limiter middleware
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @param {string} keyGenerator - Function to generate unique key (default: IP)
 * @returns {Function} Express middleware
 */
const createRateLimiter = (maxRequests = 100, windowMs = 60000, keyGenerator = null) => {
    return (req, res, next) => {
        // Generate unique key for tracking
        let key;
        if (keyGenerator && typeof keyGenerator === 'function') {
            key = keyGenerator(req);
        } else if (req.user?.id) {
            // Authenticated users: use user ID
            key = `user:${req.user.id}`;
        } else {
            // Unauthenticated: use IP address
            key = `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
        }

        const now = Date.now();

        // Initialize if not exists
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, {
                count: 1,
                startTime: now,
                requests: [now]
            });
            return next();
        }

        const record = rateLimitStore.get(key);

        // Window has expired, reset
        if (now - record.startTime > windowMs) {
            rateLimitStore.set(key, {
                count: 1,
                startTime: now,
                requests: [now]
            });
            return next();
        }

        // Increment counter
        record.count++;
        record.requests.push(now);

        // Add rate limit headers
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
        res.set('X-RateLimit-Reset', new Date(record.startTime + windowMs).toISOString());

        // Check if exceeded
        if (record.count > maxRequests) {
            const retryAfter = Math.ceil((record.startTime + windowMs - now) / 1000);
            res.set('Retry-After', retryAfter);

            return res.status(429).json({
                success: false,
                message: 'Too many requests, please try again later',
                retryAfter,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    limit: maxRequests,
                    window: `${windowMs}ms`
                }
            });
        }

        next();
    };
};

/**
 * Strict rate limiter for login attempts (prevents brute force)
 * 5 requests per minute per IP/user
 */
const loginLimiter = createRateLimiter(100, 60000);

/**
 * Moderate rate limiter for registration
 * 3 requests per 15 minutes per IP
 */
const registerLimiter = createRateLimiter(100, 60000);

/**
 * API endpoint limiter for authenticated users
 * 100 requests per minute per user
 */
const apiLimiter = createRateLimiter(100, 60000);

/**
 * Stricter API limiter for write operations (POST, PUT, DELETE)
 * 50 requests per minute per user
 */
const writeLimiter = createRateLimiter(50, 60000);

/**
 * File upload limiter
 * 10 uploads per hour per user
 */
const uploadLimiter = createRateLimiter(10, 3600000);

/**
 * Export limiter (prevents bulk exports)
 * 5 exports per 10 minutes per user
 */
const exportLimiter = createRateLimiter(100, 600000);

/**
 * Search limiter (prevents database strain)
 * 30 searches per minute per user
 */
const searchLimiter = createRateLimiter(30, 60000);

/**
 * Report generation limiter
 * 20 reports per hour per user
 */
const reportLimiter = createRateLimiter(20, 3600000);

/**
 * Admin operations limiter (strictest)
 * 40 admin actions per 10 minutes
 */
const adminLimiter = createRateLimiter(100, 600000);

/**
 * Global API limiter with IP-based tracking
 * 500 requests per hour per IP
 */
const globalLimiter = createRateLimiter(500, 3600000, (req) => {
    return `ip:${req.ip || req.connection.remoteAddress}`;
});

/**
 * Cascade limiter - checks multiple limits
 * Returns the first middleware in the chain
 */
const cascadeLimiters = (...limiters) => {
    return (req, res, next) => {
        let index = 0;

        const callNext = (err) => {
            if (err) return next(err);
            if (index >= limiters.length) return next();

            const limiter = limiters[index++];
            limiter(req, res, callNext);
        };

        callNext();
    };
};

/**
 * Skip limiter for certain conditions
 * Useful for admin users or health checks
 */
const skipIf = (condition) => {
    return (req, res, next) => {
        if (typeof condition === 'function' && condition(req)) {
            return next();
        }
        next();
    };
};

/**
 * Role-based rate limiter
 * Different limits for different user roles
 */
const roleBasedLimiter = {
    ADMIN: createRateLimiter(200, 60000),      // 200 requests/minute
    HR: createRateLimiter(150, 60000),         // 150 requests/minute
    MANAGER: createRateLimiter(120, 60000),    // 120 requests/minute
    EMPLOYEE: createRateLimiter(100, 60000),   // 100 requests/minute
    INTERN: createRateLimiter(80, 60000)       // 80 requests/minute
};

/**
 * Apply role-based rate limiting
 */
const applyRoleBasedLimiter = (req, res, next) => {
    if (!req.user) {
        return apiLimiter(req, res, next);
    }

    const roleLimiter = roleBasedLimiter[req.user.role] || apiLimiter;
    roleLimiter(req, res, next);
};

/**
 * Get current rate limit status for a user/IP
 */
const getRateLimitStatus = (req) => {
    const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    const record = rateLimitStore.get(key);

    if (!record) {
        return {
            status: 'OK',
            requests: 0,
            windowStart: new Date(),
            windowEnd: null
        };
    }

    return {
        status: 'ACTIVE',
        requests: record.count,
        windowStart: new Date(record.startTime),
        windowEnd: new Date(record.startTime + 60000),
        requestList: record.requests.slice(-10) // Last 10 requests
    };
};

/**
 * Reset rate limit for a specific key (admin only)
 */
const resetRateLimit = (key) => {
    return rateLimitStore.delete(key);
};

/**
 * Clear all rate limit data (emergency only)
 */
const clearAllRateLimits = () => {
    rateLimitStore.clear();
    return true;
};

module.exports = {
    // Limiters
    createRateLimiter,
    loginLimiter,
    registerLimiter,
    apiLimiter,
    writeLimiter,
    uploadLimiter,
    exportLimiter,
    searchLimiter,
    reportLimiter,
    adminLimiter,
    globalLimiter,
    applyRoleBasedLimiter,

    // Utilities
    roleBasedLimiter,
    cascadeLimiters,
    skipIf,
    getRateLimitStatus,
    resetRateLimit,
    clearAllRateLimits,
    cleanupInterval
};
