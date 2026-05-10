import express from "express";
import {
  getUsers,
  updateUserStatus,
  getReports,
  resolveReport,
  getMetrics
} from "../controllers/admin.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import authorizeRole from "../middleware/authorizeRole.js";

const router = express.Router();

// All admin routes require admin role
router.use(protectRoute, authorizeRole("admin"));

router.get("/users", getUsers);
router.patch("/users/:id/deactivate", (req, res, next) => {
  req.body.action = "deactivate";
  next();
}, updateUserStatus);
router.patch("/users/:id/activate", (req, res, next) => {
  req.body.action = "activate";
  next();
}, updateUserStatus);
router.get("/reports", getReports);
router.patch("/reports/:id/resolve", resolveReport);
router.get("/metrics", getMetrics);

export default router;