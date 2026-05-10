import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io, getParticipantSocketIds } from "../socket/socket.js";
import mongoose from "mongoose";

// === HELPER: Validate ObjectId ===
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// === SEND MESSAGE (supports private + group) ===
export const sendMessage = async (req, res) => {
    try {
        const { message: text, conversationId, attachments, type, codeLanguage } = req.body;
        const senderId = req.user._id;

        // Validation: require text OR attachments
        const hasText = text && text.trim() !== "";
        const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

        if (!hasText && !hasAttachments) {
            return res.status(400).json({ error: "Message content or attachment is required" });
        }
        if (!conversationId || !isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Valid conversationId is required" });
        }

        // Verify conversation exists and user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }
        
        const participantIds = conversation.participants.map(p => p.toString());
        if (!participantIds.includes(senderId.toString())) {
            return res.status(403).json({ error: "Not authorized to send messages to this conversation" });
        }

        // For private chats: determine receiverId from participants
        let receiverId = null;
        if (!conversation.isGroup) {
            receiverId = participantIds.find(id => id !== senderId.toString());
            if (!receiverId) {
                return res.status(400).json({ error: "Invalid private conversation participants" });
            }
            
            // Privacy check
            const User = mongoose.model("User");
            const receiverUser = await User.findById(receiverId);
            if (receiverUser && receiverUser.isPrivate) {
                // If private, check if they have an accepted invitation from the sender
                const Invitation = mongoose.model("Invitation");
                const acceptedInvite = await Invitation.findOne({
                    $or: [
                        { sender: senderId, receiver: receiverId, status: "accepted" },
                        { sender: receiverId, receiver: senderId, status: "accepted" }
                    ]
                });
                
                // Allow if they have an accepted invite OR if they have prior messages in this conversation
                const hasPriorMessages = conversation.messages && conversation.messages.length > 0;
                
                if (!acceptedInvite && !hasPriorMessages) {
                    return res.status(403).json({ 
                        error: "This account is private. You must send an invitation first.",
                        requiresInvitation: true
                    });
                }
            }
        }

        // Create new message
        const resolvedType = type || (hasAttachments ? "file" : "text");
        const newMessage = new Message({
            senderId,
            reciverId: receiverId, // Keep field name for backward compat
            conversationId,
            message: hasText ? text.trim() : "",
            type: resolvedType,
            codeLanguage: resolvedType === "code" ? (codeLanguage || "plaintext") : undefined,
            attachments: hasAttachments ? attachments : [],
            status: "sent"
        });

        // Save message and update conversation reference
        await Promise.all([
            newMessage.save(),
            Conversation.findByIdAndUpdate(conversationId, {
                $push: { messages: newMessage._id }
            })
        ]);

        // Populate sender info for response
        const populatedMessage = await Message.findById(newMessage._id)
            .populate("senderId", "username fullName email profilePic")
            .lean();

        // === SOCKET: Broadcast to recipients ===
        if (conversation.isGroup) {
            // For groups: emit to conversation room (members must join room)
            io.to(`conversation:${conversationId}`).emit("newMessage", populatedMessage);
            
            // Also emit to online participants directly as fallback
            const onlineSockets = getParticipantSocketIds(participantIds);
            onlineSockets.forEach(socketId => {
                io.to(socketId).emit("newMessage", populatedMessage);
            });
        } else {
            // For private: emit directly to receiver if online
            const receiverSocketId = getReceiverSocketId(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("newMessage", populatedMessage);
                
                // Auto-mark as delivered if receiver is online
                newMessage.status = "delivered";
                await newMessage.save();
                io.to(req.user._id.toString()).emit("messageDelivered", {
                    messageId: newMessage._id,
                    conversationId,
                    updatedAt: newMessage.updatedAt
                });
            }
        }

        res.status(201).json(populatedMessage);

    } catch (error) {
        console.error("Error in sendMessage:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === GET MESSAGES WITH PAGINATION ===
export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 30 } = req.query;
        const senderId = req.user._id;

        if (!isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Invalid conversationId" });
        }

        // Verify user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }
        
        const participantIds = conversation.participants.map(p => p.toString());
        if (!participantIds.includes(senderId.toString())) {
            return res.status(403).json({ error: "Not authorized to access this conversation" });
        }

        // Parse pagination params
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Cap at 100
        const skip = (pageNum - 1) * limitNum;

        // Query messages: newest first in DB
        const [messages, total] = await Promise.all([
            Message.find({ conversationId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate("senderId", "username fullName email profilePic")
                .lean(),
            Message.countDocuments({ conversationId })
        ]);

        // Reverse to chronological order for frontend
        const chronologicalMessages = messages.reverse();

        res.status(200).json({
            messages: chronologicalMessages,
            page: pageNum,
            limit: limitNum,
            total,
            hasMore: skip + messages.length < total
        });

    } catch (error) {
        console.error("Error in getMessages:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === MARK MESSAGES AS READ ===
export const markMessagesRead = async (req, res) => {
    try {
        const { conversationId } = req.body;
        const userId = req.user._id;

        if (!conversationId || !isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Valid conversationId is required" });
        }

        // Verify participation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }
        
        if (!conversation.participants.map(p => p.toString()).includes(userId.toString())) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // Update all unread messages from OTHER senders to 'read'
        const result = await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: userId },
                status: { $in: ["sent", "delivered"] }
            },
            { $set: { status: "read" } }
        );

        // Emit socket event to notify other participants
        io.to(`conversation:${conversationId}`).emit("messagesRead", {
            conversationId,
            readBy: userId,
            timestamp: new Date(),
            updatedCount: result.modifiedCount
        });

        res.status(200).json({ 
            success: true, 
            updatedCount: result.modifiedCount,
            message: "Messages marked as read"
        });

    } catch (error) {
        console.error("Error in markMessagesRead:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === EDIT MESSAGE (own messages only) ===
export const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { message: newText } = req.body;
        const userId = req.user._id;

        if (!isValidObjectId(messageId)) {
            return res.status(400).json({ error: "Invalid messageId" });
        }
        if (!newText || newText.trim() === "") {
            return res.status(400).json({ error: "New message content is required" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Can only edit your own messages" });
        }
        if (message.deleted) {
            return res.status(400).json({ error: "Cannot edit a deleted message" });
        }

        // Update message
        message.message = newText.trim();
        message.edited = true;
        await message.save();

        // Populate for response
        const populatedMessage = await Message.findById(messageId)
            .populate("senderId", "username email")
            .lean();

        // Broadcast edit event
        io.to(`conversation:${message.conversationId}`).emit("messageEdited", {
            messageId: message._id,
            conversationId: message.conversationId,
            newMessage: populatedMessage.message,
            editedAt: message.updatedAt,
            editedBy: userId
        });

        res.status(200).json(populatedMessage);

    } catch (error) {
        console.error("Error in editMessage:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === DELETE MESSAGE (soft delete, own messages only) ===
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(messageId)) {
            return res.status(400).json({ error: "Invalid messageId" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Can only delete your own messages" });
        }

        // Soft delete: preserve for audit, hide content
        message.deleted = true;
        message.message = "";
        message.status = "read"; // Prevent further status updates
        await message.save();

        // Broadcast delete event
        io.to(`conversation:${message.conversationId}`).emit("messageDeleted", {
            messageId: message._id,
            conversationId: message.conversationId,
            deletedAt: new Date(),
            deletedBy: userId
        });

        res.status(200).json({ 
            success: true, 
            message: "Message deleted successfully",
            messageId 
        });

    } catch (error) {
        console.error("Error in deleteMessage:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === LEGACY: Get messages by user ID (backward compatible) ===
export const getMessagesByUserId = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const senderId = req.user._id;

        if (!isValidObjectId(userToChatId)) {
            return res.status(400).json({ error: "Invalid userId" });
        }

        // Find or create private conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, userToChatId] },
            isGroup: false
        });

        if (!conversation) {
            return res.status(200).json([]); // No history yet
        }

        // Use new paginated logic with default params
        req.params.conversationId = conversation._id;
        req.query.page = 1;
        req.query.limit = 50;
        
        return getMessages(req, res);

    } catch (error) {
        console.error("Error in getMessagesByUserId:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};