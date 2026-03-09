/**
 * Database Optimization Utilities
 * Query optimization, indexing helpers, and performance monitoring
 */

const mongoose = require('mongoose');

class DatabaseOptimization {
    constructor() {
        this.queryMetrics = {
            totalQueries: 0,
            slowQueries: 0,
            failedQueries: 0,
        };
        this.slowQueryThreshold = 100; // milliseconds
    }

    /**
     * Wrap query with performance monitoring
     */
    async executeOptimizedQuery(query, label = 'Query') {
        const startTime = Date.now();
        try {
            const result = await query;
            const duration = Date.now() - startTime;
            
            this.queryMetrics.totalQueries++;
            
            if (duration > this.slowQueryThreshold) {
                this.queryMetrics.slowQueries++;
                console.warn(`⚠️ [${label}] Slow query detected: ${duration}ms`);
            }
            
            return result;
        } catch (error) {
            this.queryMetrics.failedQueries++;
            console.error(`❌ [${label}] Query failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create optimized pagination query
     */
    createPaginatedQuery(query, page, limit, sort = { createdAt: -1 }) {
        const skip = (page - 1) * limit;
        return query
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .lean(); // Return plain JS objects instead of Mongoose documents (faster)
    }

    /**
     * Build efficient search query with index usage
     */
    buildSearchQuery(searchTerm, fields = []) {
        if (!searchTerm) return {};
        
        const escapedTerm = this.escapeRegex(searchTerm);
        return {
            $or: fields.map(field => ({
                [field]: { $regex: escapedTerm, $options: 'i' }
            }))
        };
    }

    /**
     * Escape regex special characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Batch insert with error handling
     */
    async batchInsert(Model, documents, batchSize = 1000) {
        const results = {
            inserted: 0,
            failed: 0,
            errors: []
        };

        try {
            for (let i = 0; i < documents.length; i += batchSize) {
                const batch = documents.slice(i, i + batchSize);
                try {
                    const created = await Model.insertMany(batch, { ordered: false });
                    results.inserted += created.length;
                } catch (error) {
                    // Continue with other batches even if one fails
                    results.failed += batch.length;
                    results.errors.push(error.message);
                }
            }
        } catch (error) {
            console.error(`❌ Batch insert failed: ${error.message}`);
            throw error;
        }

        return results;
    }

    /**
     * Batch update with transactions for consistency
     */
    async batchUpdate(Model, updates) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let updateCount = 0;
            for (const { filter, update } of updates) {
                const result = await Model.updateMany(filter, update, { session });
                updateCount += result.modifiedCount;
            }
            
            await session.commitTransaction();
            return { success: true, updated: updateCount };
        } catch (error) {
            await session.abortTransaction();
            console.error(`❌ Batch update failed: ${error.message}`);
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Select only required fields to reduce data transfer
     */
    selectFields(query, fields = []) {
        if (!fields.length) return query;
        return query.select(fields.join(' '));
    }

    /**
     * Add automatic indexes to model
     */
    static createOptimalIndexes(Model, indexes = []) {
        indexes.forEach(indexConfig => {
            const { fields, options = {} } = indexConfig;
            Model.collection.createIndex(fields, options);
        });
    }

    /**
     * Get query execution stats
     */
    getMetrics() {
        return {
            ...this.queryMetrics,
            avgSlowQueryPercentage: this.queryMetrics.totalQueries > 0
                ? ((this.queryMetrics.slowQueries / this.queryMetrics.totalQueries) * 100).toFixed(2) + '%'
                : '0%',
            failureRate: this.queryMetrics.totalQueries > 0
                ? ((this.queryMetrics.failedQueries / this.queryMetrics.totalQueries) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.queryMetrics = {
            totalQueries: 0,
            slowQueries: 0,
            failedQueries: 0,
        };
    }

    /**
     * Check database connection status
     */
    static getConnectionStats() {
        const conn = mongoose.connection;
        return {
            readyState: conn.readyState, // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
            readyStateString: ['disconnected', 'connected', 'connecting', 'disconnecting'][conn.readyState],
            collections: conn.collections ? Object.keys(conn.collections).length : 0,
            models: conn.models ? Object.keys(conn.models).length : 0,
            host: conn.host,
            port: conn.port,
            name: conn.name,
        };
    }

    /**
     * Validate and format query projection
     */
    static getProjection(fields) {
        if (!fields || !fields.length) return {};
        return fields.reduce((proj, field) => {
            proj[field] = 1;
            return proj;
        }, {});
    }
}

// Create singleton instance
const dbOptimization = new DatabaseOptimization();

module.exports = {
    dbOptimization,
    executeOptimizedQuery: (query, label) => dbOptimization.executeOptimizedQuery(query, label),
    createPaginatedQuery: (query, page, limit, sort) => dbOptimization.createPaginatedQuery(query, page, limit, sort),
    buildSearchQuery: (term, fields) => dbOptimization.buildSearchQuery(term, fields),
    batchInsert: (Model, docs, size) => dbOptimization.batchInsert(Model, docs, size),
    batchUpdate: (Model, updates) => dbOptimization.batchUpdate(Model, updates),
    selectFields: (query, fields) => dbOptimization.selectFields(query, fields),
    getMetrics: () => dbOptimization.getMetrics(),
    resetMetrics: () => dbOptimization.resetMetrics(),
    createOptimalIndexes: DatabaseOptimization.createOptimalIndexes,
    getConnectionStats: DatabaseOptimization.getConnectionStats,
    getProjection: DatabaseOptimization.getProjection,
};