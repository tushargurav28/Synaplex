import { useState, useRef, useEffect } from "react";
import { FiSend, FiX, FiLoader, FiAlertCircle, FiTrash2 } from "react-icons/fi";
import { AiOutlineRobot } from "react-icons/ai";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import toast from "react-hot-toast";
import api from "../../api/axios";

const AIChatPanel = ({ onClose }) => {
    const { authUser } = useAuthStore();
    const { aiMessages, setAiMessages, addAiMessage } = useChatStore();
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [aiMessages]);

    useEffect(() => {
        inputRef.current?.focus();
        try {
            const stored = localStorage.getItem(`ai-chat-${authUser?._id}`);
            if (stored) setAiMessages(JSON.parse(stored));
        } catch (e) {
            console.error("Failed to load AI chat from local storage", e);
        }
    }, [authUser?._id, setAiMessages]);

    useEffect(() => {
        if (aiMessages.length > 0) {
            localStorage.setItem(`ai-chat-${authUser?._id}`, JSON.stringify(aiMessages));
        }
    }, [aiMessages, authUser?._id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim() || loading) return;

        const userMessage = {
            _id: `temp-${Date.now()}`,
            role: "user",
            content: message.trim(),
            createdAt: new Date().toISOString()
        };

        addAiMessage(userMessage);
        setMessage("");
        setLoading(true);
        setError(null);

        try {
            const res = await api.post("/ai/chat", {
                message: userMessage.content,
                context: aiMessages.slice(-10).map(m => ({
                    role: m.role,
                    content: m.content
                }))
            });

            const data = res.data;

            const aiResponse = {
                _id: data.message?._id || `ai-${Date.now()}`,
                role: "assistant",
                content: data.message?.message || data.response,
                createdAt: new Date().toISOString(),
                usage: data.usage
            };
            addAiMessage(aiResponse);

        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message || "Failed to get AI response";
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleClearChat = () => {
        setAiMessages([]);
        localStorage.removeItem(`ai-chat-${authUser?._id}`);
        toast.success("Chat cleared");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-base-200 bg-gradient-to-r from-primary/10 to-secondary/10">
                    <div className="flex items-center gap-3">
                        <div className="avatar">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                                <AiOutlineRobot className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-bold">AI Assistant</h2>
                            <p className="text-xs text-base-content/60">Powered by AI • Private to you</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleClearChat}
                            className="btn btn-ghost btn-sm"
                            title="Clear chat"
                        >
                            <FiTrash2 className="w-4 h-4" />
                        </button>
                        <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                            <FiX className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-base-200/30">
                    {aiMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-base-content/60">
                            <AiOutlineRobot className="w-12 h-12 mb-3 opacity-50" />
                            <p className="text-center">Ask me anything! I can help with:</p>
                            <ul className="text-sm mt-2 space-y-1 text-center">
                                <li>• Writing & editing assistance</li>
                                <li>• Code explanations</li>
                                <li>• General knowledge questions</li>
                            </ul>
                        </div>
                    ) : (
                        aiMessages.map((msg) => (
                            <div 
                                key={msg._id} 
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div className={`max-w-xs md:max-w-md lg:max-w-lg rounded-2xl p-3 shadow-sm ${
                                    msg.role === "user" 
                                        ? "bg-primary text-primary-content rounded-br-none" 
                                        : "bg-base-100 border border-base-200 rounded-bl-none"
                                }`}>
                                    {msg.role === "assistant" && (
                                        <div className="flex items-center gap-2 mb-1">
                                            <AiOutlineRobot className="w-4 h-4 text-primary" />
                                            <span className="text-xs font-medium text-primary">AI Assistant</span>
                                        </div>
                                    )}
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    {msg.usage && (
                                        <p className="text-xs text-base-content/40 mt-2">
                                            Tokens: {msg.usage.total_tokens}
                                        </p>
                                    )}
                                    <p className="text-xs text-base-content/40 mt-1 text-right">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                    
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-base-100 border border-base-200 rounded-2xl rounded-bl-none p-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <FiLoader className="w-4 h-4 animate-spin text-primary" />
                                    <span className="text-sm">AI is thinking...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {error && (
                        <div className="flex justify-center">
                            <div className="alert alert-warning max-w-md">
                                <FiAlertCircle className="w-5 h-5" />
                                <span className="text-sm">{error}</span>
                            </div>
                        </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t border-base-200 bg-base-100">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Ask AI anything..."
                            className="input input-bordered flex-1"
                            disabled={loading}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                        />
                        <button 
                            type="submit" 
                            disabled={loading || !message.trim()}
                            className="btn btn-primary"
                        >
                            {loading ? <FiLoader className="w-5 h-5 animate-spin" /> : <FiSend className="w-5 h-5" />}
                        </button>
                    </div>
                    <p className="text-xs text-base-content/50 mt-2 text-center">
                        AI responses may not always be accurate. Verify important information.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default AIChatPanel;