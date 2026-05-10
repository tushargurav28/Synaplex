import express from "express";
import {
  signup,
  login,
  logout,
  refreshTokens,
  requestPasswordReset,
  resetPassword,
  setupTwoFactor,
  verifyTwoFactor,
  disableTwoFactor
} from "../controllers/auth.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// === PUBLIC ROUTES (with strict rate limiting) ===

// Signup - moderate limit (prevent spam)
router.post("/signup", authLimiter, signup);

// Login - strict limit (prevent brute force)
router.post("/login", authLimiter, login);

// Password reset flow
router.post("/password/reset-request", authLimiter, requestPasswordReset);
router.post("/password/reset", authLimiter, resetPassword);

// Token refresh (public but authenticated via refresh token cookie)
router.post("/refresh", authLimiter, refreshTokens);

// === PROTECTED ROUTES (user must be authenticated) ===

// Logout
router.post("/logout", protectRoute, logout);

// Two-Factor Authentication management
router.post("/2fa/setup", protectRoute, setupTwoFactor);
router.post("/2fa/verify", protectRoute, verifyTwoFactor);
router.post("/2fa/disable", protectRoute, disableTwoFactor);

// Get current user profile
router.get("/me", protectRoute, async (req, res) => {
  try {
    // req.user is attached by protectRoute middleware
    res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error("❌ Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;