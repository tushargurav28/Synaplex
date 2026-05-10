import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import Report from "../models/report.model.js";

export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }
    if (status === "active" || status === "inactive") {
      query.isActive = status === "active";
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -passwordHistory -activeSessions -failedLoginAttempts")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("❌ Admin get users error:", error.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // "activate" or "deactivate"

    if (!["activate", "deactivate"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin" && action === "deactivate") {
      return res.status(403).json({ error: "Cannot deactivate admin users" });
    }

    user.isActive = action === "activate";
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${action}d successfully`,
      user: { _id: user._id, isActive: user.isActive }
    });

  } catch (error) {
    console.error("❌ Admin update user status error:", error.message);
    res.status(500).json({ error: "Failed to update user status" });
  }
};

export const getReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "open" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      Report.find({ status })
        .populate("reporter", "username profilePic")
        .populate("reportedUser", "username profilePic")
        .populate("message", "message conversationId")
        .populate("resolvedBy", "username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Report.countDocuments({ status })
    ]);

    res.status(200).json({
      success: true,
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("❌ Admin get reports error:", error.message);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const resolveReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: "resolve" or "dismiss"

    if (!["resolve", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    report.status = action === "resolve" ? "resolved" : "dismissed";
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    if (notes) report.adminNotes = notes.trim().slice(0, 500);
    
    await report.save();

    res.status(200).json({
      success: true,
      message: `Report ${action}d successfully`,
      report: { _id: report._id, status: report.status }
    });

  } catch (error) {
    console.error("❌ Admin resolve report error:", error.message);
    res.status(500).json({ error: "Failed to resolve report" });
  }
};

export const getMetrics = async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      deactivatedUsers,
      totalMessages,
      totalConversations,
      openReports,
      messagesLast24h
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      Message.countDocuments(),
      Conversation.countDocuments(),
      Report.countDocuments({ status: "open" }),
      Message.countDocuments({ createdAt: { $gte: yesterday } })
    ]);

    res.status(200).json({
      success: true,
      metrics: {
        totalUsers,
        activeUsers,
        deactivatedUsers,
        totalMessages,
        totalConversations,
        openReports,
        messagesLast24h,
        timestamp: now
      }
    });

  } catch (error) {
    console.error("❌ Admin get metrics error:", error.message);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};