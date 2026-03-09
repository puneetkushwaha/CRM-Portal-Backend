/**
 * Authentication Controller
 * Handles admin registration and dual login (Admin & Employee)
 */

const User = require('../models/User');
const Company = require('../models/Company');
const { ROLES } = require('../models/User');
const { validationResult, body } = require('express-validator');
const { escapeRegex, sanitizeEmail } = require('../utils/securityUtils');

/**
 * Validation rules for admin registration
 */
const registerValidation = [
    body('companyName')
        .trim()
        .notEmpty().withMessage('Company name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
    body('fullName')
        .trim()
        .notEmpty().withMessage('Admin full name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('mobile')
        .trim()
        .notEmpty().withMessage('Mobile number is required')
        .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/).withMessage('Invalid mobile number'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
    body('officeAddress')
        .trim()
        .notEmpty().withMessage('Office address is required'),
    body('timezone')
        .trim()
        .notEmpty().withMessage('Timezone is required'),
    body('workingHoursStart')
        .trim()
        .notEmpty().withMessage('Working hours start time is required'),
    body('workingHoursEnd')
        .trim()
        .notEmpty().withMessage('Working hours end time is required')
];

/**
 * Validation rules for login
 */
const loginValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
];

/**
 * @desc    Register new Admin with Company
 * @route   POST /api/auth/register
 * @access  Public (Admin registration only)
 */
const registerAdmin = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ Registration Validation Failed:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    field: err.path,
                    message: err.msg
                }))
            });
        }

        const {
            companyName,
            fullName,
            email,
            mobile,
            password,
            officeAddress,
            latitude,
            longitude,
            timezone,
            workingHoursStart,
            workingHoursEnd
        } = req.body;

        // Check if email already exists
        // SECURITY FIX: Always normalize email input before querying
        const normalizedEmail = sanitizeEmail(email);
        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email already exists'
            });
        }

        // Check if company name already exists
        // SECURITY FIX: Escape user input before using in regex to prevent NoSQL injection
        const escapedCompanyName = escapeRegex(companyName);
        const existingCompany = await Company.findOne({
            companyName: { $regex: new RegExp(`^${escapedCompanyName}$`, 'i') }
        });
        if (existingCompany) {
            return res.status(400).json({
                success: false,
                message: 'A company with this name already exists'
            });
        }

        // Handle logo upload
        let companyLogo = null;
        if (req.file) {
            companyLogo = req.file.filename;
        }

        // Create company first
        const company = await Company.create({
            companyName: companyName.trim(),
            companyLogo,
            officeLocation: {
                address: officeAddress.trim(),
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null
            },
            timezone,
            workingHours: {
                start: workingHoursStart,
                end: workingHoursEnd
            }
        });

        // Create admin user (role is forced to ADMIN - cannot be changed)
        const adminUser = await User.create({
            fullName: fullName.trim(),
            email: email.toLowerCase(),
            mobile,
            password, // Will be hashed by pre-save middleware
            role: ROLES.ADMIN, // FORCED TO ADMIN - This is the key security feature
            companyId: company._id,
            isActive: true
        });

        // Generate JWT token
        const token = adminUser.generateAuthToken();

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Admin registration successful! Welcome to the platform.',
            data: {
                token,
                user: {
                    id: adminUser._id,
                    fullName: adminUser.fullName,
                    email: adminUser.email,
                    role: adminUser.role,
                    isActive: adminUser.isActive
                },
                company: {
                    id: company._id,
                    name: company.companyName,
                    logo: company.logoUrl,
                    timezone: company.timezone
                }
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);

        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `This ${field} is already registered`
            });
        }

        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Admin Login
 * @route   POST /api/auth/admin/login
 * @access  Public
 */
const adminLogin = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    field: err.path,
                    message: err.msg
                }))
            });
        }

        const { email, password } = req.body;

        // SECURITY FIX: Sanitize and validate email input before database query
        const normalizedEmail = sanitizeEmail(email);
        if (!normalizedEmail) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Find user by email and include password for comparison
        const user = await User.findOne({ email: normalizedEmail })
            .select('+password')
            .populate('companyId', 'companyName companyLogo isActive timezone');

        // Check if user exists
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Verify this is an admin account
        if (user.role !== ROLES.ADMIN) {
            return res.status(403).json({
                success: false,
                message: 'This login is for administrators only. Please use Employee Login.'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your account has been deactivated. Contact support.'
            });
        }

        // Check if company is active
        if (!user.companyId || !user.companyId.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your company account is inactive. Contact support.'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        // Generate token
        const token = user.generateAuthToken();

        res.status(200).json({
            success: true,
            message: 'Admin login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin
                },
                company: {
                    id: user.companyId._id,
                    name: user.companyId.companyName,
                    logo: user.companyId.companyLogo,
                    timezone: user.companyId.timezone
                },
                redirectTo: '/admin/dashboard'
            }
        });

    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Employee Login (HR, Manager, Employee, Intern)
 * @route   POST /api/auth/employee/login
 * @access  Public
 */
const employeeLogin = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    field: err.path,
                    message: err.msg
                }))
            });
        }

        const { email, password } = req.body;

        // Allowed roles for employee login
        const allowedRoles = [ROLES.EMPLOYEE, ROLES.HR, ROLES.MANAGER, ROLES.INTERN];

        // SECURITY FIX: Sanitize and validate email input before database query
        const normalizedEmail = sanitizeEmail(email);
        if (!normalizedEmail) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password. Please contact your admin if you need access.'
            });
        }

        // Find user by email
        const user = await User.findOne({ email: normalizedEmail })
            .select('+password')
            .populate('companyId', 'companyName companyLogo isActive timezone workingHours');

        // Check if user exists
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password. Please contact your admin if you need access.'
            });
        }

        // Check if user has an employee role (not admin)
        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: 'This login is for employees only. Admins should use Admin Login.'
            });
        }

        // Check if user belongs to a company
        if (!user.companyId) {
            return res.status(401).json({
                success: false,
                message: 'Your account is not associated with any company. Contact your administrator.'
            });
        }

        // Check if company is active
        if (!user.companyId.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your company account is inactive. Contact your administrator.'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your account has been deactivated. Contact your administrator.'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        // Generate token
        const token = user.generateAuthToken();

        // Determine redirect based on role
        let redirectTo;
        switch (user.role) {
            case ROLES.HR:
                redirectTo = '/hr/dashboard';
                break;
            case ROLES.MANAGER:
                redirectTo = '/manager/dashboard';
                break;
            case ROLES.INTERN:
                redirectTo = '/intern/dashboard';
                break;
            default:
                redirectTo = '/employee/dashboard';
        }

        res.status(200).json({
            success: true,
            message: `Welcome back, ${user.fullName}!`,
            data: {
                token,
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    designation: user.designation,
                    lastLogin: user.lastLogin
                },
                company: {
                    id: user.companyId._id,
                    name: user.companyId.companyName,
                    workingHours: user.companyId.workingHours,
                    timezone: user.companyId.timezone
                },
                redirectTo
            }
        });

    } catch (error) {
        console.error('Employee Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('companyId', 'companyName companyLogo timezone workingHours');

        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    mobile: user.mobile,
                    role: user.role,
                    department: user.department,
                    designation: user.designation,
                    profilePicture: user.profilePicture,
                    isActive: user.isActive,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt
                },
                company: user.companyId
            }
        });
    } catch (error) {
        console.error('Get Me Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user data'
        });
    }
};

/**
 * @desc    Logout user (client-side token removal, server-side logging)
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
    try {
        // In a production app, you might want to blacklist the token
        // For now, we just send a success response
        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
};

module.exports = {
    registerAdmin,
    adminLogin,
    employeeLogin,
    getMe,
    logout,
    registerValidation,
    loginValidation
};