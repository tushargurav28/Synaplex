// STEP 1: Load environment variables FIRST
import "dotenv/config";

// STEP 2: Validate required environment variables
const requiredEnv = ["MONGO_DB_URI", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// STEP 3: Import modules
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import connectToMongoDB from "./db/connectToMongoDB.js";
import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import usersRoutes from "./routes/users.routes.js";
import conversationRoutes from "./routes/conversation.router.js";

// NEW: Additional route imports
import aiRoutes from "./routes/ai.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import searchRoutes from "./routes/search.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import invitationRoutes from "./routes/invitations.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import callRoutes from "./routes/call.routes.js";

import { app, server } from "./socket/socket.js";

// Rate limiting middleware
import { authLimiter, messageLimiter, apiLimiter } from "./middleware/rateLimiter.js";

// STEP 4: Configuration
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || "development";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STEP 5: Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser(process.env.JWT_SECRET));

// Serve static uploads (development only - use CDN in production)
app.use("/uploads", express.static(path.join(__dirname, process.env.UPLOAD_PATH || "uploads")));

// STEP 6: Rate Limiting
app.use("/api/auth", authLimiter);
app.use("/api/messages/send", messageLimiter);
app.use("/api", apiLimiter);

// STEP 7: Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/conversations", conversationRoutes);

// NEW: Additional route registrations
app.use("/api/ai", aiRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/calls", callRoutes);

// STEP 8: Root route
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Messenger API is running",
    version: "2.1.0",
    environment: NODE_ENV
  });
});

// STEP 9: 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// STEP 10: Centralized Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  
  // Mongoose validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({ 
      error: "Validation failed", 
      details: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // MongoDB duplicate key errors
  if (err.code === 11000) {
    return res.status(409).json({ 
      error: "Duplicate entry", 
      field: Object.keys(err.keyValue)[0]
    });
  }
  
  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  
  // AI service errors
  if (err.message?.includes("AI service")) {
    return res.status(503).json({ error: err.message });
  }
  
  // Default error
  res.status(500).json({ 
    error: NODE_ENV === "development" ? err.message : "Internal server error"
  });
});

// STEP 11: Start Server
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  
  try {
    await connectToMongoDB();
    console.log("MongoDB connected");
    
    // Initialize AI service if API key is configured
    if (process.env.OPENAI_API_KEY) {
      try {
        const aiService = await import("./services/ai.service.js");
        aiService.default.initialize();
      } catch (error) {
        console.warn("⚠️ AI service initialization skipped:", error.message);
      }
    }
    
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
});

// STEP 12: Graceful Shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));