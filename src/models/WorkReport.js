const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  project: String,
  category: {
    type: String,
    enum: ['Development', 'Design', 'Testing', 'Documentation', 'Meeting', 'Research', 'Other'],
    default: 'Other'
  },
  hoursSpent: {
    type: Number,
    required: true,
    min: 0,
    max: 24
  },
  status: {
    type: String,
    enum: ['Completed', 'In Progress', 'Blocked', 'Pending'],
    default: 'Completed'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  }
});

const workReportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  tasks: [taskSchema],
  totalHoursWorked: {
    type: Number,
    default: 0
  },
  summary: String,
  challenges: String,
  plannedForTomorrow: String,
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
    default: 'DRAFT'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewComments: String,
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: Date
  }],
  submittedAt: Date
}, {
  timestamps: true
});

// Indexes
workReportSchema.index({ user: 1, date: 1 }, { unique: true });
workReportSchema.index({ status: 1 });

// Calculate total hours before saving
workReportSchema.pre('save', function(next) {
  if (this.tasks && this.tasks.length > 0) {
    this.totalHoursWorked = this.tasks.reduce((acc, task) => acc + (task.hoursSpent || 0), 0);
  }
  next();
});

module.exports = mongoose.model('WorkReport', workReportSchema);