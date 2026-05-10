import express from "express";
import { searchMessages } from "../controllers/search.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/messages", protectRoute, searchMessages);

export default router;