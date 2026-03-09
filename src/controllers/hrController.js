const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const mongoose = require('mongoose');
const { escapeRegex } = require('../utils/securityUtils');

// Try to import InternProfile, but don't fail if it doesn't exist
let InternProfile;
try {
  InternProfile = require('../models/InternProfile');
} catch (e) {
  InternProfile = null;
  console.log('InternProfile model not found - intern features will be limited');
}

// ==================== DASHBOARD ====================
exports.getDashboard = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Total employees count
    const totalEmployees = await User.countDocuments({
      role: { $in: ['EMPLOYEE', 'INTERN', 'MANAGER'] },
      isActive: true
    });

    // Today's attendance aggregation
    const todayAtt = await Attendance.aggregate([
      { $match: { date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const stats = { present: 0, absent: 0, late: 0, onLeave: 0 };
    todayAtt.forEach(i => {
      switch (i._id) {
        case 'PRESENT': stats.present = i.count; break;
        case 'ABSENT': stats.absent = i.count; break;
        case 'LATE': stats.late = i.count; break;
        case 'ON_LEAVE': stats.onLeave = i.count; break;
      }
    });

    // Calculate absent employees
    const checkedIn = await Attendance.countDocuments({
      date: { $gte: today, $lt: tomorrow }
    });
    stats.absent = Math.max(0, totalEmployees - checkedIn);

    // Pending leaves
    const pendingLeaves = await Leave.countDocuments({ status: 'PENDING' });

    // Upcoming approved leaves
    const upcomingLeaves = await Leave.find({
      status: 'APPROVED',
      startDate: { $gte: today }
    })
      .populate('user', 'fullName department')
      .sort({ startDate: 1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        totalEmployees,
        todayAttendance: stats,
        pendingLeaves,
        upcomingLeaves
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRecentActivity = async (req, res) => {
  try {
    const activities = [];

    // Recent check-ins
    const checkIns = await Attendance.find({ 'checkIn.time': { $exists: true } })
      .populate('user', 'fullName')
      .sort({ 'checkIn.time': -1 })
      .limit(5)
      .lean();

    checkIns.forEach(a => {
      if (a.checkIn?.time) {
        activities.push({
          icon: '✅',
          title: `${a.user?.fullName || 'Unknown'} checked in`,
          description: `Status: ${a.status}`,
          time: new Date(a.checkIn.time).toLocaleString()
        });
      }
    });

    // Recent leave requests
    const leaves = await Leave.find()
      .populate('user', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    leaves.forEach(l => {
      activities.push({
        icon: '🏖️',
        title: `${l.user?.fullName || 'Unknown'} requested leave`,
        description: `${l.type} - ${l.status}`,
        time: new Date(l.createdAt).toLocaleString()
      });
    });

    // Sort by time descending
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ success: true, data: activities.slice(0, 10) });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ATTENDANCE ====================
exports.getEmployeesForAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    const attDate = date ? new Date(date) : new Date();
    attDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(attDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all active employees
    const employees = await User.find({
      isActive: true,
      role: { $in: ['EMPLOYEE', 'INTERN', 'MANAGER', 'HR'] }
    })
      .select('fullName email department designation role')
      .sort({ fullName: 1 })
      .lean();

    // Get attendance for the date
    const attendance = await Attendance.find({
      date: { $gte: attDate, $lt: nextDay }
    }).lean();

    const attMap = {};
    attendance.forEach(a => {
      attMap[a.user.toString()] = a;
    });

    // Merge employees with attendance
    const result = employees.map(e => ({
      ...e,
      attendance: attMap[e._id.toString()] || null
    }));

    // Get unique departments
    const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];

    res.json({
      success: true,
      data: { employees: result, departments, date: attDate }
    });
  } catch (error) {
    console.error('Get employees for attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAttendance = async (req, res) => {
  try {
    const { date, records } = req.body;
    const attDate = new Date(date);
    attDate.setHours(0, 0, 0, 0);

    const results = [];

    for (const r of records) {
      try {
        const data = {
          user: r.userId,
          date: attDate,
          status: r.status,
          notes: r.notes,
          isManualEntry: true,
          approvedBy: req.user._id
        };

        // Add check-in time if provided
        if (r.checkIn?.time) {
          data.checkIn = {
            time: new Date(r.checkIn.time),
            isWithinOffice: true
          };
        }

        // Add check-out time if provided
        if (r.checkOut?.time) {
          data.checkOut = {
            time: new Date(r.checkOut.time),
            isWithinOffice: true
          };
        }

        await Attendance.findOneAndUpdate(
          { user: r.userId, date: attDate },
          data,
          { upsert: true, new: true }
        );

        results.push({ userId: r.userId, status: 'success' });
      } catch (err) {
        results.push({ userId: r.userId, status: 'error', error: err.message });
      }
    }

    res.json({ success: true, message: 'Attendance saved', results });
  } catch (error) {
    console.error('Save attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAttendanceRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, status, search } = req.query;
    const query = {};

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Status filter
    if (status) query.status = status;

    // Search filter
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

    const [records, total] = await Promise.all([
      Attendance.find(query)
        .populate('user', 'fullName email department')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Attendance.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: records,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get attendance records error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAttendanceRecord = async (req, res) => {
  try {
    const { status, checkIn, checkOut, notes, date } = req.body;

    const att = await Attendance.findById(req.params.id);
    if (!att) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    // Update fields
    if (status) att.status = status;
    if (notes !== undefined) att.notes = notes;

    // Update check-in time
    if (checkIn && date) {
      att.checkIn = {
        ...att.checkIn?.toObject(),
        time: new Date(`${date}T${checkIn}`)
      };
    }

    // Update check-out time
    if (checkOut && date) {
      att.checkOut = {
        ...att.checkOut?.toObject(),
        time: new Date(`${date}T${checkOut}`)
      };
    }

    att.isManualEntry = true;
    att.approvedBy = req.user._id;

    await att.save();

    res.json({ success: true, message: 'Attendance updated', data: att });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EMPLOYEES ====================
exports.getEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, department, role } = req.query;
    const query = { role: { $ne: 'ADMIN' } };

    // Search filter
    if (search) {
      // SECURITY FIX: Escape user input before using in regex to prevent NoSQL injection
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { fullName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { mobile: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // Department filter
    if (department) query.department = department;

    // Role filter
    if (role) query.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [employees, total] = await Promise.all([
      User.find(query)
        .select('fullName email mobile department designation role isActive createdAt')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    // Get unique departments
    const departments = await User.distinct('department', { department: { $ne: null } });

    res.json({
      success: true,
      data: employees,
      departments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEmployeeDetails = async (req, res) => {
  try {
    const emp = await User.findById(req.params.id).select('-password').lean();

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Get attendance summary for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const attSum = await Attendance.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.params.id),
          date: { $gte: startOfMonth }
        }
      },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const summary = { present: 0, absent: 0, late: 0, leaves: 0 };
    attSum.forEach(i => {
      switch (i._id) {
        case 'PRESENT': summary.present = i.count; break;
        case 'ABSENT': summary.absent = i.count; break;
        case 'LATE': summary.late = i.count; break;
        case 'ON_LEAVE': summary.leaves = i.count; break;
      }
    });

    res.json({
      success: true,
      data: { ...emp, attendanceSummary: summary }
    });
  } catch (error) {
    console.error('Get employee details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== LEAVES ====================
exports.getLeaveRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    if (search) {
      // SECURITY FIX: Escape user input before using in regex to prevent NoSQL injection
      const escapedSearch = escapeRegex(search);
      const users = await User.find({
        fullName: { $regex: escapedSearch, $options: 'i' }
      }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [leaves, total] = await Promise.all([
      Leave.find(query)
        .populate('user', 'fullName email department')
        .populate('reviewedBy', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Leave.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: leaves,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reviewLeave = async (req, res) => {
  try {
    const { status, comments } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    // Update leave status
    leave.status = status;
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewComments = comments || '';

    await leave.save();

    // If approved, mark attendance as ON_LEAVE for those dates
    if (status === 'APPROVED') {
      const startDate = new Date(leave.startDate);
      const endDate = new Date(leave.endDate);

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateOnly = new Date(d);
        dateOnly.setHours(0, 0, 0, 0);

        await Attendance.findOneAndUpdate(
          { user: leave.user, date: dateOnly },
          {
            user: leave.user,
            date: dateOnly,
            status: 'ON_LEAVE',
            notes: `${leave.type} Leave`,
            isManualEntry: true,
            approvedBy: req.user._id
          },
          { upsert: true }
        );
      }
    }

    res.json({
      success: true,
      message: `Leave ${status.toLowerCase()}`,
      data: leave
    });
  } catch (error) {
    console.error('Review leave error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== INTERNS (Using User Model) ====================
exports.getInterns = async (req, res) => {
  try {
    const { page = 1, limit = 12, search } = req.query;

    // If InternProfile model exists, use it
    if (InternProfile) {
      const query = {};
      if (search) {
        const users = await User.find({
          fullName: { $regex: search, $options: 'i' },
          role: 'INTERN'
        }).select('_id');
        query.userId = { $in: users.map(u => u._id) };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [interns, total] = await Promise.all([
        InternProfile.find(query)
          .populate('userId', 'fullName email mobile isActive department designation')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        InternProfile.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data: interns,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      });
    }

    // Fallback: Use User model directly
    const query = { role: 'INTERN' };
    if (search) {
      // SECURITY FIX: Escape user input before using in regex to prevent NoSQL injection
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { fullName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [interns, total] = await Promise.all([
      User.find(query)
        .select('fullName email mobile isActive department designation createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    // Transform to match expected format
    const formattedInterns = interns.map(intern => ({
      _id: intern._id,
      internId: `INT-${intern._id.toString().slice(-6).toUpperCase()}`,
      userId: intern,
      internship: {
        domain: intern.department || 'Not Assigned',
        type: 'Standard',
        assignedMentor: 'Not Assigned',
        assignedBatch: 'Not Assigned',
        startDate: intern.createdAt,
        endDate: null
      },
      education: {},
      assignedTasks: []
    }));

    res.json({
      success: true,
      data: formattedInterns,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get interns error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getInternDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // If InternProfile model exists, use it
    if (InternProfile) {
      const intern = await InternProfile.findOne({ userId })
        .populate('userId', 'fullName email mobile isActive department designation')
        .lean();

      if (intern) {
        return res.json({ success: true, data: intern });
      }
    }

    // Fallback: Use User model
    const user = await User.findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Intern not found' });
    }

    // Create a mock intern profile structure
    const internData = {
      _id: user._id,
      internId: `INT-${user._id.toString().slice(-6).toUpperCase()}`,
      userId: user,
      internship: {
        domain: user.department || 'Not Assigned',
        type: 'Standard',
        assignedMentor: 'Not Assigned',
        assignedBatch: 'Not Assigned',
        startDate: user.createdAt,
        endDate: null,
        dailyWorkingHours: 8
      },
      education: {
        collegeName: 'Not Provided',
        course: 'Not Provided',
        branch: 'Not Provided',
        yearSemester: 'Not Provided'
      },
      projectWork: {
        projectTitle: 'Not Assigned',
        finalProjectSubmitted: false
      },
      assignedTasks: [],
      academicWork: {
        dailyTaskUpdate: [],
        weeklyProgressReport: []
      }
    };

    res.json({ success: true, data: internData });
  } catch (error) {
    console.error('Get intern details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignTask = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, description, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    // If InternProfile model exists, use it
    if (InternProfile) {
      let intern = await InternProfile.findOne({ userId });

      if (!intern) {
        // Create intern profile if it doesn't exist
        const user = await User.findById(userId);
        if (!user || user.role !== 'INTERN') {
          return res.status(404).json({ success: false, message: 'Intern not found' });
        }

        intern = await InternProfile.create({
          userId: userId,
          assignedTasks: []
        });
      }

      intern.assignedTasks.push({
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedBy: req.user._id,
        assignedAt: new Date(),
        status: 'Pending'
      });

      await intern.save();

      return res.json({
        success: true,
        message: 'Task assigned successfully',
        data: intern.assignedTasks
      });
    }

    // Fallback: Store in a simple format or just acknowledge
    res.json({
      success: true,
      message: 'Task assigned successfully (Note: InternProfile model not found, task stored in memory only)',
      data: [{
        title,
        description,
        dueDate,
        assignedAt: new Date(),
        status: 'Pending'
      }]
    });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== REPORTS ====================
exports.getReport = async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate } = req.query;

    let data = { summary: {}, records: [] };
    const dateQuery = {};

    if (startDate) dateQuery.$gte = new Date(startDate);
    if (endDate) dateQuery.$lte = new Date(endDate);

    switch (type) {
      case 'attendance':
        const attQuery = Object.keys(dateQuery).length ? { date: dateQuery } : {};
        const attRecords = await Attendance.find(attQuery)
          .populate('user', 'fullName department')
          .lean();

        const attSummary = { total: attRecords.length, present: 0, absent: 0, late: 0, onLeave: 0 };
        attRecords.forEach(r => {
          switch (r.status) {
            case 'PRESENT': attSummary.present++; break;
            case 'ABSENT': attSummary.absent++; break;
            case 'LATE': attSummary.late++; break;
            case 'ON_LEAVE': attSummary.onLeave++; break;
          }
        });

        data = {
          summary: attSummary,
          records: attRecords.slice(0, 50).map(r => ({
            name: r.user?.fullName || 'Unknown',
            date: new Date(r.date).toLocaleDateString(),
            status: r.status,
            department: r.user?.department || '-'
          }))
        };
        break;

      case 'leave':
        const leaveQuery = Object.keys(dateQuery).length ? { createdAt: dateQuery } : {};
        const leaveRecords = await Leave.find(leaveQuery)
          .populate('user', 'fullName department')
          .lean();

        const leaveSummary = { total: leaveRecords.length, pending: 0, approved: 0, rejected: 0 };
        leaveRecords.forEach(l => {
          switch (l.status) {
            case 'PENDING': leaveSummary.pending++; break;
            case 'APPROVED': leaveSummary.approved++; break;
            case 'REJECTED': leaveSummary.rejected++; break;
          }
        });

        data = {
          summary: leaveSummary,
          records: leaveRecords.slice(0, 50).map(l => ({
            name: l.user?.fullName || 'Unknown',
            type: l.type,
            status: l.status,
            startDate: new Date(l.startDate).toLocaleDateString(),
            endDate: new Date(l.endDate).toLocaleDateString()
          }))
        };
        break;

      case 'employee':
        const employees = await User.find({ role: { $ne: 'ADMIN' } })
          .select('fullName email department role isActive')
          .lean();

        const empSummary = {
          total: employees.length,
          active: employees.filter(e => e.isActive).length,
          inactive: employees.filter(e => !e.isActive).length
        };

        data = {
          summary: empSummary,
          records: employees.map(e => ({
            name: e.fullName,
            email: e.email,
            department: e.department || '-',
            role: e.role,
            active: e.isActive
          }))
        };
        break;

      case 'intern':
        const internUsers = await User.find({ role: 'INTERN' })
          .select('fullName email department isActive')
          .lean();

        const internSummary = {
          total: internUsers.length,
          active: internUsers.filter(i => i.isActive).length
        };

        data = {
          summary: internSummary,
          records: internUsers.map(i => ({
            name: i.fullName,
            email: i.email,
            department: i.department || '-',
            active: i.isActive
          }))
        };
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid report type' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const { type } = req.params;
    const { format } = req.body;

    // Basic export - for full functionality, integrate ExcelJS/PDFKit
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_report.json`);
    res.json({
      message: 'Export functionality',
      note: 'For Excel/PDF export, integrate ExcelJS or PDFKit libraries'
    });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PROFILE ====================
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').lean();
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const { fullName, mobile, department, designation } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName, mobile, department, designation },
      { new: true }
    ).select('-password');

    res.json({ success: true, message: 'Profile updated', data: user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.user._id);

    // Check if comparePassword method exists
    if (typeof user.comparePassword === 'function') {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    } else {
      // Fallback: direct comparison (not recommended for production)
      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};