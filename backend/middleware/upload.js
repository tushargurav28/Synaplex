import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage config for local uploads (Cloudinary/S3 can be swapped in)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.resolve(__dirname, "..", process.env.UPLOAD_PATH || "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    // Sanitize filename, add UUID to prevent collisions
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    "image/jpeg", "image/png", "image/gif", "image/webp",
    // Documents
    "application/pdf", "application/msword", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Audio
    "audio/mpeg", "audio/wav", "audio/ogg"
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("File type not allowed. Allowed: images, PDF, DOC, audio."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  }
});

export const uploadSingle = upload.single("file");

export const validateUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  // Additional server-side validation
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".mp3", ".wav", ".ogg"];
  const ext = path.extname(req.file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: "File extension not allowed" });
  }
  
  next();
};

export default upload;