import express from "express";
import path from "path";
import protectRoute from "../middleware/protectRoute.js";
import { uploadSingle, validateUpload } from "../middleware/upload.js";

const router = express.Router();

router.post("/", protectRoute, uploadSingle, validateUpload, (req, res) => {
  try {
    // Use relative path — works with Vite proxy in dev, nginx/CDN in prod
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.status(200).json({
      success: true,
      file: {
        url: fileUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        publicId: req.file.filename
      }
    });
  } catch (error) {
    console.error("❌ Upload route error:", error.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Serve uploaded files (in production, use CDN/static server)
router.use("/uploads", express.static(process.env.UPLOAD_PATH || "uploads/"));

export default router;