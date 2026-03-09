const Settings = require('../models/Settings');

// @desc    Get settings
// @route   GET /api/admin/settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
};

// @desc    Update settings
// @route   PUT /api/admin/settings
exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;

    // Remove protected fields
    delete updates._id;
    delete updates.__v;
    delete updates.createdAt;
    delete updates.updatedAt;

    const settings = await Settings.updateSettings(updates);

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error.message
    });
  }
};

// @desc    Get holidays
// @route   GET /api/admin/settings/holidays
exports.getHolidays = async (req, res) => {
  try {
    const { year } = req.query;
    const settings = await Settings.getSettings();

    let holidays = settings.holidays || [];

    if (year) {
      holidays = holidays.filter(h => 
        new Date(h.date).getFullYear() === parseInt(year)
      );
    }

    holidays.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      success: true,
      data: holidays
    });
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holidays',
      error: error.message
    });
  }
};

// @desc    Add holiday
// @route   POST /api/admin/settings/holidays
exports.addHoliday = async (req, res) => {
  try {
    const { name, date, type } = req.body;

    if (!name || !date) {
      return res.status(400).json({
        success: false,
        message: 'Name and date are required'
      });
    }

    const settings = await Settings.getSettings();

    const existingIndex = settings.holidays.findIndex(
      h => new Date(h.date).toDateString() === new Date(date).toDateString()
    );

    if (existingIndex !== -1) {
      settings.holidays[existingIndex] = { 
        name, 
        date: new Date(date), 
        type: type || 'Public' 
      };
    } else {
      settings.holidays.push({ 
        name, 
        date: new Date(date), 
        type: type || 'Public' 
      });
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Holiday saved successfully',
      data: settings.holidays
    });
  } catch (error) {
    console.error('Add holiday error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving holiday',
      error: error.message
    });
  }
};

// @desc    Delete holiday
// @route   DELETE /api/admin/settings/holidays/:date
exports.deleteHoliday = async (req, res) => {
  try {
    const { date } = req.params;

    const settings = await Settings.getSettings();
    const holidayDate = new Date(date).toDateString();

    settings.holidays = settings.holidays.filter(
      h => new Date(h.date).toDateString() !== holidayDate
    );

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Holiday deleted successfully',
      data: settings.holidays
    });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting holiday',
      error: error.message
    });
  }
};