import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { verifyToken } from "../utils/generateToken.js";

/**
 * Middleware to protect routes with JWT access token
 * Handles token refresh automatically if access token expired but refresh valid
 */
const protectRoute = async (req, res, next) => {
  try {
    // 1. Get access token from cookie (signed cookies are in req.signedCookies)
    const accessToken = req.signedCookies?.accessToken || req.cookies?.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    try {
      // 2. Verify access token
      const decoded = verifyToken(accessToken, "access");
      
      // 3. Fetch user (exclude sensitive fields)
      const user = await User.findById(decoded.userId)
        .select("-password -failedLoginAttempts -lockUntil -activeSessions +isActive")
        .lean();
      
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Account not found or inactive" });
      }
      
      // 4. Check if password was changed after token issued
      if (user.passwordChangedAt) {
        const passwordChangedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
        if (decoded.iat < passwordChangedTimestamp) {
          return res.status(401).json({ 
            error: "Password changed. Please log in again.",
            requiresRelogin: true 
          });
        }
      }
      
      // 5. Attach user to request
      req.user = user;
      next();
      
    } catch (tokenError) {
      // Access token expired or invalid - try refresh
      if (tokenError.message === "Token has expired" || tokenError.message === "Invalid token") {
        const refreshToken = req.signedCookies?.refreshToken || req.cookies?.refreshToken;
        
        if (!refreshToken) {
          return res.status(401).json({ 
            error: "Session expired. Please log in again.",
            requiresRelogin: true 
          });
        }
        
        // Verify refresh token
        try {
          const decoded = verifyToken(refreshToken, "refresh");
          
          // Find user
          const user = await User.findById(decoded.userId)
            .select("+activeSessions");
          
          if (!user || !user.isActive) {
            return res.status(401).json({ error: "Authentication failed" });
          }
          
          // Hash refresh token to find session
          const crypto = await import("crypto");
          const tokenHash = crypto
            .createHash("sha256")
            .update(refreshToken)
            .digest("hex");
          
          // Validate session
          const session = user.activeSessions?.find(s => 
            s.refreshTokenHash === tokenHash && 
            !s.isRevoked &&
            new Date(s.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          );
          
          if (!session) {
            return res.status(401).json({ 
              error: "Session invalid. Please log in again.",
              requiresRelogin: true 
            });
          }
          
          // Token rotation: generate new pair
          const { generateAuthTokens, setAuthCookies } = await import("../utils/generateToken.js");
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = 
            await generateAuthTokens(user, req);
          
          // Update session
          session.isRevoked = true;
          await user.save({ validateBeforeSave: false });
          
          // Set new cookies
          setAuthCookies(res, newAccessToken, newRefreshToken);
          
          // Attach user and continue
          req.user = {
            _id: user._id,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
            isActive: user.isActive
          };
          
          return next();
          
        } catch (refreshError) {
          // Refresh token also invalid - force relogin
          const { clearAuthCookies } = await import("../utils/generateToken.js");
          clearAuthCookies(res);
          
          return res.status(401).json({ 
            error: "Session expired. Please log in again.",
            requiresRelogin: true 
          });
        }
      }
      
      // Other token errors
      return res.status(401).json({ error: "Invalid authentication token" });
    }
    
  } catch (error) {
    console.error("❌ protectRoute error:", error.message);
    res.status(500).json({ error: "Authentication service error" });
  }
};

export default protectRoute;