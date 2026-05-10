import { useState, useRef, useEffect } from "react";
import { FiArrowLeft, FiX, FiSend, FiGlobe, FiCode, FiCopy, FiCheck } from "react-icons/fi";
import api from "../../api/axios";
import toast from "react-hot-toast";

// Syntax highlight + code block renderer (lightweight, no deps)
const CodeBlock = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="my-2 rounded-xl overflow-hidden border border-base-300 bg-[#1e1e2e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2a2a3e] text-xs text-white/60">
                <span className="font-mono">{language || "code"}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-white transition-colors">
                    {copied ? <><FiCheck className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></> : <><FiCopy className="w-3 h-3" />Copy</>}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm text-white/90 font-mono leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    );
};

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Parse markdown-like response with code blocks
const MessageContent = ({ content }) => {
    return (
        <div className="prose prose-sm max-w-none leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match) {
                            return <CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />;
                        }
                        if (!inline) {
                            return <CodeBlock code={String(children).replace(/\n$/, '')} language="plaintext" />;
                        }
                        return (
                            <code className="bg-base-300 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                                {children}
                            </code>
                        );
                    },
                    p({ children }) { return <p className="m-0 mb-2 last:mb-0">{children}</p>; },
                    a({ children, href }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-focus underline">{children}</a>; },
                    ul({ children }) { return <ul className="list-disc pl-4 mb-2">{children}</ul>; },
                    ol({ children }) { return <ol className="list-decimal pl-4 mb-2">{children}</ol>; },
                    h1({ children }) { return <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>; },
                    h2({ children }) { return <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>; },
                    h3({ children }) { return <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>; },
                    blockquote({ children }) { return <blockquote className="border-l-4 border-primary/50 pl-3 italic opacity-80 my-2">{children}</blockquote>; }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

const PersonalAgentChat = ({ agent, onBack, onClose, inline = false }) => {
    const [messages, setMessages] = useState([
        {
            id: "welcome",
            role: "agent",
            content: `Hi! I'm **${agent.name}**${agent.description ? ` — ${agent.description}` : ""}. How can I help you today?`,
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [searchUsed, setSearchUsed] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
        
        // Fetch chat history
        const fetchHistory = async () => {
            try {
                const res = await api.get(`/agents/${agent._id}/messages`);
                if (res.data.success && res.data.messages.length > 0) {
                    const historyMessages = res.data.messages.map(m => ({
                        id: m._id,
                        role: m.isAgentMessage ? "agent" : "user",
                        content: m.message,
                        searchUsed: m.searchUsed,
                        timestamp: m.createdAt
                    }));
                    
                    setMessages(prev => {
                        const welcomeMsg = prev.find(p => p.id === "welcome");
                        return welcomeMsg ? [welcomeMsg, ...historyMessages] : historyMessages;
                    });
                }
            } catch (err) {
                console.error("Failed to fetch agent chat history", err);
            }
        };
        fetchHistory();
    }, [agent._id]);

    const handleSend = async () => {
        const msg = input.trim();
        if (!msg || loading) return;

        setInput("");
        const userMsg = { id: Date.now(), role: "user", content: msg, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);
        setSearchUsed(false);

        try {
            // Build history for context
            const history = messages
                .filter(m => m.id !== "welcome")
                .map(m => ({ content: m.content, fromAgent: m.role === "agent" }));

            const res = await api.post("/agents/chat", {
                agentId: agent._id,
                message: msg,
                history
            });

            setSearchUsed(res.data.searchUsed || false);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: "agent",
                content: res.data.response,
                searchUsed: res.data.searchUsed,
                timestamp: new Date()
            }]);
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to get response");
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: "agent",
                content: "⚠️ Sorry, I encountered an error. Please try again.",
                timestamp: new Date(),
                isError: true
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const content = (
        <>
            {/* Header (only for modal mode) */}
            {!inline && (
                <div className="bg-gradient-to-r from-violet-600/20 via-primary/20 to-cyan-500/20 px-4 py-3 flex items-center gap-3 border-b border-base-200 shrink-0 rounded-t-2xl">
                    <button onClick={onBack} className="btn btn-ghost btn-sm btn-circle">
                        <FiArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 bg-gradient-to-br from-violet-500/30 to-cyan-500/30 rounded-xl flex items-center justify-center text-xl border border-base-300 shadow">
                        {agent.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{agent.name}</p>
                        <div className="flex items-center gap-1.5 text-xs text-base-content/50">
                            {agent.canSearchWeb && <><FiGlobe className="w-3 h-3 text-primary" /><span>Web Search</span> · </>}
                            <span>@{agent.triggerName}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        <FiX className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                msg.role === "user" 
                                    ? "bg-primary text-white"
                                    : "bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-base-300"
                            }`}>
                                {msg.role === "user" ? "👤" : agent.avatar}
                            </div>
                            
                            {/* Bubble */}
                            <div className={`${msg.role === "user" ? "max-w-[80%] items-end" : "flex-1 min-w-0 items-start"} flex flex-col gap-1`}>
                                {msg.searchUsed && (
                                    <div className="flex items-center gap-1.5 text-xs text-primary px-2">
                                        <FiGlobe className="w-3 h-3" />
                                        <span>Web search used</span>
                                    </div>
                                )}
                                <div className={`px-3 py-2.5 rounded-2xl text-sm ${
                                    msg.role === "user"
                                        ? "bg-primary text-white rounded-br-sm"
                                        : msg.isError
                                            ? "bg-error/10 text-error rounded-bl-sm border border-error/20"
                                            : "bg-base-200 text-base-content rounded-bl-sm"
                                }`}>
                                    <MessageContent content={msg.content} />
                                </div>
                                <span className="text-[10px] text-base-content/40 px-1">{formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-base-300 flex items-center justify-center text-sm">
                                {agent.avatar}
                            </div>
                            <div className="bg-base-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-base-200 bg-base-100 rounded-b-2xl shrink-0">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={`Ask ${agent.name} anything...`}
                            className="textarea textarea-bordered flex-1 resize-none text-sm"
                            rows={1}
                            style={{ minHeight: "40px", maxHeight: "100px" }}
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="btn btn-primary btn-circle btn-sm flex-shrink-0"
                        >
                            {loading ? <span className="loading loading-spinner loading-xs" /> : <FiSend className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-base-content/40 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
                </div>
        </>
    );

    if (inline) {
        return (
            <div className="flex flex-col flex-1 h-full bg-base-100 min-h-0">
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-base-100 rounded-2xl shadow-2xl flex flex-col" style={{ height: "85vh" }}>
                {content}
            </div>
        </div>
    );
};

export default PersonalAgentChat;
