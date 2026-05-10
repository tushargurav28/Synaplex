import express from "express";
import {
    sendInvitation,
    getPendingInvitations,
    respondToInvitation
} from "../controllers/invitations.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

// Get user's pending invitations
router.get("/", protectRoute, getPendingInvitations);

// Send an invitation
router.post("/", protectRoute, sendInvitation);

// Accept or reject an invitation
router.patch("/:id/respond", protectRoute, respondToInvitation);

export default router;
