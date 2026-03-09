const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'My Company'
  },
  logo: String,
  contactEmail: String,
  contactPhone: String,
  website: String,
  
  officeLocation: {
    address: String,
    latitude: {
      type: Number,
      default: 0
    },
    longitude: {
      type: Number,
      default: 0
    },
    radius: {
      type: Number,
      default: 0.1
    }
  },
  
  workingHours: {
    start: {
      type: String,
      default: '09:00'
    },
    end: {
      type: String,
      default: '18:00'
    }
  },
  
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  
  attendanceSettings: {
    lateThresholdMinutes: {
      type: Number,
      default: 15
    },
    halfDayThresholdHours: {
      type: Number,
      default: 4
    },
    minWorkHoursForFullDay: {
      type: Number,
      default: 8
    },
    allowRemoteCheckIn: {
      type: Boolean,
      default: false
    },
    requirePhotoOnCheckIn: {
      type: Boolean,
      default: false
    },
    weekendDays: {
      type: [Number],
      default: [0, 6]
    }
  },
  
  leaveSettings: {
    annualLeaveQuota: {
      type: Number,
      default: 21
    },
    sickLeaveQuota: {
      type: Number,
      default: 10
    },
    casualLeaveQuota: {
      type: Number,
      default: 7
    }
  },
  
  policies: {
    leave: String,
    attendance: String,
    workFromHome: String,
    general: String
  },
  
  holidays: [{
    name: String,
    date: Date,
    type: {
      type: String,
      enum: ['Public', 'Company', 'Optional'],
      default: 'Public'
    }
  }]
}, {
  timestamps: true
});

// Ensure only one settings document
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

settingsSchema.statics.updateSettings = async function(updates) {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create(updates);
  } else {
    Object.assign(settings, updates);
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);