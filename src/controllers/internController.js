/**
 * Intern Controller
 * Handles operations specific to interns
 */

// Intern model removed, using User model directly
const User = require('../models/User');

/**
 * @desc    Get current intern profile
 * @route   GET /api/intern/profile
 * @access  Private (Intern only)
 */
exports.getInternProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user || !user.internDetails) {
            return res.status(404).json({
                success: false,
                message: 'Intern profile not found'
            });
        }

        // Construct response to match previous structure
        const responseData = {
            ...user.internDetails, // This spreads properties (personal, education, _id of subdoc etc)
            userId: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                mobile: user.mobile,
                department: user.department,
                designation: user.designation,
                profilePicture: user.profilePicture
            }
        };

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('Get Intern Profile Error:', error);
        next(error);
    }
};

/**
 * @desc    Update intern profile
 * @route   PUT /api/intern/profile
 * @access  Private (Intern only)
 */
exports.updateInternProfile = async (req, res, next) => {
    try {
        const { personal, education } = req.body;

        // Interns can ONLY update Personal and Education details
        // Internship and Project Work are managed by Admin/HR

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Update fields if provided
        if (personal) user.internDetails.personal = { ...user.internDetails.personal, ...personal };
        if (education) user.internDetails.education = { ...user.internDetails.education, ...education };

        await user.save();

        const responseData = {
            ...user.internDetails,
            userId: user._id
        };

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: responseData
        });
    } catch (error) {
        console.error('Update Intern Profile Error:', error);
        next(error);
    }
};

/**
 * @desc    Submit daily task update
 * @route   POST /api/intern/tasks
 * @access  Private (Intern only)
 */
exports.submitDailyTask = async (req, res, next) => {
    try {
        const { task, status } = req.body;

        const user = await User.findById(req.user.id);

        if (!user || user.role !== 'INTERN') {
            return res.status(404).json({
                success: false,
                message: 'Intern profile not found'
            });
        }

        user.internDetails.academicWork.dailyTaskUpdate.push({
            task,
            status,
            date: new Date()
        });

        await user.save();

        const updates = user.internDetails.academicWork.dailyTaskUpdate;

        res.status(201).json({
            success: true,
            message: 'Task updated successfully',
            data: updates[updates.length - 1]
        });
    } catch (error) {
        console.error('Submit Task Error:', error);
        next(error);
    }
};

/**
 * @desc    Get task history
 * @route   GET /api/intern/tasks
 * @access  Private (Intern only)
 */
exports.getTaskHistory = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user || !user.internDetails) {
            return res.status(404).json({
                success: false,
                message: 'Intern profile not found'
            });
        }

        res.json({
            success: true,
            data: user.internDetails.academicWork.dailyTaskUpdate
        });
    } catch (error) {
        console.error('Get Task History Error:', error);
        next(error);
    }
};

/**
 * @desc    Submit weekly progress report
 * @route   POST /api/intern/reports
 * @access  Private (Intern only)
 */
exports.submitWeeklyReport = async (req, res, next) => {
    try {
        const { report, weekNumber } = req.body;

        const user = await User.findById(req.user.id);

        if (!user || user.role !== 'INTERN') {
            return res.status(404).json({ success: false, message: 'Intern profile not found' });
        }

        user.internDetails.academicWork.weeklyProgressReport.push({
            weekNumber,
            report,
            submittedAt: new Date()
        });

        await user.save();

        const reports = user.internDetails.academicWork.weeklyProgressReport;

        res.status(201).json({
            success: true,
            message: 'Weekly report submitted successfully',
            data: reports[reports.length - 1]
        });
    } catch (error) {
        console.error('Submit Weekly Report Error:', error);
        next(error);
    }
};
/**
 * @desc    Get assigned tasks
 * @route   GET /api/intern/assigned-tasks
 * @access  Private (Intern only)
 */
exports.getAssignedTasks = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user || !user.internDetails) {
            return res.status(404).json({ success: false, message: 'Intern profile not found' });
        }

        res.json({
            success: true,
            data: user.internDetails.assignedTasks
        });
    } catch (error) {
        console.error('Get Assigned Tasks Error:', error);
        next(error);
    }
};

/**
 * @desc    Update assigned task status
 * @route   PATCH /api/intern/assigned-tasks/:taskId
 * @access  Private (Intern only)
 */
exports.updateAssignedTaskStatus = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;

        const user = await User.findById(req.user.id);

        if (!user || !user.internDetails) {
            return res.status(404).json({ success: false, message: 'Intern profile not found' });
        }

        const task = user.internDetails.assignedTasks.id(taskId);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        task.status = status;
        await user.save();

        res.json({
            success: true,
            message: 'Task status updated',
            data: task
        });
    } catch (error) {
        console.error('Update Task Status Error:', error);
        next(error);
    }
};
