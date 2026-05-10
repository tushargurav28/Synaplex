import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import {
    createAgent,
    getMyAgents,
    getGroupAgents,
    getAllAgents,
    updateAgent,
    deleteAgent,
    addAgentToGroup,
    removeAgentFromGroup,
    chatWithAgent,
    handleGroupAgentMention,
    getAgentMessages
} from "../controllers/agent.controller.js";

const router = express.Router();

// === CRUD ===
router.post("/", protectRoute, createAgent);
router.get("/", protectRoute, getAllAgents);
router.get("/my", protectRoute, getMyAgents);
router.get("/group/:groupId", protectRoute, getGroupAgents);
router.patch("/:agentId", protectRoute, updateAgent);
router.delete("/:agentId", protectRoute, deleteAgent);

// === GROUP MANAGEMENT ===
router.post("/group/add", protectRoute, addAgentToGroup);
router.post("/group/remove", protectRoute, removeAgentFromGroup);

// === CHAT ===
router.post("/chat", protectRoute, chatWithAgent);
router.post("/group/mention", protectRoute, handleGroupAgentMention);
router.get("/:agentId/messages", protectRoute, getAgentMessages);

export default router;
