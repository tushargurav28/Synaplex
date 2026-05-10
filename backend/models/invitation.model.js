import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    type: {
        type: String,
        enum: ["direct", "group"],
        required: true
    },
    conversation: { // Required if type is 'group'
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending"
    }
}, { timestamps: true });

// Ensure a user doesn't get spammed with identical pending invites
invitationSchema.index({ sender: 1, receiver: 1, type: 1, conversation: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

const Invitation = mongoose.model("Invitation", invitationSchema);

export default Invitation;
