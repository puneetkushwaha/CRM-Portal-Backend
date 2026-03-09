const WorkReport = require('../models/WorkReport');
const User = require('../models/User');
const mongoose = require('mongoose');
const { escapeRegex } = require('../utils/securityUtils');

// @desc    Get all work reports
// @route   GET /api/admin/reports
exports.getWorkReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      status,
      userId,
      search
    } = req.query;

    const query = {};

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.user = mongoose.Types.ObjectId(userId);
    }

    if (search) {
      // SECURITY FIX: Escape user input before using in regex to prevent NoSQL injection
      const escapedSearch = escapeRegex(search);
      const users = await User.find({
        $or: [
          { fullName: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } }
        ]
      }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reports, total] = await Promise.all([
      WorkReport.find(query)
        .populate('user', 'fullName email role department designation')
        .populate('reviewedBy', 'fullName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      WorkReport.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get work reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching work reports',
      error: error.message
    });
  }
};

// @desc    Get work report by ID
// @route   GET /api/admin/reports/:id
exports.getWorkReportById = async (req, res) => {
  try {
    const report = await WorkReport.findById(req.params.id)
      .populate('user', 'fullName email role department')
      .populate('reviewedBy', 'fullName email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Work report not found'
      });
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get work report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching work report',
      error: error.message
    });
  }
};

// @desc    Review work report (approve/reject)
// @route   PUT /api/admin/reports/:id/review
exports.reviewWorkReport = async (req, res) => {
  try {
    const { status, reviewComments } = req.body;

    if (!['APPROVED', 'REJECTED', 'REVISION_REQUESTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be APPROVED, REJECTED, or REVISION_REQUESTED'
      });
    }

    const report = await WorkReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Work report not found'
      });
    }

    report.status = status;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    report.reviewComments = reviewComments || '';

    await report.save();

    await report.populate('user', 'fullName email');
    await report.populate('reviewedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: `Work report ${status.toLowerCase()}`,
      data: report
    });
  } catch (error) {
    console.error('Review work report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error reviewing work report',
      error: error.message
    });
  }
};

// @desc    Get pending reports count
// @route   GET /api/admin/reports/pending-count
exports.getPendingCount = async (req, res) => {
  try {
    const count = await WorkReport.countDocuments({ status: 'SUBMITTED' });
    res.status(200).json({
      success: true,
      data: { pendingCount: count }
    });
  } catch (error) {
    console.error('Get pending count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending count',
      error: error.message
    });
  }
};

// @desc    Delete work report
// @route   DELETE /api/admin/reports/:id
exports.deleteWorkReport = async (req, res) => {
  try {
    const report = await WorkReport.findByIdAndDelete(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Work report not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Work report deleted successfully'
    });
  } catch (error) {
    console.error('Delete work report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting work report',
      error: error.message
    });
  }
};