// import { io } from "../socket/socket.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// === CREATE GROUP CONVERSATION ===
export const createGroupConversation = async (req, res) => {
    try {
        const { groupName, groupPhoto, participants, admins } = req.body;
        const creatorId = req.user._id;

        // Validation
        if (!groupName || groupName.trim() === "") {
            return res.status(400).json({ error: "Group name is required" });
        }
        if (!participants || !Array.isArray(participants) || participants.length < 2) {
            return res.status(400).json({ error: "Group must have at least 2 participants" });
        }
        if (!participants.includes(creatorId.toString())) {
            participants.push(creatorId.toString()); // Auto-add creator
        }

        // Validate all participant IDs
        const validParticipants = [];
        const privateParticipants = [];
        for (const pid of participants) {
            if (!isValidObjectId(pid)) {
                return res.status(400).json({ error: `Invalid participant ID: ${pid}` });
            }
            const user = await User.findById(pid);
            if (!user) {
                return res.status(404).json({ error: `User not found: ${pid}` });
            }
            
            // If user is private and not the creator, don't add them directly
            if (user.isPrivate && pid !== creatorId.toString()) {
                privateParticipants.push(pid);
            } else {
                validParticipants.push(pid);
            }
        }

        // Set admins: default to creator if not specified
        let adminList = admins;
        if (!adminList || !Array.isArray(adminList) || adminList.length === 0) {
            adminList = [creatorId];
        } else {
            // Validate admin IDs and ensure they're in validParticipants
            const validAdmins = [];
            for (const aid of adminList) {
                if (isValidObjectId(aid) && validParticipants.includes(aid.toString())) {
                    validAdmins.push(aid);
                }
            }
            if (validAdmins.length === 0) {
                adminList = [creatorId];
            } else {
                adminList = validAdmins;
            }
        }

        // Create group conversation
        const newConversation = new Conversation({
            isGroup: true,
            groupName: groupName.trim(),
            groupPhoto: groupPhoto || "",
            participants: validParticipants,
            admins: adminList
        });

        await newConversation.save();
        
        // Send invitations to private users
        if (privateParticipants.length > 0) {
            const Invitation = (await import("../models/invitation.model.js")).default;
            const { io, getReceiverSocketId } = await import("../socket/socket.js");
            
            for (const pid of privateParticipants) {
                const invite = new Invitation({
                    sender: creatorId,
                    receiver: pid,
                    type: "group",
                    conversation: newConversation._id
                });
                await invite.save();
                
                const populatedInvite = await Invitation.findById(invite._id)
                    .populate("sender", "username fullName profilePic")
                    .populate("conversation", "groupName groupPhoto");
                    
                const receiverSocketId = getReceiverSocketId(pid);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("newInvitation", populatedInvite);
                }
            }
        }
        
        // Populate for response
        const populated = await Conversation.findById(newConversation._id)
            .populate("participants", "username email")
            .populate("admins", "username")
            .lean();

        res.status(201).json(populated);

    } catch (error) {
        console.error("❌ Error in createGroupConversation:", error.message);
        if (error.name === "ValidationError") {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Internal server error" });
    }
};

// === GET USER'S CONVERSATIONS ===
export const getUserConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const { includeGroups = "true", includePrivate = "true" } = req.query;

        const filters = { participants: userId };
        if (includeGroups === "false" && includePrivate === "false") {
            return res.status(400).json({ error: "Must include at least one conversation type" });
        }
        if (includeGroups === "false") filters.isGroup = false;
        if (includePrivate === "false") filters.isGroup = true;

        const conversations = await Conversation.find(filters)
            .populate("participants", "username email")
            .populate("admins", "username")
            .sort({ updatedAt: -1 })
            .lean();

        // Get latest message for each conversation (optional but useful for UI)
        const conversationsWithLastMessage = await Promise.all(
            conversations.map(async (conv) => {
                const lastMessage = await mongoose.model("Message")
                    .findOne({ conversationId: conv._id })
                    .sort({ createdAt: -1 })
                    .populate("senderId", "username")
                    .lean();
                return { ...conv, lastMessage };
            })
        );

        res.status(200).json(conversationsWithLastMessage);

    } catch (error) {
        console.error("❌ Error in getUserConversations:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === ADD USER TO GROUP (admins only) ===
export const addUserToGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { userId: userToAdd } = req.body;
        const requesterId = req.user._id;

        if (!isValidObjectId(conversationId) || !isValidObjectId(userToAdd)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }
        if (!conversation.isGroup) {
            return res.status(400).json({ error: "Cannot add users to private conversation" });
        }
        if (!conversation.admins.map(a => a.toString()).includes(requesterId.toString())) {
            return res.status(403).json({ error: "Only admins can add members" });
        }

        // Check if user already in group
        const participantIds = conversation.participants.map(p => p.toString());
        if (participantIds.includes(userToAdd)) {
            return res.status(400).json({ error: "User is already in this group" });
        }

        // Verify user exists
        const user = await User.findById(userToAdd);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Privacy Check: if user is private, send an invite instead of adding
        if (user.isPrivate) {
            const Invitation = (await import("../models/invitation.model.js")).default;
            const existingInvite = await Invitation.findOne({
                sender: requesterId,
                receiver: userToAdd,
                type: "group",
                conversation: conversationId,
                status: "pending"
            });

            if (!existingInvite) {
                const invite = new Invitation({
                    sender: requesterId,
                    receiver: userToAdd,
                    type: "group",
                    conversation: conversationId
                });
                await invite.save();
                
                // You could emit a socket event to the user here.
                const { io, getReceiverSocketId } = await import("../socket/socket.js");
                const populatedInvite = await Invitation.findById(invite._id)
                    .populate("sender", "username fullName profilePic")
                    .populate("conversation", "groupName groupPhoto");
                    
                const receiverSocketId = getReceiverSocketId(userToAdd.toString());
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("newInvitation", populatedInvite);
                }
            }
            
            return res.status(200).json({ 
                success: true, 
                message: "This account is private. A group invitation has been sent instead.",
                inviteSent: true
            });
        }

        // Add to participants
        conversation.participants.push(userToAdd);
        await conversation.save();

        const populated = await Conversation.findById(conversationId)
            .populate("participants", "username email")
            .lean();

        // Notify group members via socket
        const { io } = await import("../socket/socket.js");
        io.to(`conversation:${conversationId}`).emit("userAddedToGroup", {
            conversationId,
            addedUser: userToAdd,
            addedBy: requesterId,
            timestamp: new Date()
        });

        res.status(200).json({ 
            success: true, 
            message: "User added to group",
            conversation: populated
        });

    } catch (error) {
        console.error("❌ Error in addUserToGroup:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === REMOVE USER FROM GROUP (admins only) ===
export const removeUserFromGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { userId: userToRemove } = req.body;
        const requesterId = req.user._id;

        if (!isValidObjectId(conversationId) || !isValidObjectId(userToRemove)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
        if (!conversation.isGroup) return res.status(400).json({ error: "Cannot remove from private chat" });
        
        const adminIds = conversation.admins.map(a => a.toString());
        if (!adminIds.includes(requesterId.toString())) {
            return res.status(403).json({ error: "Only admins can remove members" });
        }
        // Prevent removing last admin or self if only admin
        if (adminIds.includes(userToRemove) && adminIds.length <= 1) {
            return res.status(400).json({ error: "Cannot remove the last admin" });
        }

        const initialLength = conversation.participants.length;
        conversation.participants = conversation.participants.filter(
            p => p.toString() !== userToRemove
        );
        
        if (conversation.participants.length === initialLength) {
            return res.status(400).json({ error: "User not found in group" });
        }

        await conversation.save();

        // Notify via socket
        io.to(`conversation:${conversationId}`).emit("userRemovedFromGroup", {
            conversationId,
            removedUser: userToRemove,
            removedBy: requesterId,
            timestamp: new Date()
        });

        res.status(200).json({ 
            success: true, 
            message: "User removed from group" 
        });

    } catch (error) {
        console.error("❌ Error in removeUserFromGroup:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

// === UPDATE GROUP (admin only — rename, change photo) ===
export const updateGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { groupName, groupPhoto } = req.body;
        const requesterId = req.user._id;

        if (!isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Invalid conversationId" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
        if (!conversation.isGroup) return res.status(400).json({ error: "Not a group conversation" });

        const adminIds = conversation.admins.map(a => a.toString());
        if (!adminIds.includes(requesterId.toString())) {
            return res.status(403).json({ error: "Only admins can update group settings" });
        }

        if (groupName && groupName.trim()) conversation.groupName = groupName.trim();
        if (groupPhoto !== undefined) conversation.groupPhoto = groupPhoto;

        await conversation.save();

        const populated = await Conversation.findById(conversationId)
            .populate("participants", "username fullName profilePic isPrivate")
            .populate("admins", "username fullName profilePic")
            .lean();

        // Notify all group members
        const { io } = await import("../socket/socket.js");
        io.to(`conversation:${conversationId}`).emit("groupUpdated", {
            conversationId,
            groupName: conversation.groupName,
            groupPhoto: conversation.groupPhoto,
            updatedBy: requesterId
        });

        res.status(200).json({ success: true, conversation: populated });
    } catch (error) {
        console.error("❌ Error in updateGroup:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};
export const leaveGroup = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(conversationId)) {
            return res.status(400).json({ error: "Invalid conversationId" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
        if (!conversation.isGroup) return res.status(400).json({ error: "Cannot leave a private conversation" });
        
        const participantIds = conversation.participants.map(p => p.toString());
        if (!participantIds.includes(userId.toString())) {
            return res.status(403).json({ error: "Not a member of this group" });
        }

        // Prevent leaving if last participant
        if (conversation.participants.length <= 1) {
            // Delete the group if last person leaves
            await Conversation.findByIdAndDelete(conversationId);
            
            io.to(`conversation:${conversationId}`).emit("groupDeleted", {
                conversationId,
                timestamp: new Date()
            });
            
            return res.status(200).json({ 
                success: true, 
                message: "Group deleted (last member left)" 
            });
        }

        // Remove user from participants and admins if present
        conversation.participants = conversation.participants.filter(
            p => p.toString() !== userId.toString()
        );
        conversation.admins = conversation.admins.filter(
            a => a.toString() !== userId.toString()
        );
        
        await conversation.save();

        // Notify group
        io.to(`conversation:${conversationId}`).emit("userLeftGroup", {
            conversationId,
            leftUser: userId,
            timestamp: new Date()
        });

        res.status(200).json({ 
            success: true, 
            message: "Successfully left the group" 
        });

    } catch (error) {
        console.error("❌ Error in leaveGroup:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};