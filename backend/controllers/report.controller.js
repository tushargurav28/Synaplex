import Report from "../models/report.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";

export const reportMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reason, description } = req.body;
    const reporterId = req.user._id;

    if (!reason) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Verify reporter is in the conversation
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    const participantIds = conversation.participants.map(p => p.toString());
    if (!participantIds.includes(reporterId.toString())) {
      return res.status(403).json({ error: "Not authorized to report this message" });
    }

    const report = new Report({
      reporter: reporterId,
      reportedUser: message.senderId,
      message: messageId,
      conversationId: message.conversationId,
      reason,
      description: description?.trim().slice(0, 1000)
    });

    await report.save();

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      reportId: report._id
    });

  } catch (error) {
    console.error("❌ Report message error:", error.message);
    res.status(500).json({ error: "Failed to submit report" });
  }
};