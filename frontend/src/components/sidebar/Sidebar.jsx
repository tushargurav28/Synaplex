import { useState, useEffect } from "react";
import { FiSettings, FiShield, FiLogOut, FiUsers, FiPlus, FiBell } from "react-icons/fi";
import { AiOutlineRobot } from "react-icons/ai";
import { useAuthStore } from "../../store/useAuthStore";
import { useSocketStore } from "../../store/useSocketStore";
import Conversations from "./Conversations";
import LogoutButton from "./LogoutButton";
import SearchInput from "./SearchInput";
import ProfileSettings from "../../pages/profile/ProfileSettings";
import AIChatPanel from "../chat/AIChatPanel";
import CreateGroupModal from "./CreateGroupModal";
import NotificationsModal from "./NotificationsModal";
import AgentManager from "../chat/AgentManager";
import api from "../../api/axios";

const Sidebar = () => {
    const { authUser } = useAuthStore();
    const { onlineUsers, socket } = useSocketStore();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showAIChat, setShowAIChat] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [showNotificationsModal, setShowNotificationsModal] = useState(false);
    const [showAgentManager, setShowAgentManager] = useState(false);
    const [unreadInvites, setUnreadInvites] = useState(0);

    const isAdmin = authUser?.role === "admin";

    useEffect(() => {
        // Fetch initial unread count
        const fetchNotifications = async () => {
            try {
                const [invitesRes, unreadRes] = await Promise.all([
                    api.get("/invitations"),
                    api.get("/messages/unread")
                ]);
                setUnreadInvites(invitesRes.data.length + unreadRes.data.length);
            } catch (error) {
                console.error("Failed to fetch notifications count");
            }
        };
        fetchNotifications();

        if (socket) {
            const myId = authUser._id?.toString();
            const handleNewInvite = () => setUnreadInvites(prev => prev + 1);
            const handleNewMessage = (newMessage) => {
                // senderId may be a string or a populated object
                const senderId = newMessage.senderId?._id?.toString() || newMessage.senderId?.toString();
                if (senderId && senderId !== myId) {
                    setUnreadInvites(prev => prev + 1);
                }
            };
            const handleMessagesRead = (data) => {
                setUnreadInvites(prev => Math.max(0, prev - (data.updatedCount || 1)));
            };

            socket.on("newInvitation", handleNewInvite);
            socket.on("newMessage", handleNewMessage);
            socket.on("messagesRead", handleMessagesRead);

            return () => {
                socket.off("newInvitation", handleNewInvite);
                socket.off("newMessage", handleNewMessage);
                socket.off("messagesRead", handleMessagesRead);
            };
        }
    }, [socket, authUser._id]);

    return (
        <>
            <div className="border-r border-base-200 flex flex-col w-full md:w-80 bg-base-100/80 backdrop-blur h-full">
                {/* Header */}
                <div className="p-4 border-b border-base-200">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                            Synaplex
                        </h1>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => {
                                    setShowNotificationsModal(true);
                                    setUnreadInvites(0);
                                }} 
                                className="btn btn-ghost btn-circle btn-sm relative" 
                                title="Notifications"
                            >
                                <FiBell className="w-5 h-5" />
                                {unreadInvites > 0 && (
                                    <span className="badge badge-xs badge-error absolute top-0 right-0"></span>
                                )}
                            </button>
                            <button onClick={() => setShowCreateGroupModal(true)} className="btn btn-ghost btn-circle btn-sm" title="Create Group">
                                <FiPlus className="w-5 h-5" />
                            </button>
                            <div className="dropdown dropdown-end">
                                <label tabIndex={0} className="btn btn-ghost btn-circle btn-sm">
                                    <FiSettings className="w-5 h-5" />
                                </label>
                                <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-52">
                                    <li>
                                        <button onClick={() => setShowCreateGroupModal(true)}>
                                            <FiUsers className="w-4 h-4" />
                                            Create Group
                                        </button>
                                    </li>
                                    <li>
                                        <button onClick={() => setShowProfileModal(true)}>
                                            <FiSettings className="w-4 h-4" />
                                            Profile Settings
                                        </button>
                                    </li>
                                    {isAdmin && (
                                        <li>
                                            <button onClick={() => setShowAdminPanel(true)}>
                                                <FiShield className="w-4 h-4" />
                                                Admin Dashboard
                                            </button>
                                        </li>
                                    )}
                                    <li>
                                        <button onClick={() => setShowAIChat(true)}>
                                            <AiOutlineRobot className="w-4 h-4" />
                                            AI Assistant
                                        </button>
                                    </li>
                                    <li>
                                        <button onClick={() => setShowAgentManager(true)}>
                                            <span className="text-base">🤖</span>
                                            My AI Agents
                                        </button>
                                    </li>
                                    <li>
                                        <LogoutButton />
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    {/* User Info */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/50">
                        <div className="avatar online">
                            <div className="w-10 h-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                <img 
                                    src={authUser?.profilePic || `https://ui-avatars.com/api/?name=${authUser?.username || "User"}&background=random`} 
                                    alt={authUser?.username} 
                                    onError={(e) => { 
                                        e.target.onerror = null; 
                                        e.target.src = `https://ui-avatars.com/api/?name=${authUser?.username || "User"}&background=random`; 
                                    }} 
                                />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{authUser?.fullName}</p>
                            <p className="text-xs text-base-content/60">@{authUser?.username}</p>
                        </div>
                        <div className="flex gap-2">
                            <span className="badge badge-primary badge-sm">
                                {onlineUsers.includes(authUser?._id) ? "Online" : "Offline"}
                            </span>
                            {authUser?.isPrivate && (
                                <span className="badge badge-secondary badge-sm" title="Your account is private">
                                    Private
                                </span>
                            )}
                        </div>
                    </div>
                    
                    {/* Search */}
                    <div className="mt-4">
                        <SearchInput />
                    </div>
                </div>
                
                {/* Conversations List */}
                <div className="flex-1 overflow-y-auto">
                    <Conversations />
                </div>
                
                {/* Footer Actions */}
                <div className="p-3 border-t border-base-200 flex gap-2">
                    <button 
                        onClick={() => setShowAIChat(true)}
                        className="btn btn-primary btn-sm flex-1 gap-2"
                    >
                        <AiOutlineRobot className="w-4 h-4" />
                        AI Chat
                    </button>
                    <button
                        onClick={() => setShowAgentManager(true)}
                        className="btn btn-ghost btn-sm gap-1"
                        title="My AI Agents"
                    >
                        <span className="text-base">🤖</span>
                    </button>
                    <button 
                        onClick={() => setShowProfileModal(true)}
                        className="btn btn-ghost btn-sm"
                    >
                        <FiSettings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Modals */}
            {showProfileModal && (
                <ProfileSettings onClose={() => setShowProfileModal(false)} />
            )}
            
            {showAIChat && (
                <AIChatPanel onClose={() => setShowAIChat(false)} />
            )}
            
            {showAdminPanel && isAdmin && (
                <AdminDashboard onClose={() => setShowAdminPanel(false)} />
            )}

            {showCreateGroupModal && (
                <CreateGroupModal onClose={() => setShowCreateGroupModal(false)} />
            )}

            {showNotificationsModal && (
                <NotificationsModal onClose={() => setShowNotificationsModal(false)} />
            )}

            {showAgentManager && (
                <AgentManager onClose={() => setShowAgentManager(false)} />
            )}
        </>
    );
};

// Admin Dashboard Component (inline)
const AdminDashboard = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState("users");
    const [users, setUsers] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [usersRes, metricsRes] = await Promise.all([
                api.get("/admin/users"),
                api.get("/admin/metrics")
            ]);
            
            setUsers(usersRes.data.users);
            setMetrics(metricsRes.data.metrics);
        } catch (error) {
            console.error("Failed to fetch admin data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserStatus = async (userId, action) => {
        try {
            await api.patch(`/admin/users/${userId}/${action}`);
            fetchData();
        } catch (error) {
            console.error("Failed to update user:", error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl bg-base-100 rounded-2xl shadow-2xl overflow-hidden max-h-screen flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-base-200">
                    <h2 className="text-xl font-bold">Admin Dashboard</h2>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiLogOut className="w-5 h-5 rotate-45" />
                    </button>
                </div>
                
                <div className="flex border-b border-base-200">
                    <button 
                        onClick={() => { setActiveTab("users"); fetchData(); }}
                        className={`flex-1 py-3 ${activeTab === "users" ? "border-b-2 border-primary font-medium" : ""}`}
                    >
                        Users
                    </button>
                    <button 
                        onClick={() => { setActiveTab("metrics"); fetchData(); }}
                        className={`flex-1 py-3 ${activeTab === "metrics" ? "border-b-2 border-primary font-medium" : ""}`}
                    >
                        Metrics
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <span className="loading loading-spinner loading-lg"></span>
                        </div>
                    ) : activeTab === "metrics" && metrics ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: "Total Users", value: metrics.totalUsers, color: "primary" },
                                { label: "Active Users", value: metrics.activeUsers, color: "success" },
                                { label: "Total Messages", value: metrics.totalMessages, color: "secondary" },
                                { label: "Open Reports", value: metrics.openReports, color: "warning" }
                            ].map((stat, i) => (
                                <div key={i} className={`stat bg-base-200 rounded-lg`}>
                                    <div className={`stat-title text-base-content/70`}>{stat.label}</div>
                                    <div className={`stat-value text-${stat.color}`}>{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : activeTab === "users" ? (
                        <div className="overflow-x-auto">
                            <table className="table table-zebra">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Email</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user._id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="avatar">
                                                        <div className="mask mask-squircle w-8 h-8">
                                                            <img 
                                                                src={user.profilePic || `https://ui-avatars.com/api/?name=${user.username || "User"}&background=random`} 
                                                                alt={user.username} 
                                                                onError={(e) => { 
                                                                    e.target.onerror = null; 
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${user.username || "User"}&background=random`; 
                                                                }} 
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{user.fullName}</div>
                                                        <div className="text-xs text-base-content/60">@{user.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{user.email}</td>
                                            <td>
                                                <span className={`badge ${user.isActive ? "badge-success" : "badge-error"}`}>
                                                    {user.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    {user.isActive ? (
                                                        <button 
                                                            onClick={() => handleUserStatus(user._id, "deactivate")}
                                                            className="btn btn-error btn-xs"
                                                        >
                                                            Deactivate
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleUserStatus(user._id, "activate")}
                                                            className="btn btn-success btn-xs"
                                                        >
                                                            Activate
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default Sidebar;