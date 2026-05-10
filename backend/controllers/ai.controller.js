import aiService from "../services/ai.service.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";

export const aiChat = async (req, res) => {
  try {
    const { message, conversationId, context } = req.body;
    const userId = req.user._id;

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Initialize AI service if not already done
    if (!aiService.initialized) {
      const initialized = aiService.initialize();
      if (!initialized) {
        return res.status(503).json({ 
          error: "AI service unavailable. Please configure OPENAI_API_KEY." 
        });
      }
    }

    // Get AI response
    const aiResult = await aiService.chat({
      message: message.trim(),
      context: context || []
    });

    // If conversationId provided, store the exchange
    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // Verify user is participant
      const participantIds = conversation.participants.map(p => p.toString());
      if (!participantIds.includes(userId.toString())) {
        return res.status(403).json({ error: "Not authorized for this conversation" });
      }

      // Store user message
      const userMsg = new Message({
        senderId: userId,
        conversationId,
        message: message.trim(),
        type: "text",
        status: "sent"
      });
      
      // Store AI response
      const aiMsg = new Message({
        senderId: null, // Null indicates AI/system message
        conversationId,
        message: aiResult.response,
        type: "text",
        status: "delivered"
      });

      await Promise.all([
        userMsg.save(),
        aiMsg.save(),
        Conversation.findByIdAndUpdate(conversationId, {
          $push: { messages: [userMsg._id, aiMsg._id] }
        })
      ]);

      // Populate for response
      const populatedAiMsg = await Message.findById(aiMsg._id)
        .populate("senderId", "username profilePic")
        .lean();

      return res.status(200).json({
        success: true,
        message: populatedAiMsg,
        usage: aiResult.usage
      });
    }

    // Standalone AI response (no conversation storage)
    res.status(200).json({
      success: true,
      response: aiResult.response,
      usage: aiResult.usage
    });

  } catch (error) {
    console.error("❌ AI chat error:", error.message);
    
    if (error.message.includes("API key")) {
      return res.status(503).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Failed to process AI request",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};