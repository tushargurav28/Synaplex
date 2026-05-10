import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    reciverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        alias: "receiverId"
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,
        index: true
    },
    message: {
        type: String,
        required: function() {
            // Message text required only if no attachments
            return !this.attachments || this.attachments.length === 0;
        }
    },
    // NEW: Message type for media support
    type: {
        type: String,
        enum: ["text", "image", "file", "audio", "code"],
        default: "text",
        index: true
    },
    // Code block metadata (for type="code")
    codeLanguage: {
        type: String,
        default: "plaintext",
        trim: true
    },
    // Agent message fields
    isAgentMessage: {
        type: Boolean,
        default: false
    },
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent"
    },
    agentName: {
        type: String,
        trim: true
    },
    agentAvatar: {
        type: String,
        default: "🤖"
    },
    // Mentioned users in the message
    mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    // NEW: Attachments array for media/file messages
    attachments: [{
        url: { type: String, required: true },
        publicId: String, // Cloudinary/S3 key
        fileName: { type: String, trim: true },
        mimeType: String,
        size: Number, // bytes
        thumbnailUrl: String // for images/videos
    }],
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent',
        index: true
    },
    edited: {
        type: Boolean,
        default: false
    },
    deleted: {
        type: Boolean,
        default: false
    },
    // NEW: For search indexing
    searchContent: {
        type: String,
        index: { type: "text" }
    }
}, { timestamps: true });

// Pre-save: generate search content for text messages
messageSchema.pre("save", function(next) {
    if (this.isModified("message") && this.type === "text") {
        this.searchContent = this.message;
    }
    next();
});

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ reciverId: 1, status: 1 });
messageSchema.index({ senderId: 1, reciverId: 1 });
// NEW: Text index for search
messageSchema.index({ searchContent: "text", conversationId: 1 }, { default_language: "none" });
// NEW: Index for attachment queries
messageSchema.index({ type: 1, conversationId: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;