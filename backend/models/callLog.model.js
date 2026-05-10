import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema({
    caller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        default: null
    },
    type: {
        type: String,
        enum: ["voice", "video"],
        required: true
    },
    status: {
        type: String,
        enum: ["ongoing", "answered", "missed", "rejected"],
        default: "ongoing"
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    answeredAt: {
        type: Date,
        default: null
    },
    endTime: {
        type: Date,
        default: null
    },
    duration: {
        type: Number,   // seconds
        default: 0
    }
}, { timestamps: true });

// Indexes for fast lookup
callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ receiver: 1, createdAt: -1 });

const CallLog = mongoose.model("CallLog", callLogSchema);
export default CallLog;
