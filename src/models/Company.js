/**
 * Company Model
 * Stores company information for multi-tenant architecture
 */

const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    // Company name - must be unique across the platform
    companyName: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true,
        minlength: [2, 'Company name must be at least 2 characters'],
        maxlength: [100, 'Company name cannot exceed 100 characters']
    },

    // Company logo - stored as file path
    companyLogo: {
        type: String,
        default: null
    },

    // Office location with address and optional coordinates
    officeLocation: {
        address: {
            type: String,
            required: [true, 'Office address is required'],
            trim: true
        },
        latitude: {
            type: Number,
            default: null,
            min: [-90, 'Latitude must be between -90 and 90'],
            max: [90, 'Latitude must be between -90 and 90']
        },
        longitude: {
            type: Number,
            default: null,
            min: [-180, 'Longitude must be between -180 and 180'],
            max: [180, 'Longitude must be between -180 and 180']
        }
    },

    // Timezone for the company (e.g., 'Asia/Kolkata', 'America/New_York')
    timezone: {
        type: String,
        required: [true, 'Timezone is required'],
        default: 'UTC'
    },

    // Working hours configuration
    workingHours: {
        start: {
            type: String,
            required: [true, 'Start time is required'],
            default: '09:00'
        },
        end: {
            type: String,
            required: [true, 'End time is required'],
            default: '18:00'
        }
    },

    // Company status
    isActive: {
        type: Boolean,
        default: true
    },

    // Subscription/Plan info (for future SaaS features)
    subscription: {
        plan: {
            type: String,
            enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
            default: 'FREE'
        },
        expiresAt: {
            type: Date,
            default: null
        }
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for getting full logo URL
companySchema.virtual('logoUrl').get(function() {
    if (this.companyLogo) {
        return `/uploads/${this.companyLogo}`;
    }
    return null;
});

// Index for faster queries
companySchema.index({ companyName: 1 });
companySchema.index({ isActive: 1 });

module.exports = mongoose.model('Company', companySchema);