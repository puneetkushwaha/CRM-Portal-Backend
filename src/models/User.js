/**
 * User Model
 * Handles all user types: ADMIN, HR, MANAGER, EMPLOYEE, INTERN
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Define allowed roles as constants for consistency
const ROLES = {
    ADMIN: 'ADMIN',
    HR: 'HR',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE',
    INTERN: 'INTERN'
};

const userSchema = new mongoose.Schema({
    // User's full name
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },

    // Email - used as login ID, must be unique
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email address'
        ]
    },

    // Mobile number with validation
    mobile: {
        type: String,
        required: [true, 'Mobile number is required'],
        trim: true,
        match: [
            /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/,
            'Please provide a valid mobile number'
        ]
    },

    // Employee ID for organization tracking
    employeeId: {
        type: String,
        unique: true,
        sparse: true // Allow null for existing users not yet assigned
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // Don't include password in queries by default
    },

    // User role - determines access level
    role: {
        type: String,
        enum: {
            values: Object.values(ROLES),
            message: '{VALUE} is not a valid role'
        },
        default: ROLES.EMPLOYEE
    },

    // Reference to the company this user belongs to
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: [true, 'Company association is required']
    },

    // Account status
    isActive: {
        type: Boolean,
        default: true
    },

    // Last login tracking
    lastLogin: {
        type: Date,
        default: null
    },

    // Profile picture
    profilePicture: {
        type: String,
        default: null
    },

    // Department (optional, for organization)
    department: {
        type: String,
        trim: true,
        default: null
    },

    // Designation/Job Title
    designation: {
        type: String,
        trim: true,
        default: null
    },

    // Password reset token (for forgot password feature)
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // ==================== INTERN SPECIFIC FIELDS ====================
    internDetails: {
        internId: {
            type: String,
            unique: true,
            sparse: true // Allow null/undefined for non-interns
        },
        // Personal Details
        personal: {
            gender: { type: String, enum: ['Male', 'Female', 'Other'] },
            dob: { type: Date },
            photo: { type: String } // Path to passport size photo
        },
        // Academic Details
        education: {
            collegeName: { type: String },
            course: { type: String }, // BCA, BTech, MCA, etc.
            branch: { type: String }, // Branch/Specialization
            yearSemester: { type: String },
            collegeIdNumber: { type: String }
        },
        // Internship Details
        internship: {
            domain: { type: String }, // Web Dev, Cyber Security, etc.
            type: { type: String }, // Summer, Winter, 3 Months, etc.
            startDate: { type: Date },
            endDate: { type: Date },
            mode: { type: String, enum: ['Online', 'Offline', 'Hybrid'] },
            assignedBatch: { type: String },
            assignedMentor: { type: String },
            dailyWorkingHours: { type: Number }
        },
        // Progress Tracking
        academicWork: {
            dailyTaskUpdate: [{
                date: { type: Date, default: Date.now },
                task: { type: String },
                status: { type: String }
            }],
            attendanceStatus: { type: String },
            weeklyProgressReport: [{
                weekNumber: { type: Number },
                report: { type: String },
                submittedAt: { type: Date, default: Date.now }
            }],
            mentorFeedback: [{
                mentor: { type: String },
                feedback: { type: String },
                date: { type: Date, default: Date.now }
            }]
        },
        // Project Details
        projectWork: {
            finalProjectSubmitted: { type: Boolean, default: false },
            projectTitle: { type: String }
        },
        // Tasks assigned by Admin/Mentor
        assignedTasks: [{
            title: { type: String, required: true },
            description: { type: String },
            assignedDate: { type: Date, default: Date.now },
            dueDate: { type: Date },
            status: { type: String, enum: ['Pending', 'In Progress', 'Completed'], default: 'Pending' }
        }]
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    // Only hash if password is modified
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Generate salt and hash password
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate JWT token
userSchema.methods.generateAuthToken = function () {
    return jwt.sign(
        {
            id: this._id,
            email: this.email,
            role: this.role,
            companyId: this.companyId
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// Static method to check if email exists
userSchema.statics.emailExists = async function (email) {
    const user = await this.findOne({ email: email.toLowerCase() });
    return !!user;
};

// Virtual for checking if user is admin
userSchema.virtual('isAdmin').get(function () {
    return this.role === ROLES.ADMIN;
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ companyId: 1, role: 1 });
userSchema.index({ isActive: 1 });

// Export model and roles constant
module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;