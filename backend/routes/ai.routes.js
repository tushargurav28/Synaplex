import express from "express";
import { aiChat } from "../controllers/ai.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.post("/chat", protectRoute, aiChat);

export default router;