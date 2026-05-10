import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURATION ===
const LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(__dirname, "../../logs");
const ENABLE_CONSOLE_LOG = process.env.NODE_ENV !== "production";
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB before rotation

// Ensure log directory exists
await fs.mkdir(LOG_DIR, { recursive: true });

/**
 * Log security-relevant events for audit/SIEM
 * @param {Object} event - Audit event data
 */
export const logAuthEvent = async (event) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: event.level || "INFO",
    category: "AUTH",
    ...event,
    // Sanitize sensitive data
    metadata: event.metadata ? sanitizeMetadata(event.metadata) : undefined
  };
  
  const logLine = JSON.stringify(logEntry) + "\n";
  
  // Console output for development
  if (ENABLE_CONSOLE_LOG) {
    const color = {
      "ERROR": "\x1b[31m", // Red
      "WARN": "\x1b[33m",  // Yellow
      "INFO": "\x1b[36m",  // Cyan
      "SUCCESS": "\x1b[32m" // Green
    }[logEntry.level] || "\x1b[0m";
    
    console.log(`${color}[AUDIT]${'\x1b[0m'} ${logEntry.action}: ${logEntry.message || ''}`);
  }
  
  // Write to file (async, non-blocking)
  try {
    const logFile = path.join(LOG_DIR, `auth-${new Date().toISOString().split('T')[0]}.log`);
    
    // Check file size for rotation
    try {
      const stats = await fs.stat(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        await rotateLogFile(logFile);
      }
    } catch (e) {
      // File doesn't exist yet, that's fine
    }
    
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    // Don't fail the request if logging fails
    console.error("❌ Failed to write audit log:", error.message);
  }
};

/**
 * Sanitize metadata to prevent logging sensitive data
 */
const sanitizeMetadata = (metadata) => {
  if (!metadata) return undefined;
  
  const sensitive = ["password", "token", "secret", "code", "jwt", "refresh"];
  const sanitized = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitive.some(s => lowerKey.includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Rotate log file by appending timestamp and creating new file
 */
const rotateLogFile = async (logFile) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedFile = `${logFile}.${timestamp}.bak`;
  
  try {
    await fs.rename(logFile, rotatedFile);
    console.log(`📦 Rotated audit log: ${path.basename(rotatedFile)}`);
  } catch (error) {
    console.error("❌ Failed to rotate log file:", error.message);
  }
};

/**
 * Middleware to log all requests (optional, for comprehensive audit)
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Only log security-relevant requests
    if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/users")) {
      logAuthEvent({
        action: "API_REQUEST",
        level: res.statusCode >= 400 ? "WARN" : "INFO",
        ip: req.ip,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get("User-Agent"),
        metadata: {
          userId: req.user?._id,
          query: Object.keys(req.query).length > 0 ? "[present]" : undefined
        }
      });
    }
  });
  
  next();
};