const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const { writeLimiter } = require("../utils/rateLimiter");
const User = require("../models/User");

// ================= UPDATE MY PROFILE =================
router.put("/update-me", protect, writeLimiter, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, email },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Profile update failed"
    });
  }
});

module.exports = router;
