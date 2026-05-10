import express from "express";
import {
    createGroupConversation,
    getUserConversations,
    addUserToGroup,
    removeUserFromGroup,
    leaveGroup,
    updateGroup
} from "../controllers/conversation.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Get all conversations for authenticated user
router.get("/", protectRoute, getUserConversations);

// Create a new group conversation
router.post("/group", protectRoute, createGroupConversation);

// Update group name / photo (admins only)
router.patch("/group/:id/update",
    protectRoute,
    validateObjectId("id"),
    updateGroup
);

// Add user to group (admins only)
router.patch("/group/:id/add", 
    protectRoute, 
    validateObjectId("id"),
    addUserToGroup
);

// Remove user from group (admins only)
router.patch("/group/:id/remove", 
    protectRoute, 
    validateObjectId("id"),
    removeUserFromGroup
);

// Leave a group conversation
router.patch("/group/:id/leave", 
    protectRoute, 
    validateObjectId("id"),
    leaveGroup
);

export default router;