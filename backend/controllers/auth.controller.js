import bcrypt from "bcryptjs";
import crypto from "crypto";
import zxcvbn from "zxcvbn";
import validator from "validator";

import User from "../models/user.model.js";
import { 
  generateAuthTokens, 
  setAuthCookies, 
  clearAuthCookies,
  verifyToken 
} from "../utils/generateToken.js";
import { logAuthEvent } from "../middleware/audit.js";

// === HELPER: Sanitize input to prevent NoSQL injection ===
const sanitizeInput = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Block MongoDB operators
    if (key.startsWith("$") || key.includes(".")) continue;
    
    if (typeof value === "string") {
      sanitized[key] = value.trim();
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// === HELPER: Generic error response to prevent enumeration ===
const authError = (res, message = "Authentication failed") => {
  return res.status(401).json({ error: message });
};

// === SIGNUP ===
export const signup = async (req, res) => {
  try {
    // 1. Input sanitization
    const { fullName, username, email, password, confirmPassword, gender } = sanitizeInput(req.body);
    
    // 2. Validation
    const errors = [];
    
    if (!fullName || fullName.trim().length < 2) {
      errors.push("Full name must be at least 2 characters");
    }
    
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      errors.push("Username must be 3-30 characters, letters/numbers/underscores only");
    }
    
    if (!email || !validator.isEmail(email)) {
      errors.push("Please provide a valid email address");
    }
    
    if (!password) {
      errors.push("Password is required");
    } else {
      // Password strength check with zxcvbn
      const strength = zxcvbn(password);
      if (strength.score < 3) {
        errors.push(`Password is too weak. ${strength.feedback.suggestions.join(" ")}`);
      }
      if (password.length < 12) {
        errors.push("Password must be at least 12 characters");
      }
    }
    
    if (password !== confirmPassword) {
      errors.push("Passwords do not match");
    }
    
    if (gender && !["male", "female", "other", "prefer-not-to-say"].includes(gender)) {
      errors.push("Invalid gender selection");
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] }); // Return first error
    }
    
    // 3. Check for existing user (with generic error to prevent enumeration)
    const existingUser = await User.findOne({ 
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] 
    });
    
    if (existingUser) {
      // Generic message - don't reveal which field exists
      return res.status(409).json({ error: "An account with this username or email already exists" });
    }
    
    // 4. Generate profile picture URL
    const boyProfilePic = `https://avatar.iran.liara.run/public/boy?username=${encodeURIComponent(username)}`;
    const girlProfilePic = `https://avatar.iran.liara.run/public/girl?username=${encodeURIComponent(username)}`;
    
    // 5. Create user (password will be hashed by pre-save hook)
    const newUser = new User({
      fullName: fullName.trim(),
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password, // Will be hashed + peppered in pre-save hook
      gender: gender || "prefer-not-to-say",
      profilePic: (gender === "male" ? boyProfilePic : girlProfilePic)
    });
    
    // 6. Generate email verification token (if implementing email verification)
    if (process.env.ENABLE_EMAIL_VERIFICATION === "true") {
      newUser.emailVerificationToken = crypto.randomBytes(32).toString("hex");
      newUser.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      // TODO: Send verification email with token
    } else {
      newUser.isEmailVerified = true; // Auto-verify in dev
    }
    
    // 7. Save user
    await newUser.save();
    
    // 8. Generate auth tokens
    const { accessToken, refreshToken } = await generateAuthTokens(newUser, req);
    
    // 9. Set secure cookies
    setAuthCookies(res, accessToken, refreshToken);
    
    // 10. Audit log
    await logAuthEvent({
      userId: newUser._id,
      action: "SIGNUP_SUCCESS",
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      metadata: { method: "username_password" }
    });
    
    // 11. Return minimal user data (never return password hash)
    res.status(201).json({
      success: true,
      user: {
        _id: newUser._id,
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        profilePic: newUser.profilePic,
        isEmailVerified: newUser.isEmailVerified,
        requiresPasswordChange: false
      },
      message: process.env.ENABLE_EMAIL_VERIFICATION === "true" 
        ? "Account created. Please check your email to verify your account."
        : "Account created successfully"
    });
    
  } catch (error) {
    console.error("❌ Signup error:", error);
    
    // Audit log for errors
    await logAuthEvent({
      action: "SIGNUP_ERROR",
      ip: req.ip,
      error: error.message,
      metadata: { username: req.body?.username }
    });
    
    // Don't leak internal errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

// === LOGIN ===
export const login = async (req, res) => {
  try {
    // 1. Input sanitization
    const { username, email, password, twoFactorCode } = sanitizeInput(req.body);
    
    // 2. Validation
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }
    
    // 3. Find user (with security fields)
    const identifier = username ? { username: username.toLowerCase() } : { email: email.toLowerCase() };
    const user = await User.findByCredentials(identifier.email || identifier.username);
    
    // 4. Generic error for invalid credentials (prevent enumeration)
    if (!user || !user.isActive) {
      // Generic error to prevent user enumeration
      return authError(res);
    }
    
    // 5. Check if account is locked
    if (user.isAccountLocked()) {
      await logAuthEvent({
        userId: user._id,
        action: "LOGIN_BLOCKED",
        ip: req.ip,
        metadata: { reason: "account_locked", remainingTime: user.getLockoutTimeRemaining() }
      });
      
      return res.status(429).json({ 
        error: "Too many failed attempts. Please try again later.",
        retryAfter: user.getLockoutTimeRemaining()
      });
    }
    
    // 6. Verify password (constant-time comparison)
    const isPasswordValid = await user.correctPassword(password, user.password);
    
    if (!isPasswordValid) {
      await user.incrementFailedAttempts();
      
      await logAuthEvent({
        userId: user._id,
        action: "LOGIN_FAILED",
        ip: req.ip,
        metadata: { reason: "invalid_password", attempt: user.failedLoginAttempts }
      });
      
      return authError(res);
    }
    
    // 7. Check if password needs rotation (optional policy)
    const passwordAge = Date.now() - new Date(user.passwordChangedAt || user.createdAt).getTime();
    const maxPasswordAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    
    // 8. Two-Factor Authentication check (if enabled)
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(403).json({ 
          error: "Two-factor authentication required",
          requires2FA: true,
          userId: user._id // Allow frontend to identify which account
        });
      }
      
      // Verify TOTP code (using speakeasy)
      const speakeasy = await import("speakeasy");
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorCode,
        window: 1 // Allow 1 step skew for clock drift
      });
      
      if (!verified) {
        // Check backup codes
        const backupCode = user.twoFactorBackupCodes?.find(
          code => code.code === twoFactorCode && !code.used
        );
        
        if (backupCode) {
          backupCode.used = true;
          backupCode.usedAt = new Date();
          await user.save({ validateBeforeSave: false });
        } else {
          await user.incrementFailedAttempts();
          return res.status(401).json({ error: "Invalid authentication code" });
        }
      }
    }
    
    // 9. Reset failed attempts on successful login
    await user.resetFailedAttempts();
    
    // 10. Generate new token pair
    const { accessToken, refreshToken } = await generateAuthTokens(user, req);
    
    // 11. Set secure cookies
    setAuthCookies(res, accessToken, refreshToken);
    
    // 12. Audit log
    await logAuthEvent({
      userId: user._id,
      action: "LOGIN_SUCCESS",
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      metadata: { 
        method: user.twoFactorEnabled ? "password_2fa" : "password",
        sessionCount: user.activeSessions?.length || 1
      }
    });
    
    // 13. Return user data
    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePic: user.profilePic,
        isEmailVerified: user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        requiresPasswordChange: passwordAge > maxPasswordAge
      },
      tokenExpiry: Math.floor(Date.now() / 1000) + 15 * 60 // 15 minutes
    });
    
  } catch (error) {
    console.error("❌ Login error:", error);
    
    await logAuthEvent({
      action: "LOGIN_ERROR",
      ip: req.ip,
      error: error.message,
      metadata: { identifier: req.body?.username || req.body?.email }
    });
    
    res.status(500).json({ error: "Authentication failed. Please try again." });
  }
};

// === REFRESH TOKEN (New endpoint for token rotation) ===
export const refreshTokens = async (req, res) => {
  try {
    const refreshToken = req.signedCookies?.refreshToken || req.cookies?.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }
    
    // Verify refresh token
    const decoded = verifyToken(refreshToken, "refresh");
    
    // Find user
    const user = await User.findById(decoded.userId)
      .select("+activeSessions");
    
    if (!user || !user.isActive) {
      clearAuthCookies(res);
      return res.status(401).json({ error: "Authentication failed" });
    }
    
    // Hash the provided refresh token to find matching session
    const crypto = await import("crypto");
    const providedTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    
    // Find and validate session
    const session = user.activeSessions?.find(s => 
      s.refreshTokenHash === providedTokenHash && 
      !s.isRevoked &&
      new Date(s.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    
    if (!session) {
      // Potential token theft - revoke all sessions for security
      user.activeSessions = user.activeSessions?.map(s => ({ ...s, isRevoked: true })) || [];
      await user.save({ validateBeforeSave: false });
      
      await logAuthEvent({
        userId: user._id,
        action: "TOKEN_REUSE_DETECTED",
        ip: req.ip,
        metadata: { jti: decoded.jti }
      });
      
      clearAuthCookies(res);
      return res.status(401).json({ 
        error: "Session invalid. Please log in again.",
        requiresRelogin: true 
      });
    }
    
    // Token rotation: revoke old token, issue new pair
    session.isRevoked = true;
    
    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = await generateAuthTokens(user, req);
    
    await user.save({ validateBeforeSave: false });
    
    // Set new cookies
    setAuthCookies(res, accessToken, newRefreshToken);
    
    res.status(200).json({
      success: true,
      tokenExpiry: Math.floor(Date.now() / 1000) + 15 * 60
    });
    
  } catch (error) {
    console.error("❌ Token refresh error:", error);
    clearAuthCookies(res);
    res.status(401).json({ error: "Invalid refresh token" });
  }
};

// === LOGOUT ===
export const logout = async (req, res) => {
  try {
    const refreshToken = req.signedCookies?.refreshToken || req.cookies?.refreshToken;
    
    if (refreshToken && req.user) {
      // Revoke the specific session
      const crypto = await import("crypto");
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      
      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          "activeSessions.$[elem].isRevoked": true
        }
      }, {
        arrayFilters: [{ "elem.refreshTokenHash": tokenHash }],
        validateBeforeSave: false
      });
      
      await logAuthEvent({
        userId: req.user._id,
        action: "LOGOUT_SUCCESS",
        ip: req.ip
      });
    }
    
    // Clear cookies
    clearAuthCookies(res);
    
    res.status(200).json({ success: true, message: "Logged out successfully" });
    
  } catch (error) {
    console.error("❌ Logout error:", error);
    clearAuthCookies(res);
    res.status(500).json({ error: "Logout failed" });
  }
};

// === REQUEST PASSWORD RESET ===
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = sanitizeInput(req.body);
    
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    
    // Find user (don't reveal if email exists)
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success to prevent enumeration
    if (!user || !user.isActive) {
      return res.status(200).json({ 
        success: true, 
        message: "If an account exists with this email, a reset link has been sent" 
      });
    }
    
    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    
    // TODO: Send email with reset link containing resetToken
    // Example: https://yourapp.com/reset-password?token=abc123&email=user@example.com
    
    await logAuthEvent({
      userId: user._id,
      action: "PASSWORD_RESET_REQUESTED",
      ip: req.ip
    });
    
    res.status(200).json({ 
      success: true, 
      message: "If an account exists with this email, a reset link has been sent" 
    });
    
  } catch (error) {
    console.error("❌ Password reset request error:", error);
    res.status(500).json({ error: "Request failed. Please try again." });
  }
};

// === RESET PASSWORD ===
export const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword, confirmNewPassword } = sanitizeInput(req.body);
    
    // Validation
    if (!token || !email || !newPassword || newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    
    // Hash token to find user
    const crypto = await import("crypto");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      email: email.toLowerCase(),
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select("+password");
    
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    
    // Password strength validation
    const strength = zxcvbn(newPassword);
    if (strength.score < 3 || newPassword.length < 12) {
      return res.status(400).json({ error: "New password is too weak" });
    }
    
    // Update password (pre-save hook will handle hashing, history, etc.)
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save();
    
    // Revoke all active sessions for security
    user.activeSessions = user.activeSessions?.map(s => ({ ...s, isRevoked: true })) || [];
    await user.save({ validateBeforeSave: false });
    
    await logAuthEvent({
      userId: user._id,
      action: "PASSWORD_RESET_SUCCESS",
      ip: req.ip
    });
    
    res.status(200).json({ 
      success: true, 
      message: "Password updated successfully. Please log in with your new password." 
    });
    
  } catch (error) {
    console.error("❌ Password reset error:", error);
    res.status(500).json({ error: "Password reset failed" });
  }
};

// === SETUP TWO-FACTOR AUTH ===
export const setupTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Generate TOTP secret
    const speakeasy = await import("speakeasy");
    const secret = speakeasy.generateSecret({ 
      name: `MessengerApp (${user.email})`,
      length: 32 
    });
    
    // Store secret (not yet enabled)
    user.twoFactorSecret = secret.base32;
    await user.save({ validateBeforeSave: false });
    
    // Generate QR code for setup
    const QRCode = await import("qrcode");
    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);
    
    await logAuthEvent({
      userId: user._id,
      action: "2FA_SETUP_INITIATED",
      ip: req.ip
    });
    
    res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeDataURL,
      message: "Scan QR code with authenticator app, then verify with code"
    });
    
  } catch (error) {
    console.error("❌ 2FA setup error:", error);
    res.status(500).json({ error: "2FA setup failed" });
  }
};

// === VERIFY & ENABLE TWO-FACTOR ===
export const verifyTwoFactor = async (req, res) => {
  try {
    const { code, backupCodes } = sanitizeInput(req.body);
    const user = await User.findById(req.user._id).select("+twoFactorSecret");
    
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: "2FA not configured" });
    }
    
    // Verify TOTP code
    const speakeasy = await import("speakeasy");
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 1
    });
    
    if (!verified) {
      return res.status(400).json({ error: "Invalid verification code" });
    }
    
    // Generate backup codes if requested
    if (backupCodes === true) {
      user.twoFactorBackupCodes = Array.from({ length: 8 }, () => ({
        code: crypto.randomBytes(5).toString("hex").toUpperCase(),
        used: false
      }));
    }
    
    // Enable 2FA
    user.twoFactorEnabled = true;
    await user.save({ validateBeforeSave: false });
    
    await logAuthEvent({
      userId: user._id,
      action: "2FA_ENABLED",
      ip: req.ip
    });
    
    res.status(200).json({
      success: true,
      message: "Two-factor authentication enabled successfully",
      backupCodes: user.twoFactorBackupCodes?.filter(c => !c.used).map(c => c.code)
    });
    
  } catch (error) {
    console.error("❌ 2FA verification error:", error);
    res.status(500).json({ error: "2FA verification failed" });
  }
};

// === DISABLE TWO-FACTOR ===
export const disableTwoFactor = async (req, res) => {
  try {
    const { code, password } = sanitizeInput(req.body);
    const user = await User.findById(req.user._id).select("+twoFactorSecret +password");
    
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // Re-authenticate with password
    const isPasswordValid = await user.correctPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }
    
    // Verify current 2FA code
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const speakeasy = await import("speakeasy");
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1
      });
      
      if (!verified) {
        return res.status(400).json({ error: "Invalid authentication code" });
      }
    }
    
    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    await user.save({ validateBeforeSave: false });
    
    await logAuthEvent({
      userId: user._id,
      action: "2FA_DISABLED",
      ip: req.ip
    });
    
    res.status(200).json({ success: true, message: "Two-factor authentication disabled" });
    
  } catch (error) {
    console.error("❌ 2FA disable error:", error);
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
};