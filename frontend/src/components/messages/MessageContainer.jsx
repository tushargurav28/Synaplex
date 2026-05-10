import { useEffect, useState, useRef, useMemo } from "react";
import { useChatStore } from "../../store/useChatStore";
import MessageInput from "./MessageInput";
import Messages from "./Messages";
import { FiVideo, FiPhone, FiSearch, FiMoreVertical, FiFlag, FiUsers, FiInfo } from "react-icons/fi";
import { TiMessages } from "react-icons/ti";
import { useAuthStore } from "../../store/useAuthStore";
import { useSocketStore } from "../../store/useSocketStore";
import CallInterface from "../chat/CallInterface";
import PersonalAgentChat from "../chat/PersonalAgentChat";
import GroupInfoPanel from "./GroupInfoPanel";
import CallHistoryPanel from "../chat/CallHistoryPanel";
import api from "../../api/axios";
import toast from "react-hot-toast";

const getGroupAvatar = (id, name) =>
    `https://api.dicebear.com/7.x/identicon/svg?seed=${id || name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const MessageContainer = () => {
    const { selectedUser: selectedConversation, setSelectedUser: setSelectedConversation } = useChatStore();
    const { socket, onlineUsers } = useSocketStore();
    // Assuming emitCallEvent is handled elsewhere or can be accessed via socket directly
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showReportModal, setShowReportModal] = useState(false);
    const [callType, setCallType] = useState(null);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [showCallHistory, setShowCallHistory] = useState(false);
    const [callbackTarget, setCallbackTarget] = useState(null); // { user, type } for callback from history
    const searchInputRef = useRef(null);

    // Stable avatar URL — computed once per selected conversation to avoid flickering
    const headerAvatarSrc = useMemo(() => {
        if (!selectedConversation) return null;
        if (selectedConversation.isGroup) {
            return selectedConversation.profilePic || selectedConversation.groupPhoto
                || getGroupAvatar(selectedConversation._id, selectedConversation.fullName);
        }
        if (selectedConversation.isPersonalAgent) {
            return `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedConversation.triggerName || selectedConversation.fullName}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
        }
        return selectedConversation.profilePic
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedConversation.fullName || "User")}&background=random`;
    }, [selectedConversation?._id, selectedConversation?.profilePic, selectedConversation?.groupPhoto, selectedConversation?.fullName]);

    useEffect(() => {
        return () => setSelectedConversation(null);
    }, [setSelectedConversation]);

    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    const handleStartCall = (type) => {
        if (!selectedConversation || !socket) {
            toast.error("Not connected. Please refresh and try again.");
            return;
        }
        if (selectedConversation.isGroup) {
            toast.error("Group calls are not supported yet.");
            return;
        }
        if (selectedConversation.isPersonalAgent) {
            toast.error("You cannot call an AI agent.");
            return;
        }
        console.log("[Call] Starting", type, "call to:", selectedConversation._id, selectedConversation.fullName);
        setCallType(type);
    };

    const handleReportMessage = async (messageId, reason) => {
        try {
            await api.post(`/reports/messages/${messageId}`, { reason });
            return true;
        } catch (error) {
            console.error("Report failed:", error);
            return false;
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim() || !selectedConversation?._id) return;
        
        try {
            const res = await api.get(`/search/messages?conversationId=${selectedConversation._id}&q=${encodeURIComponent(searchQuery)}`);
            if (res.data.success) {
                console.log("Search results:", res.data.results);
            }
        } catch (error) {
            console.error("Search failed:", error);
        }
    };

    return (
        <div className="md:min-w-[450px] flex flex-col w-full bg-base-100">
            {!selectedConversation ? (
                <NoChatSelected />
            ) : (
                <>
                    {/* Header */}
                    <div className="bg-base-200/80 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-base-300">
                        <div className="flex items-center gap-3">
                            {showSearch ? (
                                <form onSubmit={handleSearch} className="flex items-center gap-2">
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search messages..."
                                        className="input input-sm input-bordered w-40"
                                        onBlur={() => !searchQuery && setShowSearch(false)}
                                    />
                                    <button type="submit" className="btn btn-primary btn-sm">Search</button>
                                </form>
                            ) : (
                                <>
                                    <div
                                        className={`avatar ${onlineUsers.includes(selectedConversation._id) && !selectedConversation.isGroup ? 'online' : ''} ${selectedConversation.isGroup ? 'cursor-pointer' : ''}`}
                                        onClick={() => selectedConversation.isGroup && setShowGroupInfo(true)}
                                        title={selectedConversation.isGroup ? "View group info" : undefined}
                                    >
                                        <div className="w-10 h-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                            <img 
                                                src={headerAvatarSrc}
                                                alt={selectedConversation.fullName} 
                                                onError={(e) => { 
                                                    e.target.onerror = null; 
                                                    e.target.src = selectedConversation.isGroup
                                                        ? getGroupAvatar(selectedConversation._id, selectedConversation.fullName)
                                                        : selectedConversation.isPersonalAgent
                                                            ? `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedConversation.triggerName}&backgroundColor=b6e3f4,c0aede,d1d4f9`
                                                            : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedConversation.fullName || "User")}&background=random`;
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div
                                        className={selectedConversation.isGroup ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                                        onClick={() => selectedConversation.isGroup && setShowGroupInfo(true)}
                                    >
                                        <p className="font-bold flex items-center gap-1">
                                            {selectedConversation.fullName}
                                            {selectedConversation.isGroup && <FiInfo className="w-3.5 h-3.5 text-base-content/40" />}
                                        </p>
                                        <p className="text-xs text-base-content/60">
                                            {selectedConversation.isGroup ? (
                                                <span className="flex items-center gap-1">
                                                    <FiUsers className="w-3 h-3" />
                                                    {(selectedConversation.participants?.length || 0)} members · Tap for info
                                                </span>
                                            ) : selectedConversation.isPersonalAgent ? (
                                                "🤖 Personal AI Agent"
                                            ) : (
                                                onlineUsers.includes(selectedConversation._id) 
                                                ? "Online now" 
                                                : (() => {
                                                    const dateString = selectedConversation.lastSeen;
                                                    if (!dateString) return "Offline";
                                                    const date = new Date(dateString);
                                                    const now = new Date();
                                                    const diff = now - date;
                                                    const minutes = Math.floor(diff / 60000);
                                                    const hours = Math.floor(minutes / 60);
                                                    const days = Math.floor(hours / 24);
                                                    if (minutes < 1) return "Last seen just now";
                                                    if (minutes < 60) return `Last seen ${minutes}m ago`;
                                                    if (hours < 24) return `Last seen ${hours}h ago`;
                                                    if (days < 7) return `Last seen ${days}d ago`;
                                                    return `Last seen ${date.toLocaleDateString()}`;
                                                })()
                                            )}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                            {!showSearch && (
                                <>
                                    <button 
                                        onClick={() => setShowSearch(true)}
                                        className="btn btn-ghost btn-sm btn-circle"
                                        title="Search messages"
                                    >
                                        <FiSearch className="w-4 h-4" />
                                    </button>
                                    {/* Call history */}
                                    <button
                                        onClick={() => setShowCallHistory(true)}
                                        className="btn btn-ghost btn-sm btn-circle"
                                        title="Call history"
                                    >
                                        <FiPhone className="w-4 h-4 opacity-50" />
                                    </button>
                                    {!selectedConversation.isPersonalAgent && (
                                        <>
                                            <button 
                                                onClick={() => handleStartCall("voice")}
                                                className="btn btn-ghost btn-sm btn-circle"
                                                title="Voice call"
                                            >
                                                <FiPhone className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleStartCall("video")}
                                                className="btn btn-ghost btn-sm btn-circle"
                                                title="Video call"
                                            >
                                                <FiVideo className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                            <div className="dropdown dropdown-end">
                                <label tabIndex={0} className="btn btn-ghost btn-sm btn-circle">
                                    <FiMoreVertical className="w-4 h-4" />
                                </label>
                                <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-52">
                                    <li>
                                        <button onClick={() => setShowReportModal(true)}>
                                            <FiFlag className="w-4 h-4" />
                                            Report Conversation
                                        </button>
                                    </li>
                                    {selectedConversation.isGroup && (
                                        <>
                                            <li><a>Group Settings</a></li>
                                            <li><a>Manage Members</a></li>
                                        </>
                                    )}
                                    <li className="text-error">
                                        <button onClick={() => setSelectedConversation(null)}>
                                            Close Chat
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    {selectedConversation.isPersonalAgent ? (
                        <PersonalAgentChat key={selectedConversation._id} inline={true} agent={selectedConversation} />
                    ) : (
                        <Messages />
                    )}
                    
                    {/* Input or Invite Button */}
                    {selectedConversation.isPersonalAgent ? null : selectedConversation.isPrivate && !selectedConversation.lastMessageTime ? (
                        <div className="p-4 bg-base-200 border-t border-base-300 flex flex-col items-center justify-center gap-3">
                            <p className="text-base-content/70 text-sm text-center">
                                <span className="font-bold">{selectedConversation.fullName}</span>'s account is private. 
                                <br/>You must send an invitation to connect before messaging.
                            </p>
                            <button 
                                className="btn btn-primary"
                                onClick={async () => {
                                    try {
                                        await api.post("/invitations", {
                                            receiverId: selectedConversation._id,
                                            type: "direct"
                                        });
                                        toast.success('Invitation sent!');
                                    } catch (err) {
                                        if (err.response?.data?.error === "Invitation already sent") {
                                            toast.success('Invitation already sent! Waiting for them to accept.');
                                        } else {
                                            toast.error('Failed to send invitation');
                                        }
                                    }
                                }}
                            >
                                Send Invitation
                            </button>
                        </div>
                    ) : (
                        <MessageInput 
                            onReportMessage={handleReportMessage}
                            showReportModal={showReportModal}
                            onCloseReportModal={() => setShowReportModal(false)}
                        />
                    )}
                    
                    {/* Call Interface */}
                    {callType && (
                        <CallInterface 
                            conversation={selectedConversation}
                            callType={callType}
                            onClose={() => setCallType(null)}
                        />
                    )}

                    {/* Callback Call Interface — launched from call history */}
                    {callbackTarget && (
                        <CallInterface
                            conversation={callbackTarget.user}
                            callType={callbackTarget.type}
                            onClose={() => setCallbackTarget(null)}
                        />
                    )}

                    {/* Group Info Panel */}
                    {showGroupInfo && selectedConversation?.isGroup && (
                        <GroupInfoPanel
                            conversation={selectedConversation}
                            onClose={() => setShowGroupInfo(false)}
                            onGroupUpdated={setSelectedConversation}
                        />
                    )}

                    {/* Call History Panel */}
                    {showCallHistory && (
                        <CallHistoryPanel
                            onClose={() => setShowCallHistory(false)}
                            onStartCall={(user, type) => setCallbackTarget({ user, type })}
                        />
                    )}
                </>
            )}
        </div>
    );
};

const NoChatSelected = () => {
    const { authUser } = useAuthStore();
    return (
        <div className="flex items-center justify-center w-full h-full bg-base-200/30">
            <div className="text-center px-4">
                <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <TiMessages className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Welcome, {authUser?.fullName}!</h3>
                <p className="text-base-content/60 mb-4">Select a conversation to start messaging</p>
                <div className="flex flex-col gap-2 text-sm text-base-content/50">
                    <span>• Send text, images, and files</span>
                    <span>• Start voice or video calls</span>
                    <span>• Chat with AI Assistant</span>
                </div>
            </div>
        </div>
    );
};

export default MessageContainer;