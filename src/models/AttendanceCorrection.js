const mongoose = require("mongoose");

const AttendanceCorrectionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING"
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  reviewNote: {
    type: String,
    default: ""
  }
}, { timestamps: true });

// one request per user per day
AttendanceCorrectionSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceCorrection", AttendanceCorrectionSchema);
