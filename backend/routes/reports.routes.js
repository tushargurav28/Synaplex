import express from "express";
import { reportMessage } from "../controllers/report.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.post("/messages/:messageId", protectRoute, reportMessage);

export default router;