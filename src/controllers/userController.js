const User = require("../models/User");

// ================= UPDATE MY PROFILE =================


// ================= UPDATE MY PROFILE =================
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;   // ⭐ IMPORTANT (Mongo user id)

    const { name, email } = req.body;

    // ===== VALIDATION =====
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and Email are required",
      });
    }

    // ===== UPDATE USER =====
    const user = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true }
    ).select("-password");   // ⭐ never send password

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });

  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({
      success: false,
      message: "Profile update failed",
    });
  }
};
