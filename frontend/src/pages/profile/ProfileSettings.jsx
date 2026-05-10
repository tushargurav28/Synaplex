import { useState, useRef, useCallback } from "react";
import { useAuthStore } from "../../store/useAuthStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FiUser, FiLock, FiEye, FiEyeOff, FiUpload, FiSave, FiX, FiCheck } from "react-icons/fi";
import api from "../../api/axios";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../utils/cropImage";

const ProfileSettings = ({ onClose }) => {
    const { authUser, setAuthUser: updateProfile } = useAuthStore();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    const [activeTab, setActiveTab] = useState("general");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    const [formData, setFormData] = useState({
        fullName: authUser?.fullName || "",
        username: authUser?.username || "",
        bio: authUser?.bio || "",
        isPrivate: authUser?.isPrivate || false,
        allowMessagesFrom: authUser?.allowMessagesFrom || "everyone",
        lastSeenVisibility: authUser?.lastSeenVisibility || "everyone",
    });
    
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });
    
    const [avatarPreview, setAvatarPreview] = useState(authUser?.profilePic || "");
    const [avatarFile, setAvatarFile] = useState(null);

    // Cropper states
    const [imageToCrop, setImageToCrop] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isCropping, setIsCropping] = useState(false);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            toast.error("File size must be less than 10MB");
            return;
        }
        
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }
        
        setImageToCrop(URL.createObjectURL(file));
        setIsCropping(true);
        // Reset input so same file can be selected again
        e.target.value = "";
    };

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleSaveCrop = async () => {
        try {
            const { file, url } = await getCroppedImg(imageToCrop, croppedAreaPixels);
            setAvatarFile(file);
            setAvatarPreview(url);
            setIsCropping(false);
            setImageToCrop(null);
        } catch (e) {
            toast.error("Failed to crop image");
            setIsCropping(false);
        }
    };

    const handleCancelCrop = () => {
        setIsCropping(false);
        setImageToCrop(null);
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const res = await api.patch("/profile/me", formData);
            updateProfile(res.data.user);
            toast.success("Profile updated successfully");
            onClose?.();
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAvatar = async () => {
        if (!avatarFile) return;
        
        setLoading(true);
        const formData = new FormData();
        formData.append("file", avatarFile, "avatar.jpg");
        
        try {
            const res = await api.post("/profile/avatar", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            
            updateProfile({ profilePic: res.data.user.profilePic });
            toast.success("Profile picture updated");
            setAvatarFile(null);
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to upload avatar");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            return toast.error("New passwords do not match");
        }
        if (passwordData.newPassword.length < 12) {
            return toast.error("Password must be at least 12 characters");
        }
        
        setLoading(true);
        try {
            await api.patch("/profile/password", {
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            
            toast.success("Password updated successfully");
            setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to update password");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout");
        } finally {
            updateProfile(null);
            navigate("/login");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-base-100 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-base-200">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold">Profile Settings</h2>
                        {authUser?.isPrivate && (
                            <span className="badge badge-secondary badge-sm ml-2">Private</span>
                        )}
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-base-200">
                    {[
                        { id: "general", label: "General", icon: FiUser },
                        { id: "privacy", label: "Privacy", icon: FiEye },
                        { id: "security", label: "Security", icon: FiLock }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
                                ${activeTab === tab.id 
                                    ? "text-primary border-b-2 border-primary" 
                                    : "text-base-content/70 hover:text-base-content"}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <form className="p-6 space-y-6 max-h-96 overflow-y-auto" onSubmit={activeTab === "general" ? handleUpdateProfile : activeTab === "security" ? handleUpdatePassword : undefined}>
                    
                    {/* General Tab */}
                    {activeTab === "general" && (
                        <>
                            {/* Avatar Upload */}
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="avatar">
                                        <div className="w-20 h-20 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                            <img 
                                                src={avatarPreview || `https://ui-avatars.com/api/?name=${authUser?.username || "User"}&background=random`} 
                                                alt="Profile" 
                                                className="object-cover" 
                                                onError={(e) => { 
                                                    e.target.onerror = null; 
                                                    e.target.src = `https://ui-avatars.com/api/?name=${authUser?.username || "User"}&background=random`; 
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute bottom-0 right-0 btn btn-primary btn-xs btn-circle"
                                    >
                                        <FiUpload className="w-3 h-3" />
                                    </button>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarSelect}
                                />
                                <div>
                                    <p className="text-sm font-medium">Profile Picture</p>
                                    <p className="text-xs text-base-content/60">JPG, PNG up to 10MB</p>
                                    {avatarFile && (
                                        <button
                                            type="button"
                                            onClick={handleUpdateAvatar}
                                            disabled={loading}
                                            className="btn btn-primary btn-xs mt-2"
                                        >
                                            {loading ? "Uploading..." : "Save Changes"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="label">
                                        <span className="label-text">Full Name</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleInputChange}
                                        className="input input-bordered w-full"
                                        placeholder="Your full name"
                                    />
                                </div>
                                
                                <div>
                                    <label className="label">
                                        <span className="label-text">Username</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        className="input input-bordered w-full"
                                        placeholder="@username"
                                    />
                                </div>
                                
                                <div>
                                    <label className="label">
                                        <span className="label-text">Bio</span>
                                    </label>
                                    <textarea
                                        name="bio"
                                        value={formData.bio}
                                        onChange={handleInputChange}
                                        className="textarea textarea-bordered w-full"
                                        placeholder="Tell us about yourself..."
                                        rows={3}
                                        maxLength={500}
                                    />
                                    <p className="text-xs text-base-content/60 text-right">{formData.bio.length}/500</p>
                                </div>
                            </div>
                            
                            <button type="submit" disabled={loading} className="btn btn-primary w-full">
                                {loading ? "Saving..." : <><FiSave className="w-4 h-4" /> Save Changes</>}
                            </button>
                        </>
                    )}

                    {/* Privacy Tab */}
                    {activeTab === "privacy" && (
                        <div className="space-y-6">
                            <div className="form-control">
                                <label className="label cursor-pointer justify-start gap-4">
                                    <input
                                        type="checkbox"
                                        name="isPrivate"
                                        checked={formData.isPrivate}
                                        onChange={handleInputChange}
                                        className="toggle toggle-primary"
                                    />
                                    <span className="label-text">Private Account</span>
                                </label>
                                <p className="text-xs text-base-content/60 ml-10">
                                    When enabled, only approved contacts can message you
                                </p>
                            </div>
                            
                            <div>
                                <label className="label">
                                    <span className="label-text">Allow Messages From</span>
                                </label>
                                <select
                                    name="allowMessagesFrom"
                                    value={formData.allowMessagesFrom}
                                    onChange={handleInputChange}
                                    className="select select-bordered w-full"
                                >
                                    <option value="everyone">Everyone</option>
                                    <option value="contacts">Contacts Only</option>
                                    <option value="none">Nobody</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="label">
                                    <span className="label-text">Last Seen Visibility</span>
                                </label>
                                <select
                                    name="lastSeenVisibility"
                                    value={formData.lastSeenVisibility}
                                    onChange={handleInputChange}
                                    className="select select-bordered w-full"
                                >
                                    <option value="everyone">Everyone</option>
                                    <option value="contacts">Contacts Only</option>
                                    <option value="none">Nobody</option>
                                </select>
                            </div>
                            
                            <button type="button" onClick={handleUpdateProfile} disabled={loading} className="btn btn-primary w-full">
                                {loading ? "Saving..." : <><FiSave className="w-4 h-4" /> Save Privacy Settings</>}
                            </button>
                        </div>
                    )}

                    {/* Security Tab */}
                    {activeTab === "security" && (
                        <div className="space-y-4">
                            <div>
                                <label className="label">
                                    <span className="label-text">Current Password</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="currentPassword"
                                        value={passwordData.currentPassword}
                                        onChange={handlePasswordChange}
                                        className="input input-bordered w-full pr-10"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content"
                                    >
                                        {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="label">
                                    <span className="label-text">New Password</span>
                                </label>
                                <input
                                    type="password"
                                    name="newPassword"
                                    value={passwordData.newPassword}
                                    onChange={handlePasswordChange}
                                    className="input input-bordered w-full"
                                    placeholder="Min 12 characters"
                                    minLength={12}
                                />
                            </div>
                            
                            <div>
                                <label className="label">
                                    <span className="label-text">Confirm New Password</span>
                                </label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={passwordData.confirmPassword}
                                    onChange={handlePasswordChange}
                                    className="input input-bordered w-full"
                                    placeholder="Re-enter new password"
                                />
                            </div>
                            
                            <button type="submit" disabled={loading} className="btn btn-primary w-full">
                                {loading ? "Updating..." : <><FiLock className="w-4 h-4" /> Update Password</>}
                            </button>
                            
                            <div className="divider">OR</div>
                            
                            <button type="button" onClick={handleLogout} className="btn btn-error btn-outline w-full">
                                Sign Out
                            </button>
                        </div>
                    )}
                </form>
            </div>

            {/* Cropper Modal */}
            {isCropping && imageToCrop && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-base-200 flex justify-between items-center">
                            <h3 className="font-bold">Crop Profile Picture</h3>
                            <button onClick={handleCancelCrop} className="btn btn-ghost btn-sm btn-circle">
                                <FiX className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="relative w-full h-64 bg-base-300">
                            <Cropper
                                image={imageToCrop}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <span className="text-sm">Zoom:</span>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="range range-xs range-primary flex-1"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button className="btn btn-ghost" onClick={handleCancelCrop}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSaveCrop}>
                                    <FiCheck className="w-4 h-4" /> Apply
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileSettings;