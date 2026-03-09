const Attendance = require('../models/Attendance');
const User = require('../models/User');
const mongoose = require('mongoose');
const { escapeRegex } = require('../utils/securityUtils');

// @desc    Get all attendance records
// @route   GET /api/admin/attendance
exports.getAttendance = async (req, res) => {
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

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // User filter
    if (userId) {
      query.user = mongoose.Types.ObjectId(userId);
    }

    // Search by user name/email
    if (search) {
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      Attendance.find(query)
        .populate('user', 'fullName email role department designation')
        .populate('approvedBy', 'fullName email')
        .sort({ date: -1, 'checkIn.time': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Attendance.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance records',
      error: error.message
    });
  }
};

// @desc    Get attendance summary
// @route   GET /api/admin/attendance/summary
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const matchStage = {};

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    if (userId) {
      matchStage.user = mongoose.Types.ObjectId(userId);
    }

    const summary = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalWorkHours: { $sum: '$workHours' },
          avgWorkHours: { $avg: '$workHours' }
        }
      }
    ]);

    const totals = {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      onLeave: 0,
      totalWorkHours: 0
    };

    summary.forEach(item => {
      switch (item._id) {
        case 'PRESENT': totals.present = item.count; break;
        case 'ABSENT': totals.absent = item.count; break;
        case 'LATE': totals.late = item.count; break;
        case 'HALF_DAY': totals.halfDay = item.count; break;
        case 'ON_LEAVE': totals.onLeave = item.count; break;
      }
      totals.totalWorkHours += item.totalWorkHours || 0;
    });

    res.status(200).json({
      success: true,
      data: { summary, totals }
    });
  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance summary',
      error: error.message
    });
  }
};

// @desc    Get geo-location logs
// @route   GET /api/admin/attendance/geo-logs
exports.getGeoLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      withinOffice,
      search
    } = req.query;

    const query = {
      $or: [
        { 'checkIn.location.latitude': { $exists: true, $ne: null } },
        { 'checkOut.location.latitude': { $exists: true, $ne: null } }
      ]
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (withinOffice !== undefined) {
      const isWithin = withinOffice === 'true';
      query['checkIn.isWithinOffice'] = isWithin;
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

    const [logs, total] = await Promise.all([
      Attendance.find(query)
        .populate('user', 'fullName email role department')
        .select('user date checkIn checkOut status')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Attendance.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get geo logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching geo-location logs',
      error: error.message
    });
  }
};

// @desc    Create manual attendance
// @route   POST /api/admin/attendance/manual
exports.createManualAttendance = async (req, res) => {
  try {
    const { userId, date, checkIn, checkOut, status, notes, reason } = req.body;

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check for existing record
    const existingAttendance = await Attendance.findOne({
      user: userId,
      date: new Date(date)
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record already exists for this date'
      });
    }

    const attendance = await Attendance.create({
      user: userId,
      date: new Date(date),
      checkIn: checkIn ? {
        time: new Date(checkIn.time),
        location: checkIn.location,
        isWithinOffice: checkIn.isWithinOffice || false
      } : undefined,
      checkOut: checkOut ? {
        time: new Date(checkOut.time),
        location: checkOut.location,
        isWithinOffice: checkOut.isWithinOffice || false
      } : undefined,
      status: status || 'PRESENT',
      notes,
      isManualEntry: true,
      manualEntryReason: reason || 'Manual entry by admin',
      approvedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Manual attendance created successfully',
      data: attendance
    });
  } catch (error) {
    console.error('Create manual attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating attendance',
      error: error.message
    });
  }
};

// @desc    Update attendance
// @route   PUT /api/admin/attendance/:id
exports.updateAttendance = async (req, res) => {
  try {
    const { checkIn, checkOut, status, notes, reason } = req.body;

    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    if (checkIn) attendance.checkIn = { ...attendance.checkIn, ...checkIn };
    if (checkOut) attendance.checkOut = { ...attendance.checkOut, ...checkOut };
    if (status) attendance.status = status;
    if (notes !== undefined) attendance.notes = notes;

    attendance.isManualEntry = true;
    attendance.manualEntryReason = reason || 'Updated by admin';
    attendance.approvedBy = req.user._id;

    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully',
      data: attendance
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating attendance',
      error: error.message
    });
  }
};

// @desc    Delete attendance
// @route   DELETE /api/admin/attendance/:id
exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting attendance',
      error: error.message
    });
  }
};