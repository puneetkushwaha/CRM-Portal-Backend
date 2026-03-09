/**
 * Main Server Entry Point
 * Employee Management & CRM Portal - Backend API
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http'); // Import HTTP
const socketIo = require('socket.io'); // Import Socket.io
require('dotenv').config();
// Add this with your other route imports (around line 20-25)
const crmRoutes = require('./routes/crmRoutes');

// Import database connection and optimization
const { connect: connectDB, disconnect: disconnectDB, getStats: getDBStats, isHealthy: isDBHealthy } = require('./config/db');
const { getMetrics: getQueryMetrics, resetMetrics: resetQueryMetrics } = require('./utils/dbOptimization');

// Import rate limiting
const { globalLimiter, applyRoleBasedLimiter } = require('./utils/rateLimiter');

// Import routes

const hrRoutes = require('./routes/hrRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const internRoutes = require('./routes/internRoutes');
const attendanceRoutes = require('./routes/attendance.routes');
const notificationRoutes = require('./routes/notificationRoutes');



// Initialize express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        credentials: true
    }
});

// Make io accessible globally or pass it to routes
app.set('io', io);
global.io = io;

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined their room`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Connect to MongoDB
connectDB();

// ==================== MIDDLEWARE ====================

// Enable CORS for frontend
const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ["http://localhost:5173"];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            return callback(null, true);
        } else {
            // For development, be lenient if needed, or strictly enforce production
            // callback(new Error('Not allowed by CORS'), false);
            return callback(null, true); // Temporary Dev Fix if needed
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add this with your other app.use routes
// CRM Routes
app.use('/api/crm', crmRoutes);

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`📨 ${req.method} ${req.path}`);
        next();
    });
}

// ==================== ROUTES ====================

// Apply global rate limiting to all API routes
app.use('/api', globalLimiter);
app.use('/api', applyRoleBasedLimiter);

// API Routes
app.use('/api/auth', authRoutes);
// Admin Routes
app.use('/api/admin', adminRoutes);
// Intern Routes
app.use('/api/intern', internRoutes);
// Attendance Routes (User side)
app.use('/api/attendance', attendanceRoutes);
// Notification Routes
app.use('/api/notifications', notificationRoutes);
// HR Routes
app.use('/api/hr', hrRoutes);
// User Routes
app.use('/api/users', userRoutes);

app.use('/api/users', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Employee Management & CRM Portal API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            health: '/api/auth/health'
        }
    });
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: messages
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(400).json({
            success: false,
            message: `Duplicate value for ${field}`
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Mongoose cast error (invalid ID)
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid resource ID: ${err.value}`
        });
    }

    // Default error
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 9999;

// Initialize server with database connection
async function initializeServer() {
    try {
        // Connect to database
        await connectDB();
        
        // Start server
        server.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('✅ All systems operational\n');
        });
    } catch (error) {
        console.error('❌ Failed to initialize server:', error.message);
        process.exit(1);
    }
}

// Start the server
initializeServer();

// Health check endpoint
app.get('/health', (req, res) => {
    const stats = getDBStats();
    const queryMetrics = getQueryMetrics();
    
    res.json({
        status: isDBHealthy() ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            connected: stats.isConnected,
            stats: stats
        },
        query: queryMetrics,
        memory: process.memoryUsage()
    });
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
    console.log(`\n⚠️ ${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
        try {
            // Close database connection
            const { disconnect } = require('./config/db');
            await disconnect();
            
            console.log('✅ Graceful shutdown complete');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
        }
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    // process.exit(1); // Optional: keep running or restart
});

module.exports = app;