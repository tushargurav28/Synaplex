import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
    // Participants: works for both 1:1 and group chats
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    
    // Messages reference (kept for backward compatibility)
    // New messages should be queried via Message model with conversationId
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: []
    }],

    // === PERSONAL AGENT CHAT FIELD ===
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent"
    },
    
    // === GROUP CHAT FIELDS ===
    isGroup: {
        type: Boolean,
        default: false,
        index: true
    },
    groupName: {
        type: String,
        trim: true,
        minlength: [1, "Group name is required for group chats"],
        maxlength: [100, "Group name cannot exceed 100 characters"],
        // Required only if isGroup is true (validated in pre-save hook)
    },
    groupPhoto: {
        type: String,
        default: "",
        validate: {
            validator: function(v) {
                return !v || /^https?:\/\/.+/.test(v) || /^\/uploads\//.test(v);
            },
            message: props => `${props.value} is not a valid URL!`
        }
    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
}, { timestamps: true });

// === VALIDATION HOOKS ===
conversationSchema.pre("save", function(next) {
    // If creating a group, ensure required fields exist
    if (this.isNew && this.isGroup) {
        if (!this.groupName || this.groupName.trim() === "") {
            return next(new Error("Group name is required when creating a group conversation"));
        }
        if (!this.admins || this.admins.length === 0) {
            // Auto-add creator as admin if not specified
            // This should be set in controller before save
            return next(new Error("At least one admin is required for group conversations"));
        }
    }
    next();
});

// === INDEXES FOR PERFORMANCE ===
// Fast lookup: find conversations by participant
conversationSchema.index({ participants: 1 });
// Fast lookup: find groups by name (case-insensitive)
conversationSchema.index({ groupName: "text" }, { default_language: "none" });
// Compound index for group queries
conversationSchema.index({ isGroup: 1, participants: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;