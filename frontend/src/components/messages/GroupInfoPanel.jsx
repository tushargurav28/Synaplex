import { useState, useEffect, useRef } from "react";
import { FiX, FiUsers, FiShield, FiLock, FiEdit2, FiUserPlus, FiUserMinus, FiCamera, FiCheck, FiUpload, FiTrash2, FiPlus, FiGlobe } from "react-icons/fi";
import { AiOutlineRobot } from "react-icons/ai";
import api from "../../api/axios";
import { useAuthStore } from "../../store/useAuthStore";
import toast from "react-hot-toast";

const getGroupAvatar = (id, name) =>
    `https://api.dicebear.com/7.x/identicon/svg?seed=${id || name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const GroupInfoPanel = ({ conversation, onClose, onGroupUpdated }) => {
    const { authUser } = useAuthStore();
    const [members, setMembers] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("members"); // "members" | "agents" | "add" | "edit"

    // Edit state
    const [editName, setEditName] = useState(conversation.groupName || conversation.fullName || "");
    const [editPhoto, setEditPhoto] = useState(conversation.profilePic || conversation.groupPhoto || "");
    const [saving, setSaving] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [removingId, setRemovingId] = useState(null);
    const [addingId, setAddingId] = useState(null);
    const [searchAdd, setSearchAdd] = useState("");
    const photoInputRef = useRef(null);

    // Agent state
    const [groupAgents, setGroupAgents] = useState([]);
    const [allAgents, setAllAgents] = useState([]);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [addingAgentId, setAddingAgentId] = useState(null);
    const [removingAgentId, setRemovingAgentId] = useState(null);
    const [searchAgents, setSearchAgents] = useState("");

    const adminIds = (conversation.admins || []).map(a => a._id?.toString() || a.toString());
    const creatorId = adminIds[0];
    const myId = authUser._id?.toString();
    const isAdmin = adminIds.includes(myId);

    const groupAvatar = editPhoto || conversation.profilePic || conversation.groupPhoto
        || getGroupAvatar(conversation._id, conversation.fullName);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                if (conversation.participants?.length && typeof conversation.participants[0] === "object") {
                    setMembers(conversation.participants);
                } else {
                    const res = await api.get(`/conversations`);
                    const conv = res.data.find(c => c._id === conversation._id);
                    if (conv) setMembers(conv.participants || []);
                }
                const usersRes = await api.get("/users");
                setAllUsers(usersRes.data || []);
            } catch (err) {
                console.error("Failed to load group info:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [conversation._id]);

    const fetchAgents = async () => {
        setLoadingAgents(true);
        try {
            const [groupAgentsRes, allAgentsRes] = await Promise.all([
                api.get(`/agents/group/${conversation._id}`),
                api.get(`/agents?groupId=${conversation._id}`)
            ]);
            setGroupAgents(groupAgentsRes.data.agents || []);
            setAllAgents(allAgentsRes.data.agents || []);
        } catch (err) {
            console.error("Failed to load agents:", err);
        } finally {
            setLoadingAgents(false);
        }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === "agents" && groupAgents.length === 0) fetchAgents();
    };

    const currentMemberIds = members.map(m => m._id?.toString() || m.toString());
    const availableToAdd = allUsers.filter(u =>
        !currentMemberIds.includes(u._id?.toString()) &&
        (u.fullName?.toLowerCase().includes(searchAdd.toLowerCase()) ||
         u.username?.toLowerCase().includes(searchAdd.toLowerCase()))
    );

    const filteredAllAgents = allAgents.filter(a =>
        a.name.toLowerCase().includes(searchAgents.toLowerCase()) ||
        a.triggerName.toLowerCase().includes(searchAgents.toLowerCase())
    );

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) return toast.error("File must be under 10MB");
        if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
        e.target.value = "";

        setUploadingPhoto(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await api.post("/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setEditPhoto(res.data.file.url);
            toast.success("Photo uploaded! Click Save to apply.");
        } catch (err) {
            toast.error(err.response?.data?.error || "Upload failed");
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!editName.trim()) return toast.error("Group name cannot be empty");
        setSaving(true);
        try {
            const res = await api.patch(`/conversations/group/${conversation._id}/update`, {
                groupName: editName.trim(),
                groupPhoto: editPhoto.trim()
            });
            toast.success("Group updated!");
            if (onGroupUpdated) onGroupUpdated(res.data.conversation);
            window.dispatchEvent(new CustomEvent("refetch-conversations"));
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to update group");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveMember = async (userId) => {
        setRemovingId(userId);
        try {
            await api.patch(`/conversations/group/${conversation._id}/remove`, { userId });
            setMembers(prev => prev.filter(m => (m._id?.toString() || m.toString()) !== userId));
            toast.success("Member removed");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to remove member");
        } finally {
            setRemovingId(null);
        }
    };

    const handleAddMember = async (userId) => {
        setAddingId(userId);
        try {
            const res = await api.patch(`/conversations/group/${conversation._id}/add`, { userId });
            if (res.data.inviteSent) {
                toast.success("User is private — invitation sent!");
            } else {
                const addedUser = allUsers.find(u => u._id?.toString() === userId);
                if (addedUser) setMembers(prev => [...prev, addedUser]);
                toast.success("Member added!");
            }
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to add member");
        } finally {
            setAddingId(null);
        }
    };

    const handleAddAgent = async (agentId) => {
        setAddingAgentId(agentId);
        try {
            await api.post("/agents/group/add", { groupId: conversation._id, agentId });
            const added = allAgents.find(a => a._id === agentId);
            if (added) {
                setGroupAgents(prev => [...prev, added]);
                setAllAgents(prev => prev.filter(a => a._id !== agentId));
            }
            toast.success("Agent added to group!");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to add agent");
        } finally {
            setAddingAgentId(null);
        }
    };

    const handleRemoveAgent = async (agentId) => {
        setRemovingAgentId(agentId);
        try {
            await api.post("/agents/group/remove", { groupId: conversation._id, agentId });
            const removed = groupAgents.find(a => a._id === agentId);
            if (removed) {
                setGroupAgents(prev => prev.filter(a => a._id !== agentId));
                setAllAgents(prev => [...prev, removed]);
            }
            toast.success("Agent removed from group");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to remove agent");
        } finally {
            setRemovingAgentId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Hero Header */}
                <div className="relative bg-gradient-to-br from-primary/20 to-secondary/20 p-6 text-center shrink-0">
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle absolute top-3 right-3">
                        <FiX className="w-5 h-5" />
                    </button>

                    <div className="avatar mx-auto mb-3 relative w-20 h-20">
                        <div className="w-20 h-20 rounded-full ring-4 ring-primary ring-offset-base-100 ring-offset-2">
                            <img
                                src={groupAvatar}
                                alt={conversation.fullName}
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = getGroupAvatar(conversation._id, conversation.fullName);
                                }}
                            />
                        </div>
                        {isAdmin && (
                            <button
                                className="absolute bottom-0 right-0 btn btn-primary btn-xs btn-circle"
                                title="Change photo"
                                onClick={() => handleTabChange("edit")}
                            >
                                {uploadingPhoto
                                    ? <span className="loading loading-spinner loading-xs" />
                                    : <FiCamera className="w-3 h-3" />
                                }
                            </button>
                        )}
                    </div>
                    <h2 className="text-xl font-bold">{editName || conversation.fullName}</h2>
                    <div className="flex items-center justify-center gap-2 mt-1">
                        <FiUsers className="w-4 h-4 text-base-content/60" />
                        <span className="text-sm text-base-content/60">{members.length} members</span>
                        {groupAgents.length > 0 && (
                            <span className="text-sm text-base-content/60">· {groupAgents.length} agent{groupAgents.length > 1 ? "s" : ""}</span>
                        )}
                        {isAdmin && (
                            <span className="badge badge-primary badge-sm ml-1">
                                <FiShield className="w-3 h-3 mr-1" />Admin
                            </span>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-base-200 shrink-0 overflow-x-auto">
                    <button
                        onClick={() => handleTabChange("members")}
                        className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-2 ${activeTab === "members" ? "border-b-2 border-primary text-primary" : "text-base-content/60"}`}
                    >
                        <FiUsers className="inline mr-1 w-3.5 h-3.5" />Members
                    </button>
                    <button
                        onClick={() => handleTabChange("agents")}
                        className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-2 ${activeTab === "agents" ? "border-b-2 border-primary text-primary" : "text-base-content/60"}`}
                    >
                        <AiOutlineRobot className="inline mr-1 w-3.5 h-3.5" />Agents
                        {groupAgents.length > 0 && (
                            <span className="badge badge-primary badge-xs ml-1">{groupAgents.length}</span>
                        )}
                    </button>
                    {isAdmin && (
                        <>
                            <button
                                onClick={() => handleTabChange("add")}
                                className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-2 ${activeTab === "add" ? "border-b-2 border-primary text-primary" : "text-base-content/60"}`}
                            >
                                <FiUserPlus className="inline mr-1 w-3.5 h-3.5" />Add
                            </button>
                            <button
                                onClick={() => handleTabChange("edit")}
                                className={`flex-1 py-2.5 text-xs font-medium transition-colors whitespace-nowrap px-2 ${activeTab === "edit" ? "border-b-2 border-primary text-primary" : "text-base-content/60"}`}
                            >
                                <FiEdit2 className="inline mr-1 w-3.5 h-3.5" />Settings
                            </button>
                        </>
                    )}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">

                    {/* MEMBERS TAB */}
                    {activeTab === "members" && (
                        loading ? (
                            <div className="flex justify-center py-8">
                                <span className="loading loading-spinner loading-md text-primary"></span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {members.map((member) => {
                                    const memberId = member._id?.toString() || member.toString();
                                    const isCreator = memberId === creatorId;
                                    const isMemberAdmin = adminIds.includes(memberId);
                                    const isMe = memberId === myId;

                                    return (
                                        <div key={memberId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-base-200 transition-colors">
                                            <div className="avatar">
                                                <div className="w-10 h-10 rounded-full">
                                                    <img
                                                        src={member.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${memberId}`}
                                                        alt={member.fullName || member.username}
                                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${memberId}`; }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">
                                                    {member.fullName || member.username}
                                                    {isMe && <span className="text-base-content/40 font-normal"> (you)</span>}
                                                </p>
                                                {member.username && <p className="text-xs text-base-content/50">@{member.username}</p>}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isCreator && (
                                                    <span className="badge badge-primary badge-sm gap-1">
                                                        <FiShield className="w-2.5 h-2.5" /> Creator
                                                    </span>
                                                )}
                                                {isMemberAdmin && !isCreator && (
                                                    <span className="badge badge-secondary badge-sm">Admin</span>
                                                )}
                                                {member.isPrivate && (
                                                    <span title="Private account" className="text-base-content/40">
                                                        <FiLock className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                                {isAdmin && !isMe && !isCreator && (
                                                    <button
                                                        className="btn btn-ghost btn-xs btn-circle text-error"
                                                        title="Remove from group"
                                                        disabled={removingId === memberId}
                                                        onClick={() => handleRemoveMember(memberId)}
                                                    >
                                                        {removingId === memberId
                                                            ? <span className="loading loading-spinner loading-xs" />
                                                            : <FiUserMinus className="w-3.5 h-3.5" />
                                                        }
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}

                    {/* AGENTS TAB */}
                    {activeTab === "agents" && (
                        <div className="flex flex-col gap-3">
                            {/* Info */}
                            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-base-content/70">
                                <p className="font-semibold mb-0.5">🤖 How to use agents in this group:</p>
                                <p>Type <code className="bg-base-300 px-1 rounded font-mono">@agentName</code> followed by your question in any message to invoke an agent.</p>
                            </div>

                            {loadingAgents ? (
                                <div className="flex justify-center py-8">
                                    <span className="loading loading-spinner loading-md text-primary" />
                                </div>
                            ) : (
                                <>
                                    {/* Active agents in this group */}
                                    {groupAgents.length === 0 ? (
                                        <div className="text-center py-6">
                                            <div className="text-4xl mb-2">🤖</div>
                                            <p className="font-semibold text-sm">No agents in this group</p>
                                            <p className="text-xs text-base-content/50 mt-1">Any member can add an agent below</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Active Agents</p>
                                            {groupAgents.map(agent => (
                                                <div key={agent._id} className="flex items-center gap-3 p-3 bg-base-200/60 rounded-xl border border-base-200">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center text-xl border border-base-300 flex-shrink-0">
                                                        {agent.avatar}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-sm">{agent.name}</p>
                                                            <span className="badge badge-ghost badge-xs font-mono">@{agent.triggerName}</span>
                                                            {agent.canSearchWeb && <FiGlobe className="w-3 h-3 text-primary" title="Web search enabled" />}
                                                        </div>
                                                        {agent.description && (
                                                            <p className="text-xs text-base-content/50 truncate">{agent.description}</p>
                                                        )}
                                                        {agent.createdBy && (
                                                            <p className="text-xs text-base-content/40">by @{agent.createdBy.username}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        className="btn btn-ghost btn-xs text-error flex-shrink-0"
                                                        disabled={removingAgentId === agent._id}
                                                        onClick={() => handleRemoveAgent(agent._id)}
                                                        title="Remove from group"
                                                    >
                                                        {removingAgentId === agent._id
                                                            ? <span className="loading loading-spinner loading-xs" />
                                                            : <FiX className="w-3.5 h-3.5" />
                                                        }
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {/* Add available agents */}
                                    {allAgents.length > 0 && (
                                        <>
                                            <div className="divider my-1 text-xs">Add Agents to Group</div>
                                            <input
                                                type="text"
                                                placeholder="Search available agents..."
                                                className="input input-bordered input-sm w-full"
                                                value={searchAgents}
                                                onChange={e => setSearchAgents(e.target.value)}
                                            />
                                            {filteredAllAgents.map(agent => (
                                                <div key={agent._id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-base-200 transition-colors">
                                                    <div className="w-10 h-10 bg-base-200 rounded-xl flex items-center justify-center text-xl border border-base-300 flex-shrink-0">
                                                        {agent.avatar}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-sm">{agent.name}</p>
                                                        <p className="text-xs text-base-content/50">@{agent.triggerName}{agent.description ? ` · ${agent.description}` : ""}</p>
                                                    </div>
                                                    <button
                                                        className="btn btn-primary btn-xs gap-1"
                                                        disabled={addingAgentId === agent._id}
                                                        onClick={() => handleAddAgent(agent._id)}
                                                    >
                                                        {addingAgentId === agent._id
                                                            ? <span className="loading loading-spinner loading-xs" />
                                                            : <><FiPlus className="w-3 h-3" />Add</>
                                                        }
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ADD MEMBERS TAB */}
                    {activeTab === "add" && isAdmin && (
                        <div className="flex flex-col gap-3">
                            <input
                                type="text"
                                placeholder="Search users to add..."
                                className="input input-bordered input-sm w-full"
                                value={searchAdd}
                                onChange={e => setSearchAdd(e.target.value)}
                            />
                            {availableToAdd.length === 0 ? (
                                <p className="text-center text-base-content/50 text-sm py-4">
                                    {searchAdd ? "No users match your search" : "All users are already in this group"}
                                </p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {availableToAdd.map(user => (
                                        <div key={user._id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-base-200 transition-colors">
                                            <div className="avatar">
                                                <div className="w-10 h-10 rounded-full">
                                                    <img
                                                        src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user._id}`}
                                                        alt={user.fullName}
                                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user._id}`; }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">{user.fullName}</p>
                                                <p className="text-xs text-base-content/50 flex items-center gap-1">
                                                    @{user.username}
                                                    {user.isPrivate && <><FiLock className="w-3 h-3" /> Private</>}
                                                </p>
                                            </div>
                                            <button
                                                className="btn btn-primary btn-xs gap-1"
                                                disabled={addingId === user._id}
                                                onClick={() => handleAddMember(user._id)}
                                            >
                                                {addingId === user._id
                                                    ? <span className="loading loading-spinner loading-xs" />
                                                    : <><FiUserPlus className="w-3 h-3" /> Add</>
                                                }
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* EDIT SETTINGS TAB */}
                    {activeTab === "edit" && isAdmin && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <label className="label"><span className="label-text font-semibold">Group Name</span></label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Enter group name..."
                                    maxLength={80}
                                />
                            </div>

                            <div>
                                <label className="label"><span className="label-text font-semibold">Group Photo</span></label>
                                <div className="flex gap-4 items-center">
                                    <div className="avatar shrink-0">
                                        <div className="w-16 h-16 rounded-full ring-2 ring-primary">
                                            <img
                                                src={editPhoto || getGroupAvatar(conversation._id, editName)}
                                                alt="preview"
                                                onError={(e) => { e.target.onerror = null; e.target.src = getGroupAvatar(conversation._id, editName); }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2 flex-1">
                                        <input
                                            ref={photoInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handlePhotoUpload}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm gap-2 w-full"
                                            onClick={() => photoInputRef.current?.click()}
                                            disabled={uploadingPhoto}
                                        >
                                            {uploadingPhoto
                                                ? <><span className="loading loading-spinner loading-xs" /> Uploading...</>
                                                : <><FiUpload className="w-4 h-4" /> Choose Photo</>}
                                        </button>
                                        {editPhoto && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm text-error gap-1"
                                                onClick={() => setEditPhoto("")}
                                            >
                                                Remove photo
                                            </button>
                                        )}
                                        <p className="text-xs text-base-content/50">Max 10MB. Leave empty for auto-generated avatar.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                className="btn btn-primary w-full gap-2"
                                onClick={handleSaveSettings}
                                disabled={saving || uploadingPhoto}
                            >
                                {saving
                                    ? <span className="loading loading-spinner loading-sm" />
                                    : <><FiCheck className="w-4 h-4" /> Save Changes</>
                                }
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupInfoPanel;
