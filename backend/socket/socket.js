import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [process.env.CLIENT_URL || "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
});

// Map: userId → socketId (for direct messaging)
const userSocketMap = {}; 

/**
 * Get socket ID for a given user ID
 * @param {string} userId 
 * @returns {string|undefined} socketId
 */
export const getReceiverSocketId = (userId) => {
    return userSocketMap[userId];
};

/**
 * Get all socket IDs for participants in a conversation
 * @param {Array<string>} participantIds 
 * @param {string} excludeSocketId - Optional: exclude sender's socket
 * @returns {Array<string>} Array of socket IDs
 */
export const getParticipantSocketIds = (participantIds, excludeSocketId = null) => {
    return participantIds
        .map(id => userSocketMap[id])
        .filter(socketId => socketId && socketId !== excludeSocketId);
};

io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    const userId = socket.handshake.query.userId;
    
    if (userId && userId !== "undefined") {
        userSocketMap[userId] = socket.id;
        // Broadcast updated online users list to all clients
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }

    // === TYPING INDICATORS ===
    socket.on("typing", ({ senderId, receiverId, conversationId }) => {
        // For private chat: forward to receiver if online
        if (receiverId) {
            const receiverSocketId = userSocketMap[receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("typing", { senderId, conversationId });
            }
        }
        // For group chat: forward to all other participants in room
        if (conversationId) {
            socket.to(`conversation:${conversationId}`).emit("typing", { senderId, conversationId });
        }
    });

    socket.on("stopTyping", ({ senderId, receiverId, conversationId }) => {
        if (receiverId) {
            const receiverSocketId = userSocketMap[receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("stopTyping", { senderId, conversationId });
            }
        }
        if (conversationId) {
            socket.to(`conversation:${conversationId}`).emit("stopTyping", { senderId, conversationId });
        }
    });

    // === MESSAGE DELIVERY ACKNOWLEDGMENT ===
    socket.on("messageReceived", async ({ messageId, conversationId }) => {
        try {
            const Message = await import("../models/message.model.js");
            
            const message = await Message.default.findById(messageId);
            if (!message) return;

            // Only update if message is still 'sent' (not already delivered/read)
            if (message.status === 'sent') {
                message.status = 'delivered';
                await message.save();
                
                // Notify sender that message was delivered
                const senderSocketId = userSocketMap[message.senderId.toString()];
                if (senderSocketId) {
                    io.to(senderSocketId).emit("messageDelivered", {
                        messageId,
                        conversationId,
                        updatedAt: message.updatedAt
                    });
                }
            }
        } catch (error) {
            console.error("❌ Error updating message status:", error);
        }
    });

    // === MARK MESSAGES AS READ ===
    socket.on("messagesRead", ({ conversationId, messageIds }) => {
        // Broadcast to all participants that messages were read
        // Actual DB update should be done via REST API PATCH /api/messages/read
        io.to(`conversation:${conversationId}`).emit("messagesRead", {
            conversationId,
            messageIds,
            readBy: userId,
            timestamp: new Date()
        });
    });

    // === JOIN/LEAVE CONVERSATION ROOM (for group chats and real-time updates) ===
    socket.on("joinConversation", (conversationId) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`🔗 Socket ${socket.id} joined conversation room: ${conversationId}`);
    });

    socket.on("leaveConversation", (conversationId) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`🔌 Socket ${socket.id} left conversation room: ${conversationId}`);
    });

    // === WEBRTC CALLING SIGNALING ===
    // Caller initiates call to receiver
    socket.on("callUser", async ({ from, to, conversationId, signalData, type = "video", callerName }) => {
        const receiverSocketId = userSocketMap[to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("incomingCall", {
                from,
                conversationId,
                signalData,
                type,
                callerName,
                timestamp: new Date()
            });
        }

        // Record the call log
        try {
            const CallLog = (await import("../models/callLog.model.js")).default;
            const log = new CallLog({
                caller: from,
                receiver: to,
                conversationId: conversationId || null,
                type,
                status: "ongoing",
                startTime: new Date()
            });
            await log.save();
            // Store the log ID so we can update it later
            // Attach to the socket's in-memory state using a Map keyed by "from-to"
            socket._activeCallLogId = log._id.toString();
        } catch (e) {
            console.error("[CallLog] Failed to create log:", e.message);
        }
    });

    // Receiver accepts the call
    socket.on("acceptCall", async ({ from, to, conversationId, signalData }) => {
        const callerSocketId = userSocketMap[from];
        if (callerSocketId) {
            io.to(callerSocketId).emit("callAccepted", {
                from: to,
                conversationId,
                signalData
            });
        }

        // Update call log: mark as answered
        try {
            const CallLog = (await import("../models/callLog.model.js")).default;
            await CallLog.findOneAndUpdate(
                { caller: from, receiver: to, status: "ongoing" },
                { status: "answered", answeredAt: new Date() },
                { sort: { startTime: -1 } }
            );
        } catch (e) {
            console.error("[CallLog] Failed to mark answered:", e.message);
        }
    });

    // Receiver rejects the call
    socket.on("rejectCall", async ({ from, to, conversationId }) => {
        const callerSocketId = userSocketMap[from];
        if (callerSocketId) {
            io.to(callerSocketId).emit("callRejected", {
                from: to,
                conversationId,
                timestamp: new Date()
            });
        }

        // Update call log: mark as rejected
        try {
            const CallLog = (await import("../models/callLog.model.js")).default;
            await CallLog.findOneAndUpdate(
                { caller: from, receiver: to, status: "ongoing" },
                { status: "rejected", endTime: new Date() },
                { sort: { startTime: -1 } }
            );
        } catch (e) {
            console.error("[CallLog] Failed to mark rejected:", e.message);
        }
    });

    // Either party ends the call
    socket.on("endCall", async ({ from, to, conversationId }) => {
        const fromSocket = userSocketMap[from];
        const toSocket = userSocketMap[to];

        if (fromSocket) io.to(fromSocket).emit("callEnded", { by: to, conversationId });
        if (toSocket)   io.to(toSocket).emit("callEnded", { by: from, conversationId });

        // Update call log: set end time and compute duration
        try {
            const CallLog = (await import("../models/callLog.model.js")).default;
            const log = await CallLog.findOne(
                {
                    $or: [
                        { caller: from, receiver: to },
                        { caller: to, receiver: from }
                    ],
                    status: { $in: ["ongoing", "answered"] }
                },
                null,
                { sort: { startTime: -1 } }
            );
            if (log) {
                const endTime = new Date();
                const ref = log.answeredAt || log.startTime;
                const duration = Math.round((endTime - ref) / 1000);
                // If ended before answer, it's missed
                const finalStatus = log.status === "answered" ? "answered" : "missed";
                log.status = finalStatus;
                log.endTime = endTime;
                log.duration = duration;
                await log.save();
            }
        } catch (e) {
            console.error("[CallLog] Failed to update on end:", e.message);
        }
    });

    // Exchange ICE candidates for NAT traversal
    socket.on("iceCandidate", ({ from, to, candidate }) => {
        const receiverSocketId = userSocketMap[to];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("iceCandidate", { from, candidate });
        }
    });

    // === NOTIFICATION EVENTS ===
    // Client requests browser notification permission status
    socket.on("notificationPermission", ({ granted }) => {
        // Store preference for future notification logic if needed
        console.log(`🔔 Notification permission for ${userId}: ${granted}`);
    });

    // === DISCONNECT HANDLER ===
    socket.on("disconnect", async () => {
        console.log("❌ User disconnected:", socket.id);
        
        if (userId && userSocketMap[userId] === socket.id) {
            delete userSocketMap[userId];
            io.emit("getOnlineUsers", Object.keys(userSocketMap));

            try {
                const User = (await import("../models/user.model.js")).default;
                const lastSeenDate = new Date();
                await User.findByIdAndUpdate(userId, { lastSeen: lastSeenDate });
                
                // Emit event to notify clients about the user's last seen update
                io.emit("userStatusChanged", { userId, status: "offline", lastSeen: lastSeenDate });
            } catch (error) {
                console.error("Error updating last seen:", error);
            }
        }
    });
});

export { app, io, server };