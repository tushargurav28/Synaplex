import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";

/**
 * Apply comprehensive security middleware to Express app
 * @param {Object} app - Express application instance
 */
export const applySecurityMiddleware = (app) => {
  // === 1. SECURITY HEADERS (Helmet) ===
  app.use(helmet({
    // Content Security Policy - adjust for your frontend needs
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Consider using nonces/hashes in production
          process.env.CLIENT_URL // Allow frontend scripts
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        imgSrc: ["'self'", "data:", "https:", "http:"], // Allow avatar service
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          process.env.CLIENT_URL,
          process.env.SERVER_URL
        ],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
      }
    },
    
    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Prevent clickjacking
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    
    // Prevent MIME type sniffing
    noSniff: true,
    
    // Referrer policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    
    // Permissions policy (disable unnecessary features)
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        "interest-cohort": [] // Disable FLoC
      }
    }
  }));
  
  // === 2. NO-SQL INJECTION PREVENTION ===
  app.use(mongoSanitize({
    replaceWith: "_", // Replace suspicious chars
    allowDots: true,  // Allow dot notation for legitimate queries
    onSanitize: ({ req, key }) => {
      // Log suspicious attempts
      console.warn(`⚠️ Sanitized suspicious input in ${req.path}: ${key}`);
    }
  }));
  
  // === 3. XSS PREVENTION ===
  app.use(xss({
    // Custom options if needed
    whiteList: {
      // Allow safe HTML tags if your app needs rich text
      // a: ["href", "title", "target"],
      // strong: [], em: [], p: [], br: []
    }
  }));
  
  // === 4. HTTP PARAMETER POLLUTION PREVENTION ===
  app.use(hpp({
    // Whitelist parameters that legitimately allow duplicates
    whitelist: ["sort", "fields", "include"]
  }));
  
  // === 5. ADDITIONAL SECURITY HEADERS (Manual) ===
  app.use((req, res, next) => {
    // Prevent caching of sensitive responses
    if (req.path.startsWith("/api/auth")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    
    // Additional hardening headers
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("X-Download-Options", "noopen");
    
    next();
  });
  
  // === 6. REQUEST SIZE LIMITS (Prevent DoS) ===
  // Note: Set this BEFORE body-parser middleware
  // app.use(express.json({ limit: "10kb" })); // For auth payloads
};