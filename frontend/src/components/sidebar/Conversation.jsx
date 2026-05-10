import { useSocketStore } from "../../store/useSocketStore";
import { useChatStore } from "../../store/useChatStore";

// Returns a deterministic DiceBear avatar URL for a group
const getGroupAvatar = (id, name) =>
	`https://api.dicebear.com/7.x/identicon/svg?seed=${id || name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const Conversation = ({ conversation, lastIdx }) => {
    const { selectedUser: selectedConversation, setSelectedUser: setSelectedConversation, unreadCounts, setUnreadCount } = useChatStore();
    const { onlineUsers } = useSocketStore();

    const isSelected = selectedConversation?._id === conversation._id;
    const isOnline = onlineUsers.includes(conversation._id);
    const unreadCount = unreadCounts[conversation._id] || 0;
    const isGroup = conversation.isGroup;

    // Determine avatar URL
    const avatarSrc = isGroup
        ? (conversation.profilePic || conversation.groupPhoto || getGroupAvatar(conversation._id, conversation.fullName))
        : conversation.isPersonalAgent
            ? `https://api.dicebear.com/7.x/bottts/svg?seed=${conversation.triggerName || conversation.fullName}&backgroundColor=b6e3f4,c0aede,d1d4f9`
            : (conversation.profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(conversation.fullName || "User")}&background=random`);

    const renderLastMessage = (msg) => {
        if (!msg) return <span className="truncate">{conversation.isPrivate && !isGroup && !conversation.isPersonalAgent ? "🔒 Private account" : "No messages yet"}</span>;
        
        // Match agent message pattern: "🤖 **AgentName**: message"
        const agentMatch = msg.match(/^🤖 \*\*(.*?)\*\*: ([\s\S]*)$/);
        if (agentMatch) {
            return (
                <span className="flex items-center gap-1.5 truncate italic opacity-80">
                    <span className={`text-[10px] font-medium px-1.5 py-[1px] rounded flex-shrink-0 not-italic ${isSelected ? 'bg-white/20 text-white' : 'bg-violet-500/20 text-violet-400'}`}>
                        🤖 {agentMatch[1]}
                    </span>
                    <span className="truncate">responded</span>
                </span>
            );
        }
        return <span className="truncate">{msg}</span>;
    };

    return (
        <>
            <div
                className={`flex gap-3 items-center p-3 rounded-lg cursor-pointer transition-all duration-200
                    ${isSelected 
                        ? "bg-primary text-primary-content shadow-md" 
                        : "hover:bg-base-200/80"
                    }
                `}
                onClick={() => {
                    setSelectedConversation(conversation);
                    if (unreadCount > 0) setUnreadCount(conversation._id, 0);
                }}
            >
                {/* Avatar with online indicator */}
                <div className="relative">
                    <div className={`avatar ${isOnline && !isGroup ? "online" : ""}`}>
                        <div className={`w-12 h-12 rounded-full ring-2 ${
                            isSelected ? "ring-primary-content/30" : "ring-transparent"
                        }`}>
                            <img 
                                src={avatarSrc}
                                alt={conversation.fullName}
                                className="object-cover"
                                onError={(e) => { 
                                    e.target.onerror = null; 
                                    e.target.src = isGroup
                                        ? getGroupAvatar(conversation._id, conversation.fullName)
                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(conversation.fullName || "User")}&background=random`;
                                }}
                            />
                        </div>
                    </div>
                    {isGroup && (
                        <span className="absolute -bottom-1 -right-1 text-xs">👥</span>
                    )}
                    {conversation.isPersonalAgent && (
                        <span className="absolute -bottom-1 -right-1 text-xs" title="Personal AI Agent">🤖</span>
                    )}
                    {conversation.isPrivate && !isGroup && !conversation.isPersonalAgent && (
                        <span className="absolute -bottom-1 -right-1 text-xs" title="Private account">🔒</span>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <p className={`font-semibold truncate ${isSelected ? "text-primary-content" : ""}`}>
                            {conversation.fullName}
                        </p>
                        {conversation.lastMessageTime && (
                            <span className={`text-xs ${isSelected ? "text-primary-content/70" : "text-base-content/50"}`}>
                                {formatTime(conversation.lastMessageTime)}
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center justify-between mt-1 min-w-0">
                        <div className={`text-sm flex items-center min-w-0 pr-2 ${isSelected ? "text-primary-content/80" : "text-base-content/60"}`}>
                            {renderLastMessage(conversation.lastMessage)}
                        </div>
                        {unreadCount > 0 && (
                            <span className={`badge badge-primary badge-sm ${isSelected ? "badge-outline" : ""}`}>
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </div>
                    
                    {/* Typing indicator */}
                    {conversation.isTyping && (
                        <p className={`text-xs mt-1 ${isSelected ? "text-primary-content/70" : "text-primary"}`}>
                            typing...
                        </p>
                    )}
                </div>
            </div>

            {!lastIdx && <div className="divider my-0 py-0 h-1 mx-3" />}
        </>
    );
};

// Helper: format timestamp
const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 7 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default Conversation;