import Agent from "../models/agent.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import nvidiaService from "../services/nvidia.service.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

// ===================== CRUD =====================

/**
 * Create a new AI agent
 */
export const createAgent = async (req, res) => {
    try {
        const { name, instructions, description, avatar, canSearchWeb } = req.body;
        const userId = req.user._id;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: "Agent name must be at least 2 characters" });
        }

        // Auto-generate trigger name from name
        const triggerName = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
        
        if (!triggerName) {
            return res.status(400).json({ error: "Agent name must contain alphanumeric characters" });
        }

        // Check uniqueness
        const existing = await Agent.findOne({ triggerName });
        if (existing) {
            return res.status(409).json({ error: `Agent trigger name "@${triggerName}" already taken. Try a different name.` });
        }

        const agent = new Agent({
            name: name.trim(),
            triggerName,
            createdBy: userId,
            instructions: instructions?.trim() || "",
            description: description?.trim() || "",
            avatar: avatar || "🤖",
            canSearchWeb: canSearchWeb !== false,
        });

        await agent.save();

        res.status(201).json({ 
            success: true, 
            agent: await agent.populate("createdBy", "username fullName profilePic")
        });
    } catch (error) {
        console.error("❌ createAgent error:", error.message);
        if (error.code === 11000) {
            return res.status(409).json({ error: "Agent name already taken" });
        }
        res.status(500).json({ error: "Failed to create agent" });
    }
};

/**
 * Get all agents created by the logged-in user
 */
export const getMyAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ createdBy: req.user._id, isActive: true })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, agents });
    } catch (error) {
        console.error("❌ getMyAgents error:", error.message);
        res.status(500).json({ error: "Failed to fetch agents" });
    }
};

/**
 * Get agents available for a specific group
 */
export const getGroupAgents = async (req, res) => {
    try {
        const { groupId } = req.params;
        
        const conv = await Conversation.findById(groupId);
        if (!conv || !conv.isGroup) {
            return res.status(404).json({ error: "Group not found" });
        }
        
        // Check membership
        const isMember = conv.participants.some(p => p.toString() === req.user._id.toString());
        if (!isMember) {
            return res.status(403).json({ error: "Not a member of this group" });
        }

        const agents = await Agent.find({ 
            addedToGroups: groupId,
            isActive: true 
        })
        .populate("createdBy", "username fullName")
        .lean();

        res.json({ success: true, agents });
    } catch (error) {
        console.error("❌ getGroupAgents error:", error.message);
        res.status(500).json({ error: "Failed to fetch group agents" });
    }
};

/**
 * Get all available agents (for adding to groups)
 */
export const getAllAgents = async (req, res) => {
    try {
        const { groupId } = req.query;
        
        let agents;
        if (groupId) {
            // Agents NOT yet in the group
            agents = await Agent.find({ 
                isActive: true,
                addedToGroups: { $ne: groupId }
            })
            .populate("createdBy", "username fullName profilePic")
            .lean();
        } else {
            agents = await Agent.find({ isActive: true })
                .populate("createdBy", "username fullName profilePic")
                .lean();
        }

        res.json({ success: true, agents });
    } catch (error) {
        console.error("❌ getAllAgents error:", error.message);
        res.status(500).json({ error: "Failed to fetch agents" });
    }
};

/**
 * Update an agent (only by creator)
 */
export const updateAgent = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { name, instructions, description, avatar, canSearchWeb } = req.body;
        const userId = req.user._id;

        const agent = await Agent.findById(agentId);
        if (!agent) return res.status(404).json({ error: "Agent not found" });
        if (agent.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the creator can edit this agent" });
        }

        if (name) agent.name = name.trim();
        if (instructions !== undefined) agent.instructions = instructions.trim();
        if (description !== undefined) agent.description = description.trim();
        if (avatar) agent.avatar = avatar;
        if (canSearchWeb !== undefined) agent.canSearchWeb = canSearchWeb;

        await agent.save();
        res.json({ success: true, agent });
    } catch (error) {
        console.error("❌ updateAgent error:", error.message);
        res.status(500).json({ error: "Failed to update agent" });
    }
};

/**
 * Delete an agent (only by creator)
 */
export const deleteAgent = async (req, res) => {
    try {
        const { agentId } = req.params;
        const userId = req.user._id;

        const agent = await Agent.findById(agentId);
        if (!agent) return res.status(404).json({ error: "Agent not found" });
        if (agent.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the creator can delete this agent" });
        }

        await agent.deleteOne();
        res.json({ success: true, message: "Agent deleted" });
    } catch (error) {
        console.error("❌ deleteAgent error:", error.message);
        res.status(500).json({ error: "Failed to delete agent" });
    }
};

/**
 * Add an agent to a group
 */
export const addAgentToGroup = async (req, res) => {
    try {
        const { groupId, agentId } = req.body;
        const userId = req.user._id;

        const [conv, agent] = await Promise.all([
            Conversation.findById(groupId),
            Agent.findById(agentId)
        ]);

        if (!conv || !conv.isGroup) return res.status(404).json({ error: "Group not found" });
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        // Check if user is a member
        const isMember = conv.participants.some(p => p.toString() === userId.toString());
        if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });

        // Prevent duplicates
        if (agent.addedToGroups.some(g => g.toString() === groupId)) {
            return res.status(409).json({ error: "Agent already in this group" });
        }

        agent.addedToGroups.push(groupId);
        await agent.save();

        res.json({ success: true, message: `Agent @${agent.triggerName} added to group` });
    } catch (error) {
        console.error("❌ addAgentToGroup error:", error.message);
        res.status(500).json({ error: "Failed to add agent to group" });
    }
};

/**
 * Remove an agent from a group
 */
export const removeAgentFromGroup = async (req, res) => {
    try {
        const { groupId, agentId } = req.body;
        const userId = req.user._id;

        const [conv, agent] = await Promise.all([
            Conversation.findById(groupId),
            Agent.findById(agentId)
        ]);

        if (!conv || !conv.isGroup) return res.status(404).json({ error: "Group not found" });
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        // Only admins or agent creator can remove
        const isAdmin = conv.admins?.some(a => a.toString() === userId.toString());
        const isCreator = agent.createdBy.toString() === userId.toString();
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: "Only group admins or agent creator can remove the agent" });
        }

        agent.addedToGroups = agent.addedToGroups.filter(g => g.toString() !== groupId);
        await agent.save();

        res.json({ success: true, message: "Agent removed from group" });
    } catch (error) {
        console.error("❌ removeAgentFromGroup error:", error.message);
        res.status(500).json({ error: "Failed to remove agent from group" });
    }
};

// ===================== CHAT =====================

/**
 * Chat with a personal agent (not group-specific)
 * Returns a streamed/non-streamed response
 */
export const chatWithAgent = async (req, res) => {
    try {
        const { agentId, message, history } = req.body;
        // We will resolve conversationId dynamically
        const userId = req.user._id;

        if (!message?.trim()) {
            return res.status(400).json({ error: "Message is required" });
        }

        const agent = await Agent.findById(agentId);
        if (!agent || !agent.isActive) {
            return res.status(404).json({ error: "Agent not found" });
        }

        // Build conversation history for context
        let historyMessages = [];
        if (history && Array.isArray(history)) {
            historyMessages = history.slice(-10).map(m => ({
                role: m.fromAgent ? "assistant" : "user",
                content: m.content
            }));
        }

        const { response, searchUsed } = await nvidiaService.agentChat({
            userMessage: message.trim(),
            agentInstructions: agent.instructions,
            agentDescription: agent.description,
            history: historyMessages,
            canSearchWeb: agent.canSearchWeb,
            model: agent.model
        });

        // Find or create conversation for this user and agent
        let conv = await Conversation.findOne({
            participants: userId,
            agentId: agent._id,
            isGroup: false
        });

        if (!conv) {
            conv = new Conversation({
                participants: [userId],
                agentId: agent._id,
                isGroup: false
            });
            await conv.save();
        }

        const userMsg = new Message({
            senderId: userId,
            conversationId: conv._id,
            message: message.trim(),
            type: "text",
            status: "sent"
        });

        const agentMsg = new Message({
            senderId: userId, // Agent messages attributed to user for DB schema compatibility
            conversationId: conv._id,
            message: response,
            type: "text",
            status: "delivered",
            agentId: agent._id,
            agentName: agent.name,
            agentAvatar: agent.avatar,
            isAgentMessage: true,
            searchUsed: searchUsed
        });

        await Promise.all([userMsg.save(), agentMsg.save()]);
        
        await Conversation.findByIdAndUpdate(conv._id, {
            $push: { messages: { $each: [userMsg._id, agentMsg._id] } },
            lastMessageTime: agentMsg.createdAt
        });

        res.json({
            success: true,
            response,
            searchUsed,
            agentName: agent.name,
            agentAvatar: agent.avatar
        });
    } catch (error) {
        console.error("❌ chatWithAgent error:", error.message);
        res.status(500).json({ error: error.message || "Failed to get agent response" });
    }
};

/**
 * Get personal chat history with an agent
 */
export const getAgentMessages = async (req, res) => {
    try {
        const { agentId } = req.params;
        const userId = req.user._id;

        const conv = await Conversation.findOne({
            participants: userId,
            agentId: agentId,
            isGroup: false
        });

        if (!conv) {
            return res.json({ success: true, messages: [] });
        }

        const messages = await Message.find({ conversationId: conv._id })
            .sort({ createdAt: 1 })
            .lean();

        res.json({ success: true, messages });
    } catch (error) {
        console.error("❌ getAgentMessages error:", error.message);
        res.status(500).json({ error: "Failed to fetch agent messages" });
    }
};

/**
 * Handle @agent mention in a group message
 * This processes group messages that contain @agentName
 */
export const handleGroupAgentMention = async (req, res) => {
    try {
        const { conversationId, agentTriggerName, userMessage, messageHistory } = req.body;
        const userId = req.user._id;

        // Validate group membership
        const conv = await Conversation.findById(conversationId).populate("participants", "_id");
        if (!conv || !conv.isGroup) {
            return res.status(404).json({ error: "Group not found" });
        }

        const isMember = conv.participants.some(p => p._id.toString() === userId.toString());
        if (!isMember) {
            return res.status(403).json({ error: "Not a member of this group" });
        }

        // Find the agent in this group
        const agent = await Agent.findOne({
            triggerName: agentTriggerName.toLowerCase(),
            addedToGroups: conversationId,
            isActive: true
        });

        if (!agent) {
            return res.status(404).json({ 
                error: `Agent @${agentTriggerName} is not in this group. Add it first.` 
            });
        }

        // Build history from recent messages
        let history = [];
        if (messageHistory && Array.isArray(messageHistory)) {
            history = messageHistory.slice(-8).map(m => ({
                role: m.isAgentMessage ? "assistant" : "user",
                content: m.content
            }));
        }

        const { response, searchUsed } = await nvidiaService.agentChat({
            userMessage,
            agentInstructions: agent.instructions,
            agentDescription: agent.description,
            history,
            canSearchWeb: agent.canSearchWeb,
            model: agent.model
        });

        // Store agent's response as a special message in the conversation
        const agentMsg = new Message({
            senderId: userId,
            conversationId,
            message: `🤖 **${agent.name}**: ${response}`,
            type: "text",
            status: "sent",
            agentId: agent._id,
            agentName: agent.name,
            agentAvatar: agent.avatar,
            isAgentMessage: true
        });

        await agentMsg.save();
        await Conversation.findByIdAndUpdate(conversationId, {
            $push: { messages: agentMsg._id }
        });

        // Emit to all group members via socket
        const populatedMsg = await Message.findById(agentMsg._id)
            .populate("senderId", "username fullName profilePic")
            .lean();

        // Broadcast to conversation room + individual participants as fallback
        io.to(`conversation:${conversationId}`).emit("newMessage", populatedMsg);
        conv.participants.forEach(participant => {
            const socketId = getReceiverSocketId(participant._id.toString());
            if (socketId) {
                io.to(socketId).emit("newMessage", populatedMsg);
            }
        });

        res.json({
            success: true,
            message: populatedMsg,
            searchUsed,
            agentName: agent.name
        });
    } catch (error) {
        console.error("❌ handleGroupAgentMention error:", error.message);
        res.status(500).json({ error: error.message || "Failed to get agent response" });
    }
};
