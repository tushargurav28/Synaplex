import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Generate access + refresh token pair with security best practices
 * @param {Object} user - User document
 * @param {Object} req - Express request (for metadata)
 * @returns {Object} { accessToken, refreshToken, expiresIn }
 */
export const generateAuthTokens = async (user, req) => {
  const accessTokenExpiry = "15m"; // Short-lived access token
  const refreshTokenExpiry = "7d";  // Longer-lived refresh token
  
  // Access token payload (minimal, short-lived)
  const accessTokenPayload = {
    userId: user._id,
    type: "access",
    iat: Math.floor(Date.now() / 1000)
  };
  
  // Refresh token payload (includes rotation counter)
  const refreshTokenPayload = {
    userId: user._id,
    type: "refresh",
    jti: crypto.randomBytes(16).toString("hex"), // Unique token ID for rotation
    iat: Math.floor(Date.now() / 1000)
  };
  
  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.JWT_SECRET,
    { expiresIn: accessTokenExpiry }
  );
  
  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, // Use separate secret if available
    { expiresIn: refreshTokenExpiry }
  );
  
  // Hash refresh token for storage (never store raw token)
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");
  
  // Store session metadata
  const sessionData = {
    refreshTokenHash,
    userAgent: req?.get("User-Agent") || "unknown",
    ip: req?.ip || req?.connection?.remoteAddress || "unknown",
    lastUsed: new Date()
  };
  
  // Add to user's active sessions (limit to 5 concurrent sessions)
  if (!user.activeSessions) user.activeSessions = [];
  
  // Remove revoked/expired sessions
  user.activeSessions = user.activeSessions.filter(s => 
    !s.isRevoked && new Date(s.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  
  // Limit concurrent sessions
  if (user.activeSessions.length >= 5) {
    // Revoke oldest session
    user.activeSessions[0].isRevoked = true;
  }
  
  user.activeSessions.push(sessionData);
  await user.save({ validateBeforeSave: false });
  
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(Date.now() / 1000) + 15 * 60 // 15 minutes in epoch
  };
};

/**
 * Set secure authentication cookies
 * @param {Object} res - Express response
 * @param {string} accessToken 
 * @param {string} refreshToken
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: "strict", // Prevent CSRF
    signed: true, // Sign cookies for integrity (requires cookie-parser with secret)
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined // Set for subdomain support
  };
  
  // Access token cookie (short-lived)
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  
  // Refresh token cookie (longer-lived, but rotated)
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

/**
 * Clear authentication cookies
 * @param {Object} res - Express response
 */
export const clearAuthCookies = (res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    path: "/"
  };
  
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

/**
 * Verify and decode JWT token with type checking
 * @param {string} token 
 * @param {string} type - "access" or "refresh"
 * @returns {Object} decoded payload
 */
export const verifyToken = (token, type) => {
  try {
    const secret = type === "refresh" 
      ? (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)
      : process.env.JWT_SECRET;
    
    const decoded = jwt.verify(token, secret);
    
    if (decoded.type !== type) {
      throw new Error(`Token type mismatch: expected ${type}, got ${decoded.type}`);
    }
    
    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
};