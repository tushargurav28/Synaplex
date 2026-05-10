import Invitation from "../models/invitation.model.js";
import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import { io, getReceiverSocketId } from "../socket/socket.js";
import mongoose from "mongoose";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const sendInvitation = async (req, res) => {
    try {
        const { receiverId, type, conversationId } = req.body;
        const senderId = req.user._id;

        if (!isValidObjectId(receiverId)) {
            return res.status(400).json({ error: "Invalid receiver ID" });
        }

        if (type === "group" && !isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Conversation ID required for group invites" });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ error: "Receiver not found" });
        }

        // Check if an invite already exists
        const existingInvite = await Invitation.findOne({
            sender: senderId,
            receiver: receiverId,
            type,
            ...(conversationId && { conversation: conversationId }),
            status: "pending"
        });

        if (existingInvite) {
            return res.status(400).json({ error: "Invitation already sent" });
        }

        const invitation = new Invitation({
            sender: senderId,
            receiver: receiverId,
            type,
            conversation: conversationId || null
        });

        await invitation.save();

        const populatedInvite = await Invitation.findById(invitation._id)
            .populate("sender", "username fullName profilePic")
            .populate("conversation", "groupName groupPhoto");

        // Notify receiver
        const receiverSocketId = getReceiverSocketId(receiverId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newInvitation", populatedInvite);
        }

        res.status(201).json({ success: true, invitation: populatedInvite });
    } catch (error) {
        console.error("Error in sendInvitation:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getPendingInvitations = async (req, res) => {
    try {
        const userId = req.user._id;

        const invitations = await Invitation.find({ receiver: userId, status: "pending" })
            .populate("sender", "username fullName profilePic")
            .populate("conversation", "groupName groupPhoto")
            .sort({ createdAt: -1 });

        res.status(200).json(invitations);
    } catch (error) {
        console.error("Error in getPendingInvitations:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const respondToInvitation = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'accepted' or 'rejected'
        const userId = req.user._id;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid invitation ID" });
        }

        if (!["accepted", "rejected"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const invitation = await Invitation.findById(id);
        if (!invitation) {
            return res.status(404).json({ error: "Invitation not found" });
        }

        if (invitation.receiver.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Not authorized to respond to this invitation" });
        }

        invitation.status = status;
        await invitation.save();

        // If accepted and it's a group invite, add them to the group
        if (status === "accepted" && invitation.type === "group" && invitation.conversation) {
            const conversation = await Conversation.findById(invitation.conversation);
            if (conversation && !conversation.participants.includes(userId)) {
                conversation.participants.push(userId);
                await conversation.save();
                
                io.to(`conversation:${conversation._id}`).emit("userAddedToGroup", {
                    conversationId: conversation._id,
                    addedUser: userId,
                    addedBy: invitation.sender,
                    timestamp: new Date()
                });
            }
        }

        // Notify sender about the response
        const senderSocketId = getReceiverSocketId(invitation.sender.toString());
        if (senderSocketId) {
            io.to(senderSocketId).emit("invitationResponse", {
                invitationId: invitation._id,
                status,
                receiver: userId
            });
        }

        res.status(200).json({ success: true, message: `Invitation ${status}` });
    } catch (error) {
        console.error("Error in respondToInvitation:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};
