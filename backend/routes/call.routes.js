import express from "express";
import { getCallHistory, deleteCallLog, clearCallHistory } from "../controllers/call.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/history", protectRoute, getCallHistory);
router.delete("/history/clear", protectRoute, clearCallHistory);
router.delete("/:callId", protectRoute, deleteCallLog);

export default router;
