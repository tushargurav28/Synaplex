import express from "express";
import { 
  getProfile, 
  updateProfile, 
  updatePassword, 
  updateAvatar 
} from "../controllers/profile.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { uploadSingle, validateUpload } from "../middleware/upload.js";

const router = express.Router();

router.get("/me", protectRoute, getProfile);
router.patch("/me", protectRoute, updateProfile);
router.patch("/password", protectRoute, updatePassword);
router.post("/avatar", protectRoute, uploadSingle, validateUpload, updateAvatar);

export default router;