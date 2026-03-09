const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Settings = require('../models/Settings');
const mongoose = require('mongoose');

// @desc    Get geo-location logs
// @route   GET /api/admin/geo-logs
// @access  Admin
exports.getGeoLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      startDate,
      endDate,
      search,
      withinOffice,
      department
    } = req.query;

    // Build query - only get records with location data
    const query = {
      $or: [
        { 'checkIn.location.latitude': { $exists: true, $ne: null } },
        { 'checkOut.location.latitude': { $exists: true, $ne: null } }
      ]
    };

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Within office filter
    if (withinOffice !== undefined && withinOffice !== '') {
      const isWithin = withinOffice === 'true';
      if (isWithin) {
        query['checkIn.isWithinOffice'] = true;
      } else {
        query['checkIn.isWithinOffice'] = false;
      }
    }

    // Search by user name/email and department filter
    let userIds = null;
    if (search || department) {
      const userQuery = {};
      
      if (search) {
        userQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (department) {
        userQuery.department = department;
      }
      
      const users = await User.find(userQuery).select('_id');
      userIds = users.map(u => u._id);
      query.user = { $in: userIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [logs, total] = await Promise.all([
      Attendance.find(query)
        .populate('user', 'fullName email role department designation')
        .select('user date checkIn checkOut status workHours notes')
        .sort({ date: -1, 'checkIn.time': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Attendance.countDocuments(query)
    ]);

    // Get unique departments for filter
    const departments = await User.distinct('department', { 
      department: { $ne: null, $ne: '' },
      isActive: true 
    });

    res.status(200).json({
      success: true,
      data: logs,
      departments,
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

// @desc    Get geo-location statistics
// @route   GET /api/admin/geo-logs/stats
// @access  Admin
exports.getGeoStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build match stage
    const matchStage = {
      'checkIn.location.latitude': { $exists: true, $ne: null }
    };

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchStage.date.$lte = end;
      }
    }

    // Get overall stats
    const overallStats = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCheckIns: { $sum: 1 },
          withinOffice: {
            $sum: { $cond: ['$checkIn.isWithinOffice', 1, 0] }
          },
          outsideOffice: {
            $sum: { $cond: ['$checkIn.isWithinOffice', 0, 1] }
          }
        }
      }
    ]);

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStats = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          checkedIn: {
            $sum: { $cond: [{ $ne: ['$checkIn.time', null] }, 1, 0] }
          },
          checkedOut: {
            $sum: { $cond: [{ $ne: ['$checkOut.time', null] }, 1, 0] }
          },
          inOffice: {
            $sum: { $cond: ['$checkIn.isWithinOffice', 1, 0] }
          },
          remote: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$checkIn.time', null] },
                    { $eq: ['$checkIn.isWithinOffice', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Count remote workers (those who checked in outside office this month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const remoteWorkers = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth },
          'checkIn.isWithinOffice': false
        }
      },
      {
        $group: {
          _id: '$user'
        }
      },
      {
        $count: 'count'
      }
    ]);

    // Top locations (most frequent check-in locations)
    const topLocations = await Attendance.aggregate([
      { $match: { 'checkIn.location.latitude': { $exists: true } } },
      {
        $group: {
          _id: {
            lat: { $round: ['$checkIn.location.latitude', 3] },
            lng: { $round: ['$checkIn.location.longitude', 3] }
          },
          count: { $sum: 1 },
          lastUsed: { $max: '$date' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCheckIns: overallStats[0]?.totalCheckIns || 0,
        withinOffice: overallStats[0]?.withinOffice || 0,
        outsideOffice: overallStats[0]?.outsideOffice || 0,
        remoteWorkers: remoteWorkers[0]?.count || 0,
        todayStats: todayStats[0] || { checkedIn: 0, checkedOut: 0, inOffice: 0, remote: 0 },
        topLocations
      }
    });
  } catch (error) {
    console.error('Get geo stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// @desc    Get single geo-location log by ID
// @route   GET /api/admin/geo-logs/:id
// @access  Admin
exports.getGeoLogById = async (req, res) => {
  try {
    const log = await Attendance.findById(req.params.id)
      .populate('user', 'fullName email role department designation mobile')
      .populate('approvedBy', 'fullName email')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Geo-location log not found'
      });
    }

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Get geo log by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching geo-location log',
      error: error.message
    });
  }
};

// @desc    Get users currently outside office
// @route   GET /api/admin/geo-logs/outside-office
// @access  Admin
exports.getUsersOutsideOffice = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const outsideOffice = await Attendance.find({
      date: { $gte: today, $lt: tomorrow },
      'checkIn.isWithinOffice': false,
      'checkIn.time': { $exists: true }
    })
      .populate('user', 'fullName email role department')
      .select('user date checkIn status')
      .lean();

    res.status(200).json({
      success: true,
      data: outsideOffice,
      count: outsideOffice.length
    });
  } catch (error) {
    console.error('Get users outside office error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching data',
      error: error.message
    });
  }
};

// @desc    Export geo-location logs
// @route   POST /api/admin/geo-logs/export
// @access  Admin
exports.exportGeoLogs = async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.body;

    const query = {
      $or: [
        { 'checkIn.location.latitude': { $exists: true } },
        { 'checkOut.location.latitude': { $exists: true } }
      ]
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const logs = await Attendance.find(query)
      .populate('user', 'fullName email department')
      .sort({ date: -1 })
      .lean();

    // Format data for export
    const exportData = logs.map(log => ({
      employeeName: log.user?.fullName || 'Unknown',
      email: log.user?.email || '-',
      department: log.user?.department || '-',
      date: new Date(log.date).toLocaleDateString(),
      checkInTime: log.checkIn?.time ? new Date(log.checkIn.time).toLocaleTimeString() : '-',
      checkInLat: log.checkIn?.location?.latitude || '-',
      checkInLng: log.checkIn?.location?.longitude || '-',
      checkInOffice: log.checkIn?.isWithinOffice ? 'Yes' : 'No',
      checkOutTime: log.checkOut?.time ? new Date(log.checkOut.time).toLocaleTimeString() : '-',
      checkOutLat: log.checkOut?.location?.latitude || '-',
      checkOutLng: log.checkOut?.location?.longitude || '-',
      checkOutOffice: log.checkOut?.isWithinOffice ? 'Yes' : 'No',
      status: log.status
    }));

    // For now, return JSON. For Excel/PDF, integrate ExcelJS/PDFKit
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=geo_logs.json');
      return res.json(exportData);
    }

    // Placeholder for Excel/PDF
    res.json({
      success: true,
      message: 'Export ready',
      data: exportData
    });
  } catch (error) {
    console.error('Export geo logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting data',
      error: error.message
    });
  }
};

// @desc    Verify location (check if within office radius)
// @route   POST /api/admin/geo-logs/verify-location
// @access  Admin
exports.verifyLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Get office location from settings
    const settings = await Settings.findOne();
    const officeLocation = settings?.officeLocation;

    if (!officeLocation?.latitude || !officeLocation?.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Office location not configured'
      });
    }

    // Calculate distance using Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (officeLocation.latitude - latitude) * Math.PI / 180;
    const dLon = (officeLocation.longitude - longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(latitude * Math.PI / 180) * Math.cos(officeLocation.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    const radius = officeLocation.radius || 0.1; // Default 100 meters
    const isWithinOffice = distance <= radius;

    res.status(200).json({
      success: true,
      data: {
        isWithinOffice,
        distance: distance.toFixed(4),
        radius,
        officeLocation: {
          latitude: officeLocation.latitude,
          longitude: officeLocation.longitude,
          address: officeLocation.address
        }
      }
    });
  } catch (error) {
    console.error('Verify location error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying location',
      error: error.message
    });
  }
};

// @desc    Get location history for a specific user
// @route   GET /api/admin/geo-logs/user/:userId
// @access  Admin
exports.getUserLocationHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, limit = 30 } = req.query;

    const query = {
      user: new mongoose.Types.ObjectId(userId),
      $or: [
        { 'checkIn.location.latitude': { $exists: true } },
        { 'checkOut.location.latitude': { $exists: true } }
      ]
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const [user, logs] = await Promise.all([
      User.findById(userId).select('fullName email department').lean(),
      Attendance.find(query)
        .select('date checkIn checkOut status workHours')
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .lean()
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate stats
    const stats = {
      totalLogs: logs.length,
      inOfficeCount: logs.filter(l => l.checkIn?.isWithinOffice).length,
      remoteCount: logs.filter(l => l.checkIn?.time && !l.checkIn?.isWithinOffice).length
    };

    res.status(200).json({
      success: true,
      data: {
        user,
        logs,
        stats
      }
    });
  } catch (error) {
    console.error('Get user location history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching location history',
      error: error.message
    });
  }
};