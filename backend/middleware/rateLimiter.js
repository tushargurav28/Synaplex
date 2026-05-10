import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";

// === AUTH ENDPOINTS: Strict limits to prevent brute force ===
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  message: { 
    error: "Too many authentication attempts. Please try again later.",
    retryAfter: 900 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // IPv6-safe IP extraction + identifier combination
    const ip = ipKeyGenerator(req);
    const identifier = req.body?.username || req.body?.email || "unknown";
    return `${ip}:${identifier.toLowerCase()}`;
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests",
      message: "Rate limit exceeded. Please wait before trying again.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// === PASSWORD RESET: Very strict (prevent abuse) ===
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per IP
  message: { error: "Too many password reset requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req)
});

// === GENERAL API: Moderate limits ===
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Prefer user ID for authenticated requests, fallback to IPv6-safe IP
    return req.user?._id?.toString() || ipKeyGenerator(req);
  }
});

// === MESSAGE SENDING: Prevent spam ===
export const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: { error: "Message rate limit exceeded. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Prefer user ID for authenticated requests, fallback to IPv6-safe IP
    return req.user?._id?.toString() || ipKeyGenerator(req);
  }
});