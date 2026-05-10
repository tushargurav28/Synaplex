import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { uploadSingle, validateUpload } from "../middleware/upload.js";

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -passwordHistory -activeSessions -failedLoginAttempts -lockUntil")
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("❌ Get profile error:", error.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, username, bio, isPrivate, allowMessagesFrom, lastSeenVisibility } = req.body;
    const userId = req.user._id;

    const updateData = {};
    
    if (fullName) updateData.fullName = fullName.trim();
    if (bio !== undefined) updateData.bio = bio.trim().slice(0, 500);
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;
    if (allowMessagesFrom) updateData.allowMessagesFrom = allowMessagesFrom;
    if (lastSeenVisibility) updateData.lastSeenVisibility = lastSeenVisibility;
    
    // Handle username change with uniqueness check
    if (username) {
      const newUsername = username.toLowerCase().trim();
      const existing = await User.findOne({ 
        username: newUsername, 
        _id: { $ne: userId } 
      });
      
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      updateData.username = newUsername;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -passwordHistory -activeSessions");

    res.status(200).json({ 
      success: true, 
      message: "Profile updated successfully",
      user: updatedUser 
    });

  } catch (error) {
    console.error("❌ Update profile error:", error.message);
    
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ error: "Failed to update profile" });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isMatch = await user.correctPassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Update password (triggers pre-save hook for hashing/history)
    user.password = newPassword;
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Password updated successfully" 
    });

  } catch (error) {
    console.error("❌ Update password error:", error.message);
    
    if (error.message === "Cannot reuse a previous password") {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ error: "Failed to update password" });
  }
};

export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Store as a relative path so it works with Vite proxy in dev and nginx/CDN in prod
    const profilePicUrl = `/uploads/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePic: profilePicUrl },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile picture updated",
      user: { profilePic: user.profilePic }
    });

  } catch (error) {
    console.error("❌ Update avatar error:", error.message);
    res.status(500).json({ error: "Failed to update profile picture" });
  }
};