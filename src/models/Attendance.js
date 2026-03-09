const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    isWithinOffice: {
      type: Boolean,
      default: false
    },
    photo: String,
    deviceInfo: {
      deviceId: String,
      deviceType: String,
      browser: String,
      os: String
    }
  },
  checkOut: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    isWithinOffice: {
      type: Boolean,
      default: false
    },
    photo: String
  },
  status: {
    type: String,
    enum: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'],
    default: 'ABSENT'
  },
  workHours: {
    type: Number, // in minutes
    default: 0
  },
  overtimeHours: {
    type: Number,
    default: 0
  },
  breaks: [{
    startTime: Date,
    endTime: Date,
    duration: Number,
    reason: String
  }],
  notes: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isManualEntry: {
    type: Boolean,
    default: false
  },
  manualEntryReason: String
}, {
  timestamps: true
});

// Indexes
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });

// Calculate work hours before saving
attendanceSchema.pre('save', function(next) {
  if (this.checkIn?.time && this.checkOut?.time) {
    const checkInTime = new Date(this.checkIn.time);
    const checkOutTime = new Date(this.checkOut.time);
    
    let totalMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60));
    
    if (this.breaks && this.breaks.length > 0) {
      const breakMinutes = this.breaks.reduce((acc, b) => acc + (b.duration || 0), 0);
      totalMinutes -= breakMinutes;
    }
    
    this.workHours = Math.max(0, totalMinutes);
  }
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);