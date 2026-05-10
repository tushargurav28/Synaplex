import mongoose from "mongoose";

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Agent name is required"],
        trim: true,
        minlength: [2, "Agent name must be at least 2 characters"],
        maxlength: [50, "Agent name cannot exceed 50 characters"]
    },
    // The trigger name used with @agentName
    triggerName: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        match: [/^[a-z0-9_-]+$/, "Trigger name can only contain lowercase letters, numbers, underscores and hyphens"]
    },
    // Creator of the agent
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    // Optional system instructions / persona
    instructions: {
        type: String,
        trim: true,
        maxlength: [2000, "Instructions cannot exceed 2000 characters"],
        default: ""
    },
    // What this agent is designed to do
    description: {
        type: String,
        trim: true,
        maxlength: [500, "Description cannot exceed 500 characters"],
        default: ""
    },
    // Avatar/emoji for this agent
    avatar: {
        type: String,
        default: "🤖"
    },
    // Model to use
    model: {
        type: String,
        default: "qwen/qwen3-coder-480b-a35b-instruct"
    },
    // Whether this agent can search the internet
    canSearchWeb: {
        type: Boolean,
        default: true
    },
    // Groups where this agent is added
    addedToGroups: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation"
    }],
    // Is the agent active
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

agentSchema.index({ createdBy: 1 });
agentSchema.index({ addedToGroups: 1 });

const Agent = mongoose.model("Agent", agentSchema);
export default Agent;
