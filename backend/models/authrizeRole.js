import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        required: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        index: true
    },
    reason: {
        type: String,
        required: true,
        enum: [
            "spam",
            "harassment",
            "inappropriate-content",
            "impersonation",
            "other"
        ]
    },
    description: {
        type: String,
        maxlength: 1000,
        trim: true
    },
    status: {
        type: String,
        enum: ["open", "resolved", "dismissed"],
        default: "open",
        index: true
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    resolvedAt: Date,
    adminNotes: {
        type: String,
        maxlength: 500
    }
}, { timestamps: true });

// Indexes for admin queries
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, status: 1 });

const Report = mongoose.model("Report", reportSchema);

export default Report;