import CallLog from "../models/callLog.model.js";

/**
 * GET /api/calls/history
 * Returns the call history for the authenticated user (as caller or receiver)
 */
export const getCallHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [calls, total] = await Promise.all([
            CallLog.find({
                $or: [{ caller: userId }, { receiver: userId }],
                status: { $ne: "ongoing" }  // Don't show stuck "ongoing" calls
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate("caller", "username fullName profilePic")
            .populate("receiver", "username fullName profilePic")
            .lean(),

            CallLog.countDocuments({
                $or: [{ caller: userId }, { receiver: userId }],
                status: { $ne: "ongoing" }
            })
        ]);

        res.json({
            success: true,
            calls,
            total,
            page: parseInt(page),
            hasMore: skip + calls.length < total
        });
    } catch (error) {
        console.error("❌ getCallHistory error:", error.message);
        res.status(500).json({ error: "Failed to fetch call history" });
    }
};

/**
 * DELETE /api/calls/:callId
 * Delete a single call log entry (own calls only)
 */
export const deleteCallLog = async (req, res) => {
    try {
        const userId = req.user._id;
        const { callId } = req.params;

        const call = await CallLog.findById(callId);
        if (!call) return res.status(404).json({ error: "Call log not found" });

        const isParticipant = call.caller.toString() === userId.toString() ||
                              call.receiver.toString() === userId.toString();
        if (!isParticipant) return res.status(403).json({ error: "Not authorized" });

        await call.deleteOne();
        res.json({ success: true, message: "Call log deleted" });
    } catch (error) {
        console.error("❌ deleteCallLog error:", error.message);
        res.status(500).json({ error: "Failed to delete call log" });
    }
};

/**
 * DELETE /api/calls/history/clear
 * Clear all call history for the authenticated user
 */
export const clearCallHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        await CallLog.deleteMany({
            $or: [{ caller: userId }, { receiver: userId }]
        });
        res.json({ success: true, message: "Call history cleared" });
    } catch (error) {
        console.error("❌ clearCallHistory error:", error.message);
        res.status(500).json({ error: "Failed to clear call history" });
    }
};
