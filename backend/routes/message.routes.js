import express from "express";
import { 
    sendMessage, 
    getMessages, 
    markMessagesRead,
    editMessage,
    deleteMessage,
    getMessagesByUserId 
} from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// === NEW PRIMARY ROUTES (conversation-based) ===

// Get paginated messages for a conversation
router.get("/conversation/:conversationId", 
    protectRoute, 
    validateObjectId("conversationId"), 
    getMessages
);

// Send message to conversation (private or group)
router.post("/send", 
    protectRoute, 
    sendMessage
);

// Mark messages as read in a conversation
router.patch("/read", 
    protectRoute, 
    markMessagesRead
);

// Get unread messages grouped by conversation
router.get("/unread",
    protectRoute,
    async (req, res) => {
        try {
            const Message = (await import("../models/message.model.js")).default;
            const Conversation = (await import("../models/conversation.model.js")).default;
            
            const userId = req.user._id;
            
            // Find conversations user is part of
            const conversations = await Conversation.find({ participants: userId }).select("_id").lean();
            const conversationIds = conversations.map(c => c._id);
            
            // Find unread messages from OTHER senders
            const unreadMessages = await Message.find({
                conversationId: { $in: conversationIds },
                senderId: { $ne: userId },
                status: { $in: ["sent", "delivered"] }
            })
            .populate("senderId", "username fullName profilePic")
            .populate("conversationId", "isGroup groupName groupPhoto")
            .sort({ createdAt: -1 })
            .lean();
            
            res.status(200).json(unreadMessages);
        } catch (error) {
            console.error("Error fetching unread messages:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// Edit own message
router.patch("/:messageId", 
    protectRoute, 
    validateObjectId("messageId"),
    editMessage
);

// Delete own message (soft delete)
router.delete("/:messageId", 
    protectRoute, 
    validateObjectId("messageId"),
    deleteMessage
);

// === LEGACY ROUTES (backward compatible - deprecate in future) ===

// Get messages by user ID (creates/finds private conversation)
router.get("/:id", 
    protectRoute, 
    validateObjectId("id"),
    getMessagesByUserId
);

// Send message to user ID (legacy private chat)
router.post("/send/:id", 
    protectRoute, 
    validateObjectId("id"),
    async (req, res, next) => {
        // Convert legacy route to new format
        const { id: receiverId } = req.params;
        
        // Find or create private conversation
        const Conversation = await import("../models/conversation.model.js");
        let conversation = await Conversation.default.findOne({
            participants: { $all: [req.user._id, receiverId] },
            isGroup: false
        });
        
        if (!conversation) {
            conversation = await Conversation.default.create({
                participants: [req.user._id, receiverId],
                isGroup: false
            });
        }
        
        // Forward to new sendMessage with conversationId (preserve all body fields)
        req.body.conversationId = conversation._id;
        next();
    },
    sendMessage
);

export default router;