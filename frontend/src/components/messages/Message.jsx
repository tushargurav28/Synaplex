import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../store/useAuthStore";
import { extractTime } from "../../utils/extractTime";
import { useChatStore } from "../../store/useChatStore";
import { IoCheckmark, IoCheckmarkDone, IoTimeOutline } from "react-icons/io5";
import { FiDownload, FiX, FiFile, FiMaximize2, FiEdit2, FiTrash2, FiMoreVertical, FiCheck, FiCopy } from "react-icons/fi";
import { MdBlock } from "react-icons/md";
import { editMessage as apiEditMessage, deleteMessage as apiDeleteMessage } from "../../api/messages.api";
import toast from "react-hot-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ─── Code block renderer ───────────────────────────────────────────────────────
const CodeBlock = ({ code, language }) => {
	const [copied, setCopied] = useState(false);
	const handleCopy = () => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	};
	return (
		<div className="my-2 rounded-xl overflow-hidden border border-base-300/50 bg-[#1e1e2e] w-full">
			<div className="flex items-center justify-between px-3 py-1.5 bg-[#2a2a3e] text-xs text-white/60">
				<span className="font-mono">{language || "code"}</span>
				<button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
					{copied
						? <><FiCheck className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
						: <><FiCopy className="w-3 h-3" />Copy</>
					}
				</button>
			</div>
			<pre className="p-3 overflow-x-auto text-xs text-white/90 font-mono leading-relaxed">
				<code>{code}</code>
			</pre>
		</div>
	);
};

// ─── Markdown renderer using react-markdown ───────────────────────────────
const MarkdownRenderer = ({ text }) => {
	return (
		<div className="prose prose-sm prose-invert max-w-none leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					code({ node, inline, className, children, ...props }) {
						const match = /language-(\w+)/.exec(className || '');
						if (!inline && match) {
							return (
								<CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
							);
						}
						if (!inline) {
							return <CodeBlock code={String(children).replace(/\n$/, '')} language="plaintext" /> ;
						}
						return (
							<code className="bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-mono text-cyan-200" {...props}>
								{children}
							</code>
						);
					},
					p({ children }) {
						return <p className="m-0 mb-2 last:mb-0">{children}</p>;
					},
					a({ children, href }) {
						return <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">{children}</a>;
					},
					ul({ children }) {
						return <ul className="list-disc pl-4 mb-2">{children}</ul>;
					},
					ol({ children }) {
						return <ol className="list-decimal pl-4 mb-2">{children}</ol>;
					},
					h1({ children }) { return <h1 className="text-lg font-bold mt-3 mb-1 text-white">{children}</h1> },
					h2({ children }) { return <h2 className="text-base font-bold mt-3 mb-1 text-white">{children}</h2> },
					h3({ children }) { return <h3 className="text-sm font-bold mt-2 mb-1 text-white">{children}</h3> },
					blockquote({ children }) {
						return <blockquote className="border-l-4 border-violet-500/50 pl-3 italic text-white/70 my-2">{children}</blockquote>
					}
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
};

// ─── Agent message bubble ──────────────────────────────────────────────────────
const AgentMessageBubble = ({ message }) => {
	// Strip leading "🤖 **AgentName**: " prefix that backend adds
	const content = message.message?.replace(/^🤖 \*\*[^*]+\*\*: /, "") || "";
	return (
		<div className="flex gap-3 mb-1">
			<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-base-300 flex items-center justify-center text-base flex-shrink-0 mt-0.5">
				{message.agentAvatar || "🤖"}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<span className="text-xs font-bold text-violet-500">{message.agentName || "Agent"}</span>
					<span className="badge badge-ghost badge-xs">AI</span>
					<span className="text-[10px] text-base-content/40">{extractTime(message.createdAt)}</span>
				</div>
				<div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-2xl rounded-tl-sm px-4 py-3 text-sm w-full max-w-full overflow-hidden">
					<MarkdownRenderer text={content} />
				</div>
			</div>
		</div>
	);
};

// ─── Main Message component ────────────────────────────────────────────────────
const Message = ({ message }) => {
	const { authUser } = useAuthStore();
	const { selectedUser: selectedConversation, editMessageInStore, markMessageDeleted } = useChatStore();
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [showActions, setShowActions] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editText, setEditText] = useState(message.message || "");
	const [editLoading, setEditLoading] = useState(false);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const actionsRef = useRef(null);
	const editInputRef = useRef(null);

	const senderId = typeof message.senderId === "object" && message.senderId?._id
		? message.senderId._id.toString()
		: message.senderId?.toString();
	const fromMe = senderId === authUser._id;
	const formattedTime = extractTime(message.createdAt);
	const chatClassName = fromMe ? "chat-end" : "chat-start";
	const bubbleBgColor = fromMe ? "bg-blue-500" : "";
	const shakeClass = message.shouldShake ? "shake" : "";

	const hasAttachments = message.attachments && message.attachments.length > 0;
	const isImage = message.type === "image" ||
		(hasAttachments && message.attachments[0]?.mimeType?.startsWith("image/"));
	const isCode = message.type === "code";

	// Close actions on outside click
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (actionsRef.current && !actionsRef.current.contains(e.target)) setShowActions(false);
		};
		if (showActions) document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showActions]);

	useEffect(() => {
		if (isEditing && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.setSelectionRange(editText.length, editText.length);
		}
	}, [isEditing]);

	const handleDownload = async (url, fileName) => {
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl; a.download = fileName || "download";
			document.body.appendChild(a); a.click();
			document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
		} catch { window.open(url, "_blank"); }
	};

	const handleEdit = async () => {
		if (!editText.trim() || editText.trim() === message.message) { setIsEditing(false); return; }
		setEditLoading(true);
		try {
			await apiEditMessage(message._id, editText.trim());
			editMessageInStore(message._id, editText.trim());
			setIsEditing(false);
			toast.success("Message edited");
		} catch (error) {
			toast.error(error.response?.data?.error || "Failed to edit message");
		} finally { setEditLoading(false); }
	};

	const handleDelete = async () => {
		setDeleteLoading(true);
		try {
			await apiDeleteMessage(message._id);
			markMessageDeleted(message._id);
			setShowActions(false);
			toast.success("Message deleted");
		} catch (error) {
			toast.error(error.response?.data?.error || "Failed to delete message");
		} finally { setDeleteLoading(false); }
	};

	const handleEditKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEdit(); }
		if (e.key === "Escape") { setIsEditing(false); setEditText(message.message || ""); }
	};

	// ── Agent message — special layout ──────────────────────────────────────────
	if (message.isAgentMessage) {
		return <AgentMessageBubble message={message} />;
	}

	// ── Deleted message ──────────────────────────────────────────────────────────
	if (message.deleted) {
		return (
			<div className={`chat ${chatClassName}`}>
				<div className="chat-image avatar">
					<div className="w-10 rounded-full">
						<img
							alt="avatar"
							src={fromMe ? (authUser.profilePic || `https://ui-avatars.com/api/?name=${authUser.username}&background=random`) : (selectedConversation?.profilePic || `https://ui-avatars.com/api/?name=${message.senderId?.username || "User"}&background=random`)}
							onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${message.senderId?.username || "User"}&background=random`; }}
						/>
					</div>
				</div>
				<div className="chat-bubble bg-base-300/50 text-base-content/40 italic flex items-center gap-2 pb-2">
					<MdBlock className="w-4 h-4" />
					<span>This message was deleted</span>
				</div>
				<div className="chat-footer opacity-50 text-xs flex gap-1 items-center">{formattedTime}</div>
			</div>
		);
	}

	// ── Detect @mentions in text to highlight them ───────────────────────────────
	const renderTextWithMentions = (text) => {
		if (!text) return null;
		const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
		return parts.map((part, i) =>
			/^@[a-zA-Z0-9_]+$/.test(part)
				? <span key={i} className="text-cyan-300 font-semibold">{part}</span>
				: part
		);
	};

	// ── Profile pic src for chat ─────────────────────────────────────────────────
	const avatarSrc = fromMe
		? (authUser.profilePic || `https://ui-avatars.com/api/?name=${authUser.username || "Me"}&background=random`)
		: (selectedConversation?.profilePic || `https://ui-avatars.com/api/?name=${message.senderId?.username || message.senderId?.fullName || "User"}&background=random`);

	return (
		<>
			<div className={`chat ${chatClassName} group`}>
				<div className="chat-image avatar">
					<div className="w-10 rounded-full">
						<img
							alt="avatar"
							src={avatarSrc}
							onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${message.senderId?.username || "User"}&background=random`; }}
						/>
					</div>
				</div>

				{/* Group sender name */}
				{selectedConversation?.isGroup && !fromMe && (
					<div className="chat-header text-xs text-base-content/50 mb-0.5">
						{message.senderId?.fullName || message.senderId?.username || "Unknown"}
					</div>
				)}

				{/* Message bubble */}
				<div className={`chat-bubble text-white ${isCode ? "!bg-transparent !p-0" : bubbleBgColor} ${shakeClass} pb-2 relative`}>
					{/* Actions button */}
					{fromMe && !isEditing && (
						<div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" ref={actionsRef}>
							<button
								className="btn btn-ghost btn-circle btn-xs text-base-content/50 hover:text-base-content"
								onClick={() => setShowActions(!showActions)}
							>
								<FiMoreVertical className="w-3.5 h-3.5" />
							</button>
							{showActions && (
								<div className="absolute right-full top-1/2 -translate-y-1/2 mr-1 z-50">
									<ul className="menu bg-base-100 rounded-xl shadow-xl border border-base-200 p-1 min-w-[140px]">
										<li>
											<button
												className="flex items-center gap-2 text-sm text-base-content hover:bg-base-200 rounded-lg px-3 py-2"
												onClick={() => { setIsEditing(true); setShowActions(false); setEditText(message.message || ""); }}
												disabled={hasAttachments && !message.message}
											>
												<FiEdit2 className="w-3.5 h-3.5" /> Edit
											</button>
										</li>
										<li>
											<button
												className="flex items-center gap-2 text-sm text-error hover:bg-error/10 rounded-lg px-3 py-2"
												onClick={handleDelete}
												disabled={deleteLoading}
											>
												{deleteLoading ? <span className="loading loading-spinner loading-xs" /> : <FiTrash2 className="w-3.5 h-3.5" />}
												Delete
											</button>
										</li>
									</ul>
								</div>
							)}
						</div>
					)}

					{/* ── CODE message type ─────────────────────── */}
					{isCode && message.message && (
						<CodeBlock code={message.message} language={message.codeLanguage || "plaintext"} />
					)}

					{/* ── Editing mode ──────────────────────────── */}
					{!isCode && isEditing ? (
						<div className="flex flex-col gap-2 min-w-[200px]">
							<textarea
								ref={editInputRef}
								value={editText}
								onChange={e => setEditText(e.target.value)}
								onKeyDown={handleEditKeyDown}
								className="textarea textarea-bordered textarea-sm bg-white/10 text-white border-white/20 focus:border-white/50 resize-none w-full"
								rows={2}
								disabled={editLoading}
							/>
							<div className="flex items-center justify-between">
								<span className="text-[10px] opacity-60">Esc to cancel · Enter to save</span>
								<div className="flex gap-1">
									<button className="btn btn-ghost btn-xs text-white/70 hover:text-white" onClick={() => { setIsEditing(false); setEditText(message.message || ""); }} disabled={editLoading}>
										<FiX className="w-3 h-3" />
									</button>
									<button className="btn btn-ghost btn-xs text-white/70 hover:text-white" onClick={handleEdit} disabled={editLoading || !editText.trim()}>
										{editLoading ? <span className="loading loading-spinner loading-xs" /> : <FiCheck className="w-3.5 h-3.5" />}
									</button>
								</div>
							</div>
						</div>
					) : (
						<>
							{/* Text content with mention highlights and inline markdown */}
							{!isCode && message.message && (
								<div className="leading-relaxed break-words">
									{message.message.includes("```") || message.message.includes("**") || message.message.includes("#") 
										? <MarkdownRenderer text={message.message} />
										: renderTextWithMentions(message.message)
									}
								</div>
							)}
						</>
					)}

					{/* Image attachment */}
					{hasAttachments && isImage && (
						<div className="mt-2 relative group/img cursor-pointer" onClick={() => setLightboxOpen(true)}>
							<img
								src={message.attachments[0].url}
								alt={message.attachments[0].fileName || "image"}
								className="rounded-lg max-w-[240px] max-h-[300px] object-cover transition-opacity group-hover/img:opacity-80"
							/>
							<div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-3">
								<button className="btn btn-circle btn-sm bg-white/20 border-0 hover:bg-white/40" onClick={e => { e.stopPropagation(); setLightboxOpen(true); }}>
									<FiMaximize2 className="w-4 h-4 text-white" />
								</button>
								<button className="btn btn-circle btn-sm bg-white/20 border-0 hover:bg-white/40" onClick={e => { e.stopPropagation(); handleDownload(message.attachments[0].url, message.attachments[0].fileName); }}>
									<FiDownload className="w-4 h-4 text-white" />
								</button>
							</div>
						</div>
					)}

					{/* File attachment */}
					{hasAttachments && !isImage && (
						<div className="mt-2 flex items-center gap-3 p-3 bg-white/10 rounded-lg min-w-[200px]">
							<div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
								<FiFile className="w-5 h-5 text-white" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{message.attachments[0].fileName || "File"}</p>
								{message.attachments[0].size && (
									<p className="text-xs opacity-70">{(message.attachments[0].size / 1024 / 1024).toFixed(2)} MB</p>
								)}
							</div>
							<button className="btn btn-circle btn-sm bg-white/20 border-0 hover:bg-white/40 flex-shrink-0" onClick={() => handleDownload(message.attachments[0].url, message.attachments[0].fileName)}>
								<FiDownload className="w-4 h-4 text-white" />
							</button>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="chat-footer opacity-50 text-xs flex gap-1 items-center">
					{formattedTime}
					{message.edited && <span className="italic text-[10px]">· edited</span>}
					{fromMe && (
						<span className="text-[10px]">
							{message.status === "sending" && <IoTimeOutline />}
							{message.status === "sent" && <IoCheckmark />}
							{(!message.status || message.status === "delivered" || message.status === "read") && <IoCheckmarkDone />}
						</span>
					)}
				</div>
			</div>

			{/* Fullscreen Lightbox */}
			{lightboxOpen && hasAttachments && isImage && (
				<div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={() => setLightboxOpen(false)}>
					<div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
						<div className="text-white/80 text-sm">{message.attachments[0].fileName || "Image"}</div>
						<div className="flex items-center gap-2">
							<button className="btn btn-circle btn-sm bg-white/10 border-0 hover:bg-white/30 text-white" onClick={e => { e.stopPropagation(); handleDownload(message.attachments[0].url, message.attachments[0].fileName); }}>
								<FiDownload className="w-4 h-4" />
							</button>
							<button className="btn btn-circle btn-sm bg-white/10 border-0 hover:bg-white/30 text-white" onClick={e => { e.stopPropagation(); setLightboxOpen(false); }}>
								<FiX className="w-5 h-5" />
							</button>
						</div>
					</div>
					<img
						src={message.attachments[0].url}
						alt={message.attachments[0].fileName || "Full size image"}
						className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
						onClick={e => e.stopPropagation()}
					/>
				</div>
			)}
		</>
	);
};

export default Message;
