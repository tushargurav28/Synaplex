import { useState, useEffect, useCallback } from "react";
import {
    FiPhone, FiVideo, FiPhoneIncoming, FiPhoneMissed, FiPhoneOff,
    FiX, FiTrash2, FiRefreshCw, FiClock, FiCalendar
} from "react-icons/fi";
import api from "../../api/axios";
import { useAuthStore } from "../../store/useAuthStore";
import toast from "react-hot-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDuration = (secs) => {
    if (!secs || secs === 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

const formatTimestamp = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return `Yesterday, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (days < 7) return `${d.toLocaleDateString([], { weekday: "short" })}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

// ─── Status badge config ───────────────────────────────────────────────────────
const statusConfig = {
    answered: {
        label: "Answered",
        icon: FiPhone,
        color: "text-green-400",
        bgColor: "bg-green-500/10 border-green-500/20"
    },
    missed: {
        label: "Missed",
        icon: FiPhoneMissed,
        color: "text-red-400",
        bgColor: "bg-red-500/10 border-red-500/20"
    },
    rejected: {
        label: "Declined",
        icon: FiPhoneOff,
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 border-orange-500/20"
    },
    ongoing: {
        label: "Ongoing",
        icon: FiPhone,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 border-blue-500/20"
    }
};

// ─── Single Call Row ───────────────────────────────────────────────────────────
const CallRow = ({ call, authUserId, onDelete, onCallback }) => {
    const isOutgoing = call.caller?._id === authUserId || call.caller?.toString() === authUserId;
    const otherParty = isOutgoing ? call.receiver : call.caller;
    const cfg = statusConfig[call.status] || statusConfig.answered;
    const StatusIcon = cfg.icon;
    const CallTypeIcon = call.type === "video" ? FiVideo : FiPhone;
    const duration = formatDuration(call.duration);

    const avatarSrc = otherParty?.profilePic ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(otherParty?.fullName || "User")}&background=random&size=64`;

    return (
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-base-200/60 transition-colors group rounded-lg mx-2">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div className="w-11 h-11 rounded-full overflow-hidden border border-base-300">
                    <img
                        src={avatarSrc}
                        alt={otherParty?.fullName}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(otherParty?.fullName || "U")}&background=random`; }}
                    />
                </div>
                {/* Call type badge */}
                <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-base-100 ${call.type === "video" ? "bg-cyan-500" : "bg-violet-500"}`}>
                    <CallTypeIcon className="w-2.5 h-2.5 text-white" />
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{otherParty?.fullName || "Unknown"}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.color} ${cfg.bgColor} flex items-center gap-1 flex-shrink-0`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {cfg.label}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-base-content/50">
                    {/* Direction */}
                    <span className="flex items-center gap-1">
                        {isOutgoing
                            ? <FiPhone className="w-3 h-3 rotate-45" />
                            : <FiPhoneIncoming className="w-3 h-3" />
                        }
                        {isOutgoing ? "Outgoing" : "Incoming"}
                    </span>

                    {/* Duration */}
                    {duration && (
                        <span className="flex items-center gap-1">
                            <FiClock className="w-3 h-3" />
                            {duration}
                        </span>
                    )}

                    {/* Time */}
                    <span className="flex items-center gap-1 ml-auto">
                        <FiCalendar className="w-3 h-3" />
                        {formatTimestamp(call.createdAt)}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {/* Call back */}
                <button
                    onClick={() => onCallback(otherParty, call.type)}
                    className="btn btn-ghost btn-circle btn-xs text-green-400 hover:bg-green-500/10"
                    title={`Call back — ${call.type}`}
                >
                    <CallTypeIcon className="w-3.5 h-3.5" />
                </button>
                {/* Delete */}
                <button
                    onClick={() => onDelete(call._id)}
                    className="btn btn-ghost btn-circle btn-xs text-error hover:bg-error/10"
                    title="Remove from history"
                >
                    <FiTrash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

// ─── Call History Panel ────────────────────────────────────────────────────────
const CallHistoryPanel = ({ onClose, onStartCall }) => {
    const { authUser } = useAuthStore();
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all"); // all | missed | answered | rejected
    const [clearing, setClearing] = useState(false);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get("/calls/history?limit=50");
            setCalls(res.data.calls || []);
        } catch (err) {
            toast.error("Failed to load call history");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleDelete = async (callId) => {
        try {
            await api.delete(`/calls/${callId}`);
            setCalls(prev => prev.filter(c => c._id !== callId));
        } catch {
            toast.error("Failed to delete call log");
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm("Clear all call history?")) return;
        setClearing(true);
        try {
            await api.delete("/calls/history/clear");
            setCalls([]);
            toast.success("Call history cleared");
        } catch {
            toast.error("Failed to clear history");
        } finally {
            setClearing(false);
        }
    };

    const handleCallback = (user, type) => {
        if (!user?._id) return;
        onStartCall?.(user, type);
        onClose();
    };

    const filtered = calls.filter(c => filter === "all" || c.status === filter);

    // Stats
    const stats = {
        total: calls.length,
        missed: calls.filter(c => c.status === "missed").length,
        answered: calls.filter(c => c.status === "answered").length,
        rejected: calls.filter(c => c.status === "rejected").length,
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-base-200">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold">Call History</h2>
                            <p className="text-xs text-base-content/50">{stats.total} total calls</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchHistory}
                                className="btn btn-ghost btn-circle btn-sm"
                                title="Refresh"
                            >
                                <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            </button>
                            {calls.length > 0 && (
                                <button
                                    onClick={handleClearAll}
                                    disabled={clearing}
                                    className="btn btn-ghost btn-circle btn-sm text-error"
                                    title="Clear all history"
                                >
                                    <FiTrash2 className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
                                <FiX className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        {[
                            { label: "Answered", count: stats.answered, color: "text-green-400", bg: "bg-green-500/10" },
                            { label: "Missed", count: stats.missed, color: "text-red-400", bg: "bg-red-500/10" },
                            { label: "Declined", count: stats.rejected, color: "text-orange-400", bg: "bg-orange-500/10" },
                        ].map(s => (
                            <div key={s.label} className={`rounded-xl p-2 text-center ${s.bg}`}>
                                <p className={`text-lg font-bold ${s.color}`}>{s.count}</p>
                                <p className="text-[10px] text-base-content/50">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 bg-base-200 rounded-xl p-1">
                        {["all", "answered", "missed", "rejected"].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all capitalize ${
                                    filter === f
                                        ? "bg-base-100 shadow text-base-content"
                                        : "text-base-content/50 hover:text-base-content"
                                }`}
                            >
                                {f === "rejected" ? "Declined" : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Calls list */}
                <div className="flex-1 overflow-y-auto py-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3">
                            <span className="loading loading-spinner loading-md text-primary" />
                            <p className="text-sm text-base-content/50">Loading history…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/40">
                            <div className="w-14 h-14 rounded-full bg-base-200 flex items-center justify-center">
                                <FiPhoneMissed className="w-6 h-6" />
                            </div>
                            <p className="text-sm">
                                {filter === "all" ? "No call history yet" : `No ${filter} calls`}
                            </p>
                        </div>
                    ) : (
                        filtered.map(call => (
                            <CallRow
                                key={call._id}
                                call={call}
                                authUserId={authUser?._id}
                                onDelete={handleDelete}
                                onCallback={handleCallback}
                            />
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-3 border-t border-base-200 text-center">
                    <p className="text-[10px] text-base-content/30">
                        Hover over a call to call back or remove it
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CallHistoryPanel;
