import { useState, useEffect } from "react";
import { FiX, FiPlus, FiEdit2, FiTrash2, FiGlobe, FiMessageSquare, FiZap } from "react-icons/fi";
import { AiOutlineRobot } from "react-icons/ai";
import api from "../../api/axios";
import toast from "react-hot-toast";
import PersonalAgentChat from "./PersonalAgentChat";

const EMOJI_OPTIONS = ["🤖", "🧠", "⚡", "🔍", "💡", "🛠️", "🎯", "🚀", "📊", "🔮", "🧪", "📝", "💻", "🌐", "🎨"];

const AgentManager = ({ onClose }) => {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingAgent, setEditingAgent] = useState(null);
    const [chattingWith, setChattingWith] = useState(null);
    const [form, setForm] = useState({ name: "", instructions: "", description: "", avatar: "🤖", canSearchWeb: true });
    const [saving, setSaving] = useState(false);

    const fetchAgents = async () => {
        setLoading(true);
        try {
            const res = await api.get("/agents/my");
            setAgents(res.data.agents || []);
        } catch {
            toast.error("Failed to load agents");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAgents(); }, []);

    const resetForm = () => {
        setForm({ name: "", instructions: "", description: "", avatar: "🤖", canSearchWeb: true });
        setEditingAgent(null);
        setShowCreateForm(false);
    };

    const handleEdit = (agent) => {
        setEditingAgent(agent);
        setForm({
            name: agent.name,
            instructions: agent.instructions || "",
            description: agent.description || "",
            avatar: agent.avatar || "🤖",
            canSearchWeb: agent.canSearchWeb !== false
        });
        setShowCreateForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || form.name.trim().length < 2) {
            return toast.error("Agent name must be at least 2 characters");
        }
        setSaving(true);
        try {
            if (editingAgent) {
                const res = await api.patch(`/agents/${editingAgent._id}`, form);
                setAgents(prev => prev.map(a => a._id === editingAgent._id ? res.data.agent : a));
                toast.success("Agent updated!");
            } else {
                const res = await api.post("/agents", form);
                setAgents(prev => [res.data.agent, ...prev]);
                toast.success(`Agent @${res.data.agent.triggerName} created!`);
            }
            resetForm();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to save agent");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (agent) => {
        if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/agents/${agent._id}`);
            setAgents(prev => prev.filter(a => a._id !== agent._id));
            toast.success("Agent deleted");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to delete agent");
        }
    };

    // If chatting with a personal agent, show chat panel
    if (chattingWith) {
        return (
            <PersonalAgentChat 
                agent={chattingWith} 
                onBack={() => setChattingWith(null)} 
                onClose={onClose}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-base-100 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600/20 via-primary/20 to-cyan-500/20 p-5 flex items-center justify-between border-b border-base-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg">
                            <AiOutlineRobot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">My AI Agents</h2>
                            <p className="text-xs text-base-content/60">Create and chat with personal agents</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Create/Edit Form */}
                {showCreateForm && (
                    <div className="p-4 border-b border-base-200 bg-base-200/50 shrink-0">
                        <h3 className="font-semibold mb-3 text-sm">{editingAgent ? "Edit Agent" : "Create New Agent"}</h3>
                        
                        {/* Avatar Picker */}
                        <div className="mb-3">
                            <label className="label py-1"><span className="label-text text-xs">Avatar</span></label>
                            <div className="flex flex-wrap gap-2">
                                {EMOJI_OPTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, avatar: emoji }))}
                                        className={`text-xl p-1.5 rounded-lg border-2 transition-all ${form.avatar === emoji ? "border-primary bg-primary/10 scale-110" : "border-base-300 hover:border-base-content/30"}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="label py-1"><span className="label-text text-xs font-medium">Agent Name *</span></label>
                                <input
                                    type="text"
                                    className="input input-bordered input-sm w-full"
                                    placeholder="e.g. CodeHelper, ResearchBot..."
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    maxLength={50}
                                />
                                {form.name && (
                                    <p className="text-xs text-base-content/50 mt-1">
                                        Trigger: @{form.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "")}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="label py-1"><span className="label-text text-xs font-medium">Role / Description</span></label>
                                <input
                                    type="text"
                                    className="input input-bordered input-sm w-full"
                                    placeholder="e.g. A coding assistant that helps with Python"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    maxLength={200}
                                />
                            </div>
                            <div>
                                <label className="label py-1"><span className="label-text text-xs font-medium">System Instructions</span></label>
                                <textarea
                                    className="textarea textarea-bordered textarea-sm w-full resize-none"
                                    placeholder="e.g. Always respond in a professional tone. Focus on Python and JavaScript."
                                    value={form.instructions}
                                    onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                                    rows={3}
                                    maxLength={2000}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-base-100 rounded-lg border border-base-200">
                                <div className="flex items-center gap-2">
                                    <FiGlobe className="w-4 h-4 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium">Web Search</p>
                                        <p className="text-xs text-base-content/50">Allow agent to search the internet</p>
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-primary toggle-sm"
                                    checked={form.canSearchWeb}
                                    onChange={e => setForm(f => ({ ...f, canSearchWeb: e.target.checked }))}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 mt-4">
                            <button onClick={resetForm} className="btn btn-ghost btn-sm flex-1">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm flex-1 gap-1">
                                {saving ? <span className="loading loading-spinner loading-xs" /> : <FiZap className="w-3.5 h-3.5" />}
                                {editingAgent ? "Update Agent" : "Create Agent"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Agents List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {!showCreateForm && (
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="btn btn-outline btn-primary w-full mb-4 gap-2"
                        >
                            <FiPlus className="w-4 h-4" />
                            Create New Agent
                        </button>
                    )}

                    {loading ? (
                        <div className="flex justify-center py-10">
                            <span className="loading loading-spinner loading-md text-primary" />
                        </div>
                    ) : agents.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="text-5xl mb-3">🤖</div>
                            <p className="font-semibold mb-1">No agents yet</p>
                            <p className="text-sm text-base-content/50">Create your first AI agent to get started</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {agents.map(agent => (
                                <div key={agent._id} className="group flex items-center gap-3 p-3 bg-base-200/50 rounded-xl hover:bg-base-200 transition-colors border border-base-200">
                                    <div className="text-3xl flex-shrink-0 w-12 h-12 bg-gradient-to-br from-violet-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-base-300">
                                        {agent.avatar}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-sm">{agent.name}</p>
                                            <span className="badge badge-ghost badge-xs font-mono">@{agent.triggerName}</span>
                                            {agent.canSearchWeb && (
                                                <span title="Web search enabled" className="text-primary">
                                                    <FiGlobe className="w-3 h-3" />
                                                </span>
                                            )}
                                        </div>
                                        {agent.description && (
                                            <p className="text-xs text-base-content/60 truncate mt-0.5">{agent.description}</p>
                                        )}
                                        {agent.instructions && (
                                            <p className="text-xs text-base-content/40 truncate">
                                                📋 {agent.instructions.slice(0, 60)}{agent.instructions.length > 60 ? "..." : ""}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                        <button
                                            onClick={() => setChattingWith(agent)}
                                            className="btn btn-primary btn-xs btn-circle"
                                            title="Chat with agent"
                                        >
                                            <FiMessageSquare className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(agent)}
                                            className="btn btn-ghost btn-xs btn-circle"
                                            title="Edit agent"
                                        >
                                            <FiEdit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(agent)}
                                            className="btn btn-ghost btn-xs btn-circle text-error"
                                            title="Delete agent"
                                        >
                                            <FiTrash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentManager;
