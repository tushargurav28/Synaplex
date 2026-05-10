import { useState, useEffect } from "react";
import { FiBell, FiX, FiCheck, FiUsers, FiMessageSquare } from "react-icons/fi";
import api from "../../api/axios";
import toast from "react-hot-toast";

const NotificationsModal = ({ onClose }) => {
    const [invitations, setInvitations] = useState([]);
    const [unreadMessages, setUnreadMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const [invitesRes, messagesRes] = await Promise.all([
                    api.get("/invitations"),
                    api.get("/messages/unread")
                ]);
                setInvitations(invitesRes.data);
                
                // Group unread messages by conversation
                const groupedMessages = messagesRes.data.reduce((acc, msg) => {
                    const convId = msg.conversationId?._id || msg.conversationId;
                    if (!acc[convId]) {
                        acc[convId] = {
                            conversation: msg.conversationId,
                            sender: msg.senderId,
                            count: 0,
                            latestMessage: msg.message,
                            createdAt: msg.createdAt
                        };
                    }
                    acc[convId].count++;
                    return acc;
                }, {});
                
                setUnreadMessages(Object.values(groupedMessages));
            } catch (error) {
                console.error("Error fetching notifications:", error);
                toast.error("Failed to load notifications");
            } finally {
                setLoading(false);
            }
        };

        fetchNotifications();
    }, []);

    const handleRespond = async (id, status) => {
        setActionLoading(id);
        try {
            await api.patch(`/invitations/${id}/respond`, { status });
            setInvitations(prev => prev.filter(inv => inv._id !== id));
            toast.success(`Invitation ${status}`);
            
            if (status === "accepted") {
                setTimeout(() => window.location.reload(), 1500);
            }
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to respond to invitation");
        } finally {
            setActionLoading(null);
        }
    };

    const hasNotifications = invitations.length > 0 || unreadMessages.length > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-base-200">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <FiBell className="text-primary" /> Notifications
                    </h2>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <span className="loading loading-spinner loading-lg text-primary"></span>
                        </div>
                    ) : !hasNotifications ? (
                        <div className="text-center py-10">
                            <FiBell className="w-12 h-12 mx-auto text-base-content/20 mb-3" />
                            <h3 className="font-semibold text-lg">All Caught Up!</h3>
                            <p className="text-base-content/60 text-sm">You have no pending invitations or unread messages.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {/* Unread Messages */}
                            {unreadMessages.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">Unread Messages</h3>
                                    <div className="flex flex-col gap-2">
                                        {unreadMessages.map(msg => (
                                            <div key={msg.conversation._id} className="bg-base-200 hover:bg-base-300 transition-colors cursor-pointer rounded-xl p-3 flex items-center gap-3 border border-base-300" onClick={onClose}>
                                                <div className="avatar">
                                                    <div className="w-10 h-10 rounded-full">
                                                        <img 
                                                            src={msg.conversation.isGroup ? (msg.conversation.groupPhoto || `https://ui-avatars.com/api/?name=${msg.conversation.groupName}&background=random`) : (msg.sender?.profilePic || `https://ui-avatars.com/api/?name=${msg.sender?.fullName || "User"}&background=random`)} 
                                                            alt="Avatar"
                                                            onError={(e) => { 
                                                                e.target.onerror = null; 
                                                                e.target.src = `https://ui-avatars.com/api/?name=User&background=random`; 
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <p className="text-sm font-semibold truncate">
                                                            {msg.conversation.isGroup ? msg.conversation.groupName : msg.sender?.fullName}
                                                        </p>
                                                        <span className="text-[10px] text-base-content/50 whitespace-nowrap ml-2">
                                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-base-content/70 truncate flex items-center gap-1">
                                                        {msg.conversation.isGroup && <span className="font-medium">{msg.sender?.username}: </span>}
                                                        {msg.latestMessage}
                                                    </p>
                                                </div>
                                                <div className="badge badge-primary badge-sm">{msg.count}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Invitations */}
                            {invitations.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2 mt-2">Invitations</h3>
                                    <div className="flex flex-col gap-2">
                                        {invitations.map(inv => (
                                            <div key={inv._id} className="bg-base-200 rounded-xl p-3 flex flex-col gap-3 border border-base-300">
                                                <div className="flex items-center gap-3">
                                                    <div className="avatar">
                                                        <div className="w-10 h-10 rounded-full">
                                                            <img 
                                                                src={inv.sender?.profilePic || `https://ui-avatars.com/api/?name=${inv.sender?.fullName || "User"}&background=random`} 
                                                                alt="Sender"
                                                                onError={(e) => { 
                                                                    e.target.onerror = null; 
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${inv.sender?.fullName || "User"}&background=random`; 
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm">
                                                            <span className="font-semibold">{inv.sender?.fullName}</span> wants to 
                                                            {inv.type === "group" ? " add you to a group:" : " connect with you."}
                                                        </p>
                                                        {inv.type === "group" && inv.conversation && (
                                                            <div className="mt-1 flex items-center gap-2 text-xs font-semibold bg-base-300 p-1.5 rounded w-max">
                                                                <FiUsers className="text-primary" /> {inv.conversation.groupName}
                                                            </div>
                                                        )}
                                                        <p className="text-xs text-base-content/50 mt-1">
                                                            {new Date(inv.createdAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-2 justify-end">
                                                    <button 
                                                        onClick={() => handleRespond(inv._id, "rejected")}
                                                        className="btn btn-sm btn-ghost text-error"
                                                        disabled={actionLoading === inv._id}
                                                    >
                                                        Decline
                                                    </button>
                                                    <button 
                                                        onClick={() => handleRespond(inv._id, "accepted")}
                                                        className="btn btn-sm btn-primary"
                                                        disabled={actionLoading === inv._id}
                                                    >
                                                        {actionLoading === inv._id ? (
                                                            <span className="loading loading-spinner loading-xs"></span>
                                                        ) : (
                                                            <><FiCheck /> Accept</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationsModal;
