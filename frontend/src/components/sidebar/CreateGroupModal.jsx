import { useState } from "react";
import { FiX, FiUsers } from "react-icons/fi";
import useGetConversations from "../../hooks/useGetConversations";
import toast from "react-hot-toast";
import api from "../../api/axios";

const CreateGroupModal = ({ onClose }) => {
    const [groupName, setGroupName] = useState("");
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Reuse the existing hook but filter to only real users (no groups)
    const { conversations: allConversations, loading: usersLoading } = useGetConversations();
    const users = allConversations.filter(c => !c.isGroup);

    const handleUserSelect = (user) => {
        if (selectedUsers.includes(user._id)) {
            setSelectedUsers(selectedUsers.filter(id => id !== user._id));
        } else {
            setSelectedUsers([...selectedUsers, user._id]);
        }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        if (!groupName.trim()) return toast.error("Group name is required");
        if (selectedUsers.length < 1) return toast.error("Select at least 1 user to add");

        setLoading(true);
        try {
            const res = await api.post("/conversations/group", {
                groupName,
                participants: selectedUsers
            });
            if (res.data) {
                toast.success("Group created! Check your notifications if any users were private.");
                // Tell the sidebar to refetch without a full page reload
                window.dispatchEvent(new CustomEvent('refetch-conversations'));
                onClose();
            }
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to create group");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-base-200">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <FiUsers className="text-primary" /> Create Group
                    </h2>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleCreateGroup} className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                    <div>
                        <label className="label">
                            <span className="label-text font-semibold">Group Name</span>
                        </label>
                        <input 
                            type="text" 
                            placeholder="Type group name here..." 
                            className="input input-bordered w-full" 
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="label">
                            <span className="label-text font-semibold">Select Participants</span>
                        </label>
                        <div className="bg-base-200 rounded-lg p-2 max-h-60 overflow-y-auto flex flex-col gap-1">
                            {usersLoading ? (
                                <div className="text-center py-4"><span className="loading loading-spinner"></span></div>
                            ) : users.length === 0 ? (
                                <div className="text-center py-4 text-sm text-base-content/60">No users available</div>
                            ) : (
                                users.map(user => (
                                    <label key={user._id} className="flex items-center gap-3 p-2 hover:bg-base-300 rounded cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="checkbox checkbox-sm checkbox-primary" 
                                            checked={selectedUsers.includes(user._id)}
                                            onChange={() => handleUserSelect(user)}
                                        />
                                        <div className="avatar">
                                            <div className="w-8 h-8 rounded-full">
                                                <img 
                                                    src={user.profilePic || `https://ui-avatars.com/api/?name=${user.fullName || "User"}&background=random`} 
                                                    alt={user.fullName} 
                                                    onError={(e) => { 
                                                        e.target.onerror = null; 
                                                        e.target.src = `https://ui-avatars.com/api/?name=${user.fullName || "User"}&background=random`; 
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <span className="flex-1 truncate">{user.fullName}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </form>

                <div className="p-4 border-t border-base-200 flex justify-end gap-2">
                    <button onClick={onClose} className="btn btn-ghost" disabled={loading}>Cancel</button>
                    <button onClick={handleCreateGroup} className="btn btn-primary" disabled={loading}>
                        {loading ? <span className="loading loading-spinner loading-sm"></span> : "Create Group"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGroupModal;
