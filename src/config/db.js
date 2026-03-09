/**
 * Database Configuration with Performance Optimization
 * Handles MongoDB connection with connection pooling, retry logic, and monitoring
 */

const mongoose = require('mongoose');

// Configuration constants
const DB_CONFIG = {
    // Connection pooling
    maxPoolSize: 20,              // Increase pool size for better concurrent handling
    minPoolSize: 5,               // Maintain minimum connections
    
    // Timeouts
    serverSelectionTimeoutMS: 10000,  // Increase from 5s to handle network delays
    socketTimeoutMS: 60000,            // 60s for socket timeout
    connectTimeoutMS: 10000,           // Connection timeout
    
    // Connection behavior
    retryWrites: true,            // Enable write retry for transient failures
    w: 'majority',                // Wait for majority replica acknowledgment
    family: 4,                     // Force IPv4 (avoid IPv6 issues)
    
    // Performance optimization
    maxIdleTimeMS: 45000,         // Close idle connections after 45s
    waitQueueTimeoutMS: 10000,    // Max time to wait for connection from pool
};

// Connection retry configuration
const RETRY_CONFIG = {
    maxRetries: 5,
    retryDelayMs: 5000,
    backoffMultiplier: 1.5,
};

class DatabaseConnection {
    constructor() {
        this.connectionAttempts = 0;
        this.isConnected = false;
        this.connectionStats = {
            connects: 0,
            disconnects: 0,
            errors: 0,
            reconnects: 0,
        };
    }

    /**
     * Establish database connection with exponential backoff retry logic
     */
    async connect() {
        try {
            console.log('🔄 Attempting to connect to MongoDB...');
            
            const conn = await mongoose.connect(process.env.MONGO_URI, DB_CONFIG);
            
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.connectionStats.connects++;
            
            // Log connection details
            console.log(`✅ MongoDB Connected: ${conn.connection.host}:${conn.connection.port}`);
            console.log(`📊 Database: ${conn.connection.name}`);
            console.log(`🔗 Connection Pool: ${DB_CONFIG.minPoolSize}-${DB_CONFIG.maxPoolSize}`);
            
            // Setup event handlers
            this.setupConnectionEventHandlers();
            
            // Setup performance monitoring
            this.setupPerformanceMonitoring();
            
            return conn;
        } catch (error) {
            this.connectionStats.errors++;
            console.error(`❌ MongoDB Connection Failed: ${error.message}`);
            
            // Implement exponential backoff retry
            return this.retryConnect();
        }
    }

    /**
     * Retry connection with exponential backoff
     */
    async retryConnect() {
        if (this.connectionAttempts >= RETRY_CONFIG.maxRetries) {
            console.error('❌ Max connection retries exceeded. Exiting...');
            process.exit(1);
        }

        this.connectionAttempts++;
        const delay = RETRY_CONFIG.retryDelayMs * 
                     Math.pow(RETRY_CONFIG.backoffMultiplier, this.connectionAttempts - 1);
        
        console.log(`⏳ Retry attempt ${this.connectionAttempts}/${RETRY_CONFIG.maxRetries} in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
    }

    /**
     * Setup connection event handlers for monitoring
     */
    setupConnectionEventHandlers() {
        const conn = mongoose.connection;

        // Error handler
        conn.on('error', (err) => {
            this.connectionStats.errors++;
            console.error(`❌ MongoDB Connection Error: ${err.message}`);
            this.isConnected = false;
        });

        // Disconnected handler
        conn.on('disconnected', () => {
            this.connectionStats.disconnects++;
            this.isConnected = false;
            console.warn('⚠️ MongoDB disconnected. Waiting for reconnection...');
        });

        // Reconnected handler
        conn.on('reconnected', () => {
            this.connectionStats.reconnects++;
            this.isConnected = true;
            console.log('✅ MongoDB reconnected successfully');
        });

        // Open handler
        conn.on('open', () => {
            console.log('✅ MongoDB connection opened');
        });

        // Close handler
        conn.on('close', () => {
            console.log('🔌 MongoDB connection closed');
            this.isConnected = false;
        });
    }

    /**
     * Setup performance monitoring for database operations
     */
    setupPerformanceMonitoring() {
        const conn = mongoose.connection;

        // Monitor query performance
        conn.on('open', () => {
            // Set up Mongoose profiling for slow queries (>100ms) - skip for MongoDB Atlas
            conn.set('logs', console.log);
            
            // Only set profiling level for local MongoDB instances
            if (process.env.MONGO_URI && !process.env.MONGO_URI.includes('mongodb+srv')) {
                mongoose.connection.db.setProfilingLevel('slow_only', (err) => {
                    if (!err) {
                        console.log('📊 Query profiling enabled for slow operations');
                    }
                });
            }
        });
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            ...this.connectionStats,
            isConnected: this.isConnected,
            connectionTime: mongoose.connection.readyState === 1 ? new Date() : null,
            poolStats: {
                maxPoolSize: DB_CONFIG.maxPoolSize,
                minPoolSize: DB_CONFIG.minPoolSize,
            }
        };
    }

    /**
     * Graceful shutdown with proper cleanup
     */
    async disconnect() {
        try {
            if (this.isConnected) {
                console.log('🛑 Closing MongoDB connection gracefully...');
                await mongoose.connection.close(false);
                this.isConnected = false;
                console.log('✅ MongoDB connection closed');
            }
        } catch (error) {
            console.error(`❌ Error closing MongoDB connection: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Check if connection is healthy
     */
    isHealthy() {
        return this.isConnected && mongoose.connection.readyState === 1;
    }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

module.exports = {
    connect: () => dbConnection.connect(),
    disconnect: () => dbConnection.disconnect(),
    getStats: () => dbConnection.getStats(),
    isHealthy: () => dbConnection.isHealthy(),
    dbConnection,
};