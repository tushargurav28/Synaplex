import { useState, useRef, useEffect, useCallback } from "react";
import { BsSend, BsPaperclip, BsEmojiSmile, BsMic } from "react-icons/bs";
import { FiImage, FiFile, FiX, FiCode } from "react-icons/fi";
import { AiOutlineRobot } from "react-icons/ai";
import useSendMessage from "../../hooks/useSendMessage";
import { useChatStore } from "../../store/useChatStore";
import { emojis } from "../../utils/emojis";
import toast from "react-hot-toast";
import api from "../../api/axios";

const MessageInput = ({ onReportMessage, showReportModal, onCloseReportModal }) => {
    const [message, setMessage] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [reportReason, setReportReason] = useState("");

    // Code block mode
    const [codeMode, setCodeMode] = useState(false);
    const [codeLanguage, setCodeLanguage] = useState("javascript");

    // @mention state
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionType, setMentionType] = useState(null); // "user" | "agent"
    const [mentionResults, setMentionResults] = useState([]);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionLoading, setMentionLoading] = useState(false);
    const [caretPos, setCaretPos] = useState(0);

    // Agent invocation
    const [agentLoading, setAgentLoading] = useState(false);

    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);
    const mentionRef = useRef(null);

    const { loading, sendMessage, sendMediaMessage } = useSendMessage();
    const { selectedUser: selectedConversation } = useChatStore();

    const isGroup = selectedConversation?.isGroup;

    // ── @mention detection ──────────────────────────────────────────────
    const detectMention = useCallback(async (text, pos) => {
        // Find the last @ before the cursor
        const before = text.slice(0, pos);
        const atMatch = before.match(/@([a-zA-Z0-9_]*)$/);
        if (!atMatch) {
            setMentionQuery("");
            setMentionType(null);
            setMentionResults([]);
            return;
        }

        const query = atMatch[1];
        setMentionQuery(query);
        setMentionIndex(0);
        setMentionLoading(true);

        try {
            if (isGroup) {
                // Search both users and agents
                const [usersRes, agentsRes] = await Promise.all([
                    api.get(`/users`).catch(() => ({ data: [] })),
                    api.get(`/agents/group/${selectedConversation._id}`).catch(() => ({ data: { agents: [] } }))
                ]);

                const members = (selectedConversation.participants || []);
                const memberIds = members.map(m => m._id?.toString() || m.toString());

                const users = (usersRes.data || [])
                    .filter(u => memberIds.includes(u._id?.toString()))
                    .filter(u => !query || u.username?.toLowerCase().includes(query.toLowerCase()) || u.fullName?.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 5)
                    .map(u => ({ type: "user", id: u._id, label: u.username, display: u.fullName, pic: u.profilePic }));

                const agents = (agentsRes.data?.agents || [])
                    .filter(a => !query || a.triggerName.includes(query.toLowerCase()) || a.name.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 5)
                    .map(a => ({ type: "agent", id: a._id, label: a.triggerName, display: a.name, pic: null, avatar: a.avatar }));

                setMentionResults([...users, ...agents]);
                setMentionType("mixed");
            } else {
                // DM — only show users (the other person)
                setMentionResults([]);
                setMentionType(null);
            }
        } catch (e) {
            setMentionResults([]);
        } finally {
            setMentionLoading(false);
        }
    }, [isGroup, selectedConversation]);

    const handleTextChange = (e) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setMessage(val);
        setCaretPos(pos);
        detectMention(val, pos);
        autoResizeTextarea(e.target);
    };

    const autoResizeTextarea = (el) => {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
    };

    const insertMention = (item) => {
        // Replace the @query with @label
        const before = message.slice(0, caretPos);
        const after = message.slice(caretPos);
        const atMatch = before.match(/@([a-zA-Z0-9_]*)$/);
        if (!atMatch) return;

        const newBefore = before.slice(0, before.length - atMatch[0].length) + `@${item.label} `;
        const newMsg = newBefore + after;
        setMessage(newMsg);
        setMentionResults([]);
        setMentionType(null);
        setMentionQuery("");

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const pos = newBefore.length;
                textareaRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    };

    const handleMentionKeyDown = (e) => {
        if (!mentionResults.length) return false;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1));
            return true;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setMentionIndex(i => Math.max(i - 1, 0));
            return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(mentionResults[mentionIndex]);
            return true;
        }
        if (e.key === "Escape") {
            setMentionResults([]);
            return true;
        }
        return false;
    };

    // ── Agent invocation ──────────────────────────────────────────────
    const checkAndInvokeAgent = async (text) => {
        if (!isGroup) return false;

        // Pattern: @agentname anywhere in the text
        const agentMentionMatch = text.match(/@([a-zA-Z0-9_-]+)/);
        if (!agentMentionMatch) return false;

        const agentTrigger = agentMentionMatch[1].toLowerCase();
        const question = text;

        // Check if this is an agent (not a user)
        const tempAgentId = "temp-agent-" + Date.now();
        try {
            const agentsRes = await api.get(`/agents/group/${selectedConversation._id}`);
            const groupAgents = agentsRes.data.agents || [];
            const targetAgent = groupAgents.find(a => a.triggerName === agentTrigger);
            if (!targetAgent) return false;

            setAgentLoading(true);

            // First send the user's message
            await sendMessage(text);
            setMessage("");

            // Add optimistic agent message
            const { addMessage, updateMessageStatus, removeMessage } = useChatStore.getState();
            addMessage({
                _id: tempAgentId,
                senderId: targetAgent._id, // Just for frontend identification
                conversationId: selectedConversation._id,
                message: `🤖 **${targetAgent.name}**: ⏳ Generating response...`,
                isAgentMessage: true,
                agentName: targetAgent.name,
                agentAvatar: targetAgent.avatar,
                createdAt: new Date().toISOString(),
                status: "sending"
            });

            // Then get agent response
            const res = await api.post("/agents/group/mention", {
                conversationId: selectedConversation._id,
                agentTriggerName: agentTrigger,
                userMessage: question,
                messageHistory: []
            });

            // Replace optimistic message with real message
            // Wait, since the server emits a socket event "newMessage" on success,
            // we should just remove the optimistic message to avoid duplicates!
            removeMessage(tempAgentId);
            if (res.data && res.data.message) {
                addMessage(res.data.message);
            }

            return true;
        } catch (err) {
            console.error("Agent mention failed:", err);
            const { removeMessage } = useChatStore.getState();
            removeMessage(tempAgentId);
            toast.error(err.response?.data?.error || "Agent failed to respond");
            return false;
        } finally {
            setAgentLoading(false);
        }
    };

    // ── Send ──────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((!message.trim() && !selectedFile) || loading || agentLoading) return;

        if (selectedFile) {
            await sendMediaMessage(selectedFile, message.trim());
            setSelectedFile(null);
            setUploadProgress(0);
        } else if (codeMode) {
            // Send as code message
            await sendMessage(message, { type: "code", codeLanguage });
        } else {
            // Check for agent invocation first
            const wasAgentInvoked = await checkAndInvokeAgent(message.trim());
            if (!wasAgentInvoked) {
                await sendMessage(message);
            }
        }

        setMessage("");
        setShowEmojiPicker(false);
        setCodeMode(false);
        if (textareaRef.current) {
            textareaRef.current.style.height = "40px";
        }
    };

    const handleKeyDown = (e) => {
        if (mentionResults.length > 0) {
            const consumed = handleMentionKeyDown(e);
            if (consumed) return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const maxSize = 10 * 1024 * 1024;
        const allowedTypes = [
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "application/pdf", "application/msword",
            "audio/mpeg", "audio/wav"
        ];
        if (file.size > maxSize) { toast.error("File size must be less than 10MB"); return; }
        if (!allowedTypes.includes(file.type)) { toast.error("File type not supported"); return; }
        setSelectedFile(file);
    };

    const handleAddEmoji = (emoji) => {
        setMessage(prev => prev + emoji);
        setShowEmojiPicker(false);
        textareaRef.current?.focus();
    };

    const handleReport = async () => {
        if (!reportReason.trim()) { toast.error("Please select a reason"); return; }
        const lastMessage = selectedConversation?.lastMessageId;
        if (!lastMessage) { toast.error("No message to report"); return; }
        const success = await onReportMessage?.(lastMessage, reportReason);
        if (success) {
            toast.success("Report submitted");
            onCloseReportModal?.();
            setReportReason("");
        } else {
            toast.error("Failed to submit report");
        }
    };

    const CODE_LANGS = ["javascript", "typescript", "python", "java", "c", "cpp", "go", "rust", "sql", "bash", "html", "css", "json", "yaml", "plaintext"];

    return (
        <>
            {/* File Preview */}
            {selectedFile && (
                <div className="px-4 py-2 bg-base-200 border-t border-base-300">
                    <div className="flex items-center gap-3 p-2 bg-base-100 rounded-lg">
                        <div className="avatar">
                            <div className="w-12 h-12 rounded-lg bg-base-200 flex items-center justify-center">
                                {selectedFile.type.startsWith("image/") ? (
                                    <img src={URL.createObjectURL(selectedFile)} alt="preview" className="object-cover w-full h-full rounded-lg" />
                                ) : (
                                    <FiFile className="w-6 h-6 text-base-content/60" />
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                            <p className="text-xs text-base-content/60">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            {uploadProgress > 0 && uploadProgress < 100 && (
                                <progress className="progress progress-primary w-full mt-1" value={uploadProgress} max="100" />
                            )}
                        </div>
                        <button onClick={() => { setSelectedFile(null); setUploadProgress(0); }} className="btn btn-ghost btn-sm btn-circle">
                            <FiX className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Code Mode Banner */}
            {codeMode && (
                <div className="px-4 py-2 bg-[#1e1e2e] border-t border-base-300 flex items-center gap-3">
                    <FiCode className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="text-xs text-violet-300 font-mono">Code Block Mode</span>
                    <select
                        value={codeLanguage}
                        onChange={e => setCodeLanguage(e.target.value)}
                        className="select select-xs bg-[#2a2a3e] border-[#3a3a4e] text-white/80 font-mono ml-2"
                    >
                        {CODE_LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button onClick={() => setCodeMode(false)} className="btn btn-xs btn-ghost text-white/50 ml-auto">
                        <FiX className="w-3 h-3" /> Cancel
                    </button>
                </div>
            )}

            {/* Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-base-100 rounded-2xl shadow-2xl p-6">
                        <h3 className="text-lg font-bold mb-4">Report Conversation</h3>
                        <p className="text-sm text-base-content/60 mb-4">Why are you reporting this conversation?</p>
                        <div className="space-y-2 mb-6">
                            {["spam", "harassment", "inappropriate-content", "impersonation", "other"].map(reason => (
                                <label key={reason} className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 cursor-pointer">
                                    <input
                                        type="radio" name="reportReason" value={reason}
                                        checked={reportReason === reason}
                                        onChange={e => setReportReason(e.target.value)}
                                        className="radio radio-primary"
                                    />
                                    <span className="capitalize">{reason.replace("-", " ")}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onCloseReportModal} className="btn btn-ghost flex-1">Cancel</button>
                            <button onClick={handleReport} className="btn btn-error flex-1">Submit Report</button>
                        </div>
                    </div>
                </div>
            )}

            {/* @Mention Dropdown */}
            {mentionResults.length > 0 && (
                <div ref={mentionRef} className="mx-4 mb-1 bg-base-100 border border-base-300 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-base-200 text-xs text-base-content/50 font-medium">
                        Mention — {mentionLoading ? "searching..." : `${mentionResults.length} result${mentionResults.length > 1 ? "s" : ""}`}
                    </div>
                    {mentionResults.map((item, idx) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => insertMention(item)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-base-200 transition-colors ${idx === mentionIndex ? "bg-base-200" : ""}`}
                        >
                            {item.type === "agent" ? (
                                <div className="w-7 h-7 bg-gradient-to-br from-violet-500/30 to-cyan-500/30 rounded-lg flex items-center justify-center text-base border border-base-300 flex-shrink-0">
                                    {item.avatar || "🤖"}
                                </div>
                            ) : (
                                <div className="avatar flex-shrink-0">
                                    <div className="w-7 h-7 rounded-full">
                                        <img
                                            src={item.pic || `https://ui-avatars.com/api/?name=${item.display}&background=random`}
                                            alt={item.display}
                                            onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${item.display}&background=random`; }}
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{item.display}</p>
                                <p className="text-xs text-base-content/50">
                                    {item.type === "agent" ? "🤖 Agent" : "👤 Member"} · @{item.label}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Main Input */}
            <form className={`px-4 py-3 border-t border-base-300 bg-base-100 ${codeMode ? "bg-[#1e1e2e]" : ""}`} onSubmit={handleSubmit}>
                <div className="flex items-end gap-2">
                    {/* Attachments */}
                    {!codeMode && (
                        <div className="dropdown dropdown-top">
                            <label tabIndex={0} className="btn btn-ghost btn-circle btn-sm">
                                <BsPaperclip className="w-5 h-5" />
                            </label>
                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-40">
                                <li>
                                    <label className="cursor-pointer flex items-center gap-2">
                                        <FiImage className="w-4 h-4" />
                                        <span>Photo</span>
                                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                                    </label>
                                </li>
                                <li>
                                    <label className="cursor-pointer flex items-center gap-2">
                                        <FiFile className="w-4 h-4" />
                                        <span>Document</span>
                                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileSelect} />
                                    </label>
                                </li>
                            </ul>
                        </div>
                    )}

                    {/* Code Mode Toggle */}
                    <button
                        type="button"
                        onClick={() => { setCodeMode(c => !c); setMessage(""); }}
                        className={`btn btn-ghost btn-circle btn-sm flex-shrink-0 ${codeMode ? "text-violet-400" : ""}`}
                        title={codeMode ? "Exit code mode" : "Send code block"}
                    >
                        <FiCode className="w-5 h-5" />
                    </button>

                    {/* Text Input */}
                    <div className="flex-1 relative">
                        <textarea
                            ref={textareaRef}
                            value={message}
                            onChange={handleTextChange}
                            placeholder={codeMode ? `Paste or type ${codeLanguage} code here...` : isGroup ? "Message... (@ to mention users or agents)" : "Type a message..."}
                            className={`textarea textarea-bordered w-full pr-20 resize-none transition-all ${
                                codeMode
                                    ? "bg-[#2a2a3e] text-white/90 font-mono text-sm border-[#3a3a4e] focus:border-violet-500"
                                    : ""
                            }`}
                            rows={1}
                            style={{ minHeight: "40px", maxHeight: "120px" }}
                            onKeyDown={handleKeyDown}
                        />

                        {/* Emoji Picker (only in text mode) */}
                        {!codeMode && (
                            <div className="absolute right-12 bottom-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-circle btn-sm"
                                    onClick={e => { e.preventDefault(); setShowEmojiPicker(!showEmojiPicker); }}
                                >
                                    <BsEmojiSmile className="w-5 h-5" />
                                </button>
                                {showEmojiPicker && (
                                    <div className="absolute bottom-full right-0 mb-2 z-[50] p-2 shadow-2xl bg-base-100 rounded-2xl w-72 max-h-60 overflow-y-auto border border-base-300">
                                        <div className="grid grid-cols-8 gap-1">
                                            {emojis.map((emoji, idx) => (
                                                <button key={idx} type="button" onClick={() => handleAddEmoji(emoji)} className="text-2xl hover:bg-base-200 rounded-lg p-1 transition-colors">
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Send Button */}
                    <button
                        type="submit"
                        disabled={loading || agentLoading || (!message.trim() && !selectedFile)}
                        className={`btn btn-circle flex-shrink-0 ${codeMode ? "btn-secondary" : "btn-primary"}`}
                    >
                        {loading || agentLoading ? (
                            <span className="loading loading-spinner loading-sm"></span>
                        ) : (
                            <BsSend className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {/* Helper row */}
                <div className="mt-1.5 flex items-center gap-2 text-xs text-base-content/40">
                    {codeMode ? (
                        <span>📋 Code block · <kbd className="kbd kbd-xs">Enter</kbd> sends · <kbd className="kbd kbd-xs">Shift+Enter</kbd> new line</span>
                    ) : isGroup ? (
                        <span>💡 Use <code className="bg-base-200 px-1 rounded font-mono">@name</code> to mention members or agents</span>
                    ) : (
                        <button type="button" className="btn btn-ghost btn-xs gap-1 p-0 h-auto min-h-0" title="Record voice note">
                            <BsMic className="w-3 h-3" />Hold to record
                        </button>
                    )}
                </div>
            </form>
        </>
    );
};

export default MessageInput;