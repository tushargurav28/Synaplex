import mongoose from "mongoose";
import validator from "validator";
import zxcvbn from "zxcvbn";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
  // === IDENTIFIERS ===
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, "Username must be at least 3 characters"],
    maxlength: [30, "Username cannot exceed 30 characters"],
    match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"]
  },
  
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
    minlength: [2, "Full name must be at least 2 characters"],
    maxlength: [100, "Full name cannot exceed 100 characters"]
  },
  
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: "Please provide a valid email address"
    }
  },
  
  // === PASSWORD & SECURITY ===
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [12, "Password must be at least 12 characters"],
    select: false,
    validate: {
      validator: function(v) {
        return zxcvbn(v).score >= 3;
      },
      message: "Password is too weak. Use at least 12 characters with mixed case, numbers, and symbols."
    }
  },
  
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordHistory: [{
    hash: String,
    changedAt: { type: Date, default: Date.now }
  }],
  
  // === ACCOUNT STATUS & LOCKOUT ===
  isActive: { type: Boolean, default: true, select: false },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  
  // === TWO-FACTOR AUTH ===
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  twoFactorBackupCodes: [{ 
    code: String, 
    used: { type: Boolean, default: false },
    usedAt: Date 
  }],
  
  // === PROFILE ===
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer-not-to-say"],
    default: "prefer-not-to-say"
  },
  profilePic: {
    type: String,
    default: "",
    validate: {
      validator: (v) => !v || /^https?:\/\/.+/.test(v) || /^\/uploads\//.test(v),
      message: "Profile picture must be a valid URL"
    }
  },
  // NEW: Profile settings fields
  bio: {
    type: String,
    maxlength: [500, "Bio cannot exceed 500 characters"],
    trim: true,
    default: ""
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  allowMessagesFrom: {
    type: String,
    enum: ["everyone", "contacts", "none"],
    default: "everyone"
  },
  lastSeenVisibility: {
    type: String,
    enum: ["everyone", "contacts", "none"],
    default: "everyone"
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // NEW: Role-based access
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    index: true
  },
  
  // === SESSION MANAGEMENT ===
  activeSessions: [{
    refreshTokenHash: String,
    userAgent: String,
    ip: String,
    lastUsed: Date,
    createdAt: { type: Date, default: Date.now },
    isRevoked: { type: Boolean, default: false }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual("isLocked").get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  
  try {
    if (this.passwordHistory?.length > 0) {
      for (const oldHash of this.passwordHistory) {
        const isReuse = await bcrypt.compare(this.password, oldHash.hash);
        if (isReuse) {
          return next(new Error("Cannot reuse a previous password"));
        }
      }
    }
    
    const pepper = process.env.PASSWORD_PEPPER || "";
    const passwordWithPepper = this.password + pepper;
    
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(passwordWithPepper, salt);
    
    if (this.passwordHistory?.length >= 5) {
      this.passwordHistory.shift();
    }
    this.passwordHistory.push({ hash: this.password });
    
    this.passwordChangedAt = Date.now();
    
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.isAccountLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.getLockoutTimeRemaining = function() {
  if (!this.lockUntil) return 0;
  return Math.max(0, Math.ceil((this.lockUntil - Date.now()) / 1000));
};

userSchema.methods.incrementFailedAttempts = async function() {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  
  if (this.failedLoginAttempts >= 5) {
    const lockMinutes = Math.min(120, Math.pow(2, this.failedLoginAttempts - 4) * 5);
    this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
  }
  
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.resetFailedAttempts = async function() {
  this.failedLoginAttempts = 0;
  this.lockUntil = undefined;
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  if (!userPassword) return false;
  const pepper = process.env.PASSWORD_PEPPER || "";
  const candidateWithPepper = candidatePassword + pepper;
  return await bcrypt.compare(candidateWithPepper, userPassword);
};

userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString("hex");
  
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  
  this.passwordResetExpires = Date.now() + 15 * 60 * 1000;
  
  return resetToken;
};

userSchema.methods.verifyEmailToken = function(token) {
  if (!this.emailVerificationToken || !this.emailVerificationExpires) return false;
  if (Date.now() > this.emailVerificationExpires) return false;
  return crypto.timingSafeEqual(
    Buffer.from(this.emailVerificationToken),
    Buffer.from(token)
  );
};

userSchema.statics.findByCredentials = async function(identifier) {
  const query = identifier.includes("@") 
    ? { email: identifier.toLowerCase() }
    : { username: identifier.toLowerCase() };
  return this.findOne(query)
    .select("+password +failedLoginAttempts +lockUntil +isActive");
};

userSchema.index({ lockUntil: 1 }, { expireAfterSeconds: 0 });
userSchema.index({ "activeSessions.refreshTokenHash": 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ username: "text", fullName: "text" });

const User = mongoose.model("User", userSchema);

export default User;