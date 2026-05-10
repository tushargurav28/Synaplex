import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import mongoose from "mongoose";

export const searchMessages = async (req, res) => {
  try {
    const { conversationId, q, userId, from, to } = req.query;
    const currentUserId = req.user._id;

    if (!q || q.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Valid conversationId is required" });
    }

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    const participantIds = conversation.participants.map(p => p.toString());
    if (!participantIds.includes(currentUserId.toString())) {
      return res.status(403).json({ error: "Not authorized to search this conversation" });
    }

    // Build search query
    const searchQuery = {
      conversationId,
      $text: { $search: q.trim() },
      deleted: false
    };

    // Optional filters
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      searchQuery.senderId = userId;
    }
    if (from || to) {
      searchQuery.createdAt = {};
      if (from) searchQuery.createdAt.$gte = new Date(from);
      if (to) searchQuery.createdAt.$lte = new Date(to);
    }

    const messages = await Message.find(searchQuery)
      .populate("senderId", "username profilePic")
      .select("message senderId createdAt conversationId")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format results with snippet highlighting
    const results = messages.map(msg => {
      const snippet = generateSnippet(msg.message, q);
      return {
        _id: msg._id,
        sender: msg.senderId,
        createdAt: msg.createdAt,
        conversationId: msg.conversationId,
        message: msg.message,
        snippet
      };
    });

    res.status(200).json({
      success: true,
      query: q,
      results,
      count: results.length
    });

  } catch (error) {
    console.error("❌ Search messages error:", error.message);
    res.status(500).json({ error: "Search failed" });
  }
};

// Helper: generate highlighted snippet
const generateSnippet = (text, query, length = 100) => {
  if (!text) return "";
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) return text.slice(0, length) + (text.length > length ? "..." : "");
  
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + lowerQuery.length + 30);
  let snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  
  // Simple highlighting marker (frontend can style [HIGHLIGHT]...[/HIGHLIGHT])
  const highlightStart = index - start;
  const highlightEnd = highlightStart + query.length;
  snippet = snippet.slice(0, highlightStart) + "[HIGHLIGHT]" + 
            snippet.slice(highlightStart, highlightEnd) + "[/HIGHLIGHT]" + 
            snippet.slice(highlightEnd);
  
  return snippet;
};