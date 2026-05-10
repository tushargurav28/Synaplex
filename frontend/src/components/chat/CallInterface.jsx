import { useState, useEffect, useRef, useCallback } from "react";
import {
    FiPhone, FiVideo, FiMic, FiMicOff, FiVideoOff,
    FiX, FiMaximize2, FiMinimize2, FiVolume2, FiVolumeX
} from "react-icons/fi";
import { useSocketStore } from "../../store/useSocketStore";
import { useAuthStore } from "../../store/useAuthStore";
import toast from "react-hot-toast";

// ─── Incoming Call Banner ──────────────────────────────────────────────────────
export const IncomingCallBanner = ({ incomingCall, onAccept, onReject }) => {
    if (!incomingCall) return null;
    return (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-base-100 border border-base-300 rounded-2xl shadow-2xl p-4 w-80">
                {/* Animated ring */}
                <div className="flex items-center gap-4 mb-4">
                    <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                            {incomingCall.callerName?.[0]?.toUpperCase() || "?"}
                        </div>
                        <span className="absolute -inset-1.5 rounded-full border-2 border-green-400 animate-ping opacity-60" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold truncate">{incomingCall.callerName || "Unknown"}</p>
                        <p className="text-sm text-base-content/60 flex items-center gap-1.5">
                            {incomingCall.type === "video"
                                ? <><FiVideo className="w-3.5 h-3.5 text-cyan-400" /> Incoming video call</>
                                : <><FiPhone className="w-3.5 h-3.5 text-green-400" /> Incoming voice call</>
                            }
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onReject}
                        className="flex-1 btn btn-error btn-sm gap-2"
                    >
                        <FiPhone className="w-4 h-4 rotate-[135deg]" /> Decline
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex-1 btn btn-success btn-sm gap-2"
                    >
                        {incomingCall.type === "video"
                            ? <FiVideo className="w-4 h-4" />
                            : <FiPhone className="w-4 h-4" />
                        }
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Call Interface ───────────────────────────────────────────────────────
const CallInterface = ({ conversation, callType, onClose, isAnswering = false }) => {
    const { socket, emitCallEvent, incomingCall, setIncomingCall } = useSocketStore();
    const { authUser } = useAuthStore();

    const [callStatus, setCallStatus] = useState(isAnswering ? "connecting" : "ringing");
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isSpeakerOff, setIsSpeakerOff] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [isMinimized, setIsMinimized] = useState(false);
    const [hasRemoteStream, setHasRemoteStream] = useState(false);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const callTimeoutRef = useRef(null);
    const durationTimerRef = useRef(null);
    const iceCandidateQueueRef = useRef([]);

    // The other party's userId:
    // - For DM conversations: conversation._id IS the other user's ID (from /api/users)
    // - For group conversations: find the participant that isn't me
    const receiverId = (() => {
        // If no participants array, this is a DM — the conversation._id is the user
        if (!conversation?.participants || conversation.participants.length === 0) {
            return conversation?._id?.toString();
        }
        // Group-style: find the other participant
        const found = conversation.participants.find(p => {
            const pid = typeof p === "object" ? p._id?.toString() : p?.toString();
            return pid !== authUser?._id?.toString();
        });
        if (!found) return conversation?._id?.toString(); // fallback
        return typeof found === "object" ? found._id?.toString() : found?.toString();
    })();

    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
        ]
    };

    const formatDuration = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    // ── Cleanup ────────────────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        clearTimeout(callTimeoutRef.current);
        clearInterval(durationTimerRef.current);

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        iceCandidateQueueRef.current = [];
    }, []);

    // ── End call ────────────────────────────────────────────────────────────────
    const endCall = useCallback((silent = false) => {
        if (!silent && socket && receiverId) {
            emitCallEvent("endCall", {
                from: authUser?._id,
                to: receiverId,
                conversationId: conversation?._id
            });
        }
        cleanup();
        setCallStatus("ended");
        setTimeout(onClose, 1200);
    }, [socket, receiverId, authUser, conversation, emitCallEvent, cleanup, onClose]);

    // ── Reject (receiver-side) ─────────────────────────────────────────────────
    const rejectCall = useCallback(() => {
        if (socket && incomingCall) {
            emitCallEvent("rejectCall", {
                from: incomingCall.from,
                to: authUser?._id,
                conversationId: conversation?._id
            });
            setIncomingCall(null);
        }
        cleanup();
        onClose();
    }, [socket, incomingCall, authUser, conversation, emitCallEvent, setIncomingCall, cleanup, onClose]);

    // ── Build RTCPeerConnection ────────────────────────────────────────────────
    const createPeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
            if (event.streams?.[0] && remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
                setHasRemoteStream(true);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                emitCallEvent("iceCandidate", {
                    from: authUser?._id,
                    to: receiverId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                setCallStatus("connected");
                clearTimeout(callTimeoutRef.current);
                durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
            }
            if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
                // If the connection drops, we must notify the server so it doesn't get stuck in 'ongoing'
                endCall(false);
            }
        };

        return pc;
    }, [authUser, receiverId, emitCallEvent, endCall]);

    // ── Get user media ─────────────────────────────────────────────────────────
    const getLocalMedia = useCallback(async () => {
        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw Object.assign(new Error("Your browser does not support calls. Please use Chrome, Firefox, or Safari."), { name: "NotSupportedError" });
        }

        // For video calls, try video+audio first, fall back to audio-only
        if (callType === "video") {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                return stream;
            } catch (vidErr) {
                console.warn("Video unavailable, falling back to audio-only:", vidErr.name);
                // Fall through to audio-only
            }
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        return stream;
    }, [callType]);

    // ── Start call (caller side) ───────────────────────────────────────────────
    const startCall = useCallback(async () => {
        try {
            if (!receiverId) {
                toast.error("Cannot determine call recipient. Please try again.");
                onClose();
                return;
            }
            console.log("[Call] receiverId:", receiverId, "| callType:", callType);
            const stream = await getLocalMedia();
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            emitCallEvent("callUser", {
                from: authUser?._id,
                to: receiverId,
                conversationId: conversation?._id,
                signalData: offer,
                type: callType,
                callerName: authUser?.fullName || authUser?.username
            });

            setCallStatus("ringing");
            callTimeoutRef.current = setTimeout(() => {
                toast.error("No answer");
                endCall(false); // MUST be false so it emits 'endCall' to server and receiver
            }, 35000);

        } catch (err) {
            console.error("Start call error:", err.name, err.message);
            const errorMessages = {
                NotAllowedError:   "Microphone/camera access was denied. Please allow access and try again.",
                NotFoundError:     "No microphone found. Please connect a microphone and try again.",
                NotSupportedError: err.message,
                NotReadableError:  "Microphone/camera is already in use by another app.",
                OverconstrainedError: "Could not access your camera/microphone.",
            };
            toast.error(errorMessages[err.name] || `Failed to start call: ${err.message || err.name}`);
            onClose();
        }
    }, [getLocalMedia, createPeerConnection, emitCallEvent, authUser, receiverId, conversation, callType, endCall, onClose]);

    // ── Answer call (receiver side) ────────────────────────────────────────────
    const answerCall = useCallback(async () => {
        if (!incomingCall) return;
        try {
            const stream = await getLocalMedia();
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.signalData));

            // Drain queued ICE candidates
            for (const cand of iceCandidateQueueRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            iceCandidateQueueRef.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            emitCallEvent("acceptCall", {
                from: incomingCall.from,
                to: authUser?._id,
                conversationId: conversation?._id,
                signalData: answer
            });

            setCallStatus("connected");
            setIncomingCall(null);
            durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);

        } catch (err) {
            console.error("Answer call error:", err);
            toast.error("Failed to answer call");
            // End call and notify backend
            endCall(false);
        }
    }, [incomingCall, getLocalMedia, createPeerConnection, emitCallEvent, authUser, conversation, setIncomingCall, endCall]);

    // ── Socket event listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const handleCallAccepted = async ({ signalData }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                for (const cand of iceCandidateQueueRef.current) {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                }
                iceCandidateQueueRef.current = [];
                setCallStatus("connected");
                clearTimeout(callTimeoutRef.current);
                durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
            } catch (err) {
                console.error("callAccepted error:", err);
            }
        };

        const handleIceCandidate = async ({ candidate }) => {
            const pc = peerConnectionRef.current;
            if (!pc || !candidate) return;
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    iceCandidateQueueRef.current.push(candidate);
                }
            } catch (err) {
                console.error("ICE candidate error:", err);
            }
        };

        const handleCallRejected = () => {
            toast.error("Call declined");
            endCall(true);
        };

        const handleCallEnded = () => {
            endCall(true);
        };

        socket.on("callAccepted", handleCallAccepted);
        socket.on("iceCandidate", handleIceCandidate);
        socket.on("callRejected", handleCallRejected);
        socket.on("callEnded", handleCallEnded);

        return () => {
            socket.off("callAccepted", handleCallAccepted);
            socket.off("iceCandidate", handleIceCandidate);
            socket.off("callRejected", handleCallRejected);
            socket.off("callEnded", handleCallEnded);
        };
    }, [socket, endCall]);

    // ── Init ───────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isAnswering) {
            answerCall();
        } else {
            startCall();
        }
        return cleanup;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Controls ───────────────────────────────────────────────────────────────
    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsMuted(m => !m);
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsVideoOff(v => !v);
        }
    };

    const toggleSpeaker = () => {
        if (remoteVideoRef.current) {
            remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
            setIsSpeakerOff(s => !s);
        }
    };

    // ── Avatar fallback ────────────────────────────────────────────────────────
    const avatarSrc = conversation?.profilePic
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(conversation?.fullName || "User")}&background=random&size=256`;

    const callerInitial = (conversation?.fullName || "?")[0].toUpperCase();

    // ── Minimized pill ─────────────────────────────────────────────────────────
    if (isMinimized) {
        return (
            <div className="fixed bottom-6 right-6 z-[90]">
                <div className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-full shadow-2xl pl-1 pr-4 py-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                        {callerInitial}
                    </div>
                    <div>
                        <p className="text-xs font-semibold leading-tight">{conversation?.fullName}</p>
                        <p className="text-[10px] text-green-400 leading-tight">
                            {callStatus === "connected" ? formatDuration(callDuration) : callStatus}
                        </p>
                    </div>
                    <button onClick={() => setIsMinimized(false)} className="btn btn-ghost btn-xs btn-circle">
                        <FiMaximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => endCall()} className="btn btn-error btn-xs btn-circle">
                        <FiPhone className="w-3.5 h-3.5 rotate-[135deg]" />
                    </button>
                </div>
            </div>
        );
    }

    // ── Full UI ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className={`relative w-full shadow-2xl rounded-3xl overflow-hidden flex flex-col transition-all duration-300 ${
                callType === "video" ? "max-w-2xl aspect-video" : "max-w-sm"
            }`}>
                {/* ── Background ── */}
                {callType === "video" ? (
                    <>
                        {/* Remote video fills background */}
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        {/* Overlay if no remote stream yet */}
                        {!hasRemoteStream && (
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-24 h-24 rounded-full mx-auto mb-4 ring-4 ring-violet-500/40 overflow-hidden shadow-2xl">
                                        <img src={avatarSrc} alt="" className="w-full h-full object-cover" onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${callerInitial}&background=7c3aed&color=fff&size=256`; }} />
                                    </div>
                                    <p className="text-white font-semibold text-lg">{conversation?.fullName}</p>
                                    <p className="text-violet-300 text-sm mt-1">{callStatus === "ringing" ? "Ringing…" : "Connecting…"}</p>
                                </div>
                            </div>
                        )}

                        {/* Local video PiP */}
                        <div className="absolute bottom-20 right-4 w-32 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl z-10">
                            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            {isVideoOff && (
                                <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                                    <FiVideoOff className="w-6 h-6 text-white/50" />
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Voice call – gradient bg */
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
                )}

                {/* ── Glassmorphic content layer ── */}
                <div className="relative z-10 flex flex-col h-full">
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-5 pt-5">
                        <div className="flex items-center gap-2">
                            {callStatus === "connected" && (
                                <span className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/30 text-green-400 text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                    {formatDuration(callDuration)}
                                </span>
                            )}
                            {callStatus === "ringing" && (
                                <span className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs px-2.5 py-1 rounded-full backdrop-blur-sm animate-pulse">
                                    Ringing…
                                </span>
                            )}
                            {callStatus === "connecting" && (
                                <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                                    Connecting…
                                </span>
                            )}
                            {callStatus === "ended" && (
                                <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                                    Call ended
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setIsMinimized(true)} className="btn btn-ghost btn-circle btn-sm text-white/60 hover:text-white">
                                <FiMinimize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Center caller info (voice call or no remote video) */}
                    {(callType !== "video" || !hasRemoteStream) && callType !== "video" && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
                            {/* Pulsing avatar */}
                            <div className="relative">
                                {callStatus !== "connected" && (
                                    <>
                                        <span className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping scale-150" />
                                        <span className="absolute inset-0 rounded-full bg-violet-500/10 animate-ping scale-125 animation-delay-300" />
                                    </>
                                )}
                                <div className="relative w-28 h-28 rounded-full ring-4 ring-violet-500/50 ring-offset-4 ring-offset-transparent overflow-hidden shadow-2xl">
                                    <img
                                        src={avatarSrc}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${callerInitial}&background=7c3aed&color=fff&size=256`; }}
                                    />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-white text-xl font-bold">{conversation?.fullName}</p>
                                <p className="text-white/50 text-sm mt-1">
                                    {callType === "video" ? "Video call" : "Voice call"}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Spacer for video call */}
                    {callType === "video" && <div className="flex-1" />}

                    {/* Bottom controls */}
                    <div className="px-6 pb-6 pt-3">
                        {/* Caller name overlay for video */}
                        {callType === "video" && (
                            <div className="flex items-center justify-between mb-4">
                                <div className="backdrop-blur-md bg-black/30 rounded-full px-3 py-1.5 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full overflow-hidden">
                                        <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-white text-sm font-medium">{conversation?.fullName}</span>
                                </div>
                            </div>
                        )}

                        {/* Control buttons */}
                        <div className="flex items-center justify-center gap-4">
                            {/* Speaker toggle */}
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={toggleSpeaker}
                                    className={`btn btn-circle border-0 w-12 h-12 min-h-0 backdrop-blur-md ${
                                        isSpeakerOff
                                            ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                                            : "bg-white/15 text-white hover:bg-white/25"
                                    }`}
                                    title={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
                                >
                                    {isSpeakerOff ? <FiVolumeX className="w-5 h-5" /> : <FiVolume2 className="w-5 h-5" />}
                                </button>
                                <span className="text-white/50 text-[10px]">Speaker</span>
                            </div>

                            {/* Mute mic */}
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={toggleMute}
                                    className={`btn btn-circle border-0 w-12 h-12 min-h-0 backdrop-blur-md ${
                                        isMuted
                                            ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                                            : "bg-white/15 text-white hover:bg-white/25"
                                    }`}
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? <FiMicOff className="w-5 h-5" /> : <FiMic className="w-5 h-5" />}
                                </button>
                                <span className="text-white/50 text-[10px]">{isMuted ? "Unmute" : "Mute"}</span>
                            </div>

                            {/* End call (large, red) */}
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={() => endCall()}
                                    className="btn btn-circle border-0 w-16 h-16 min-h-0 bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/40"
                                    title="End call"
                                >
                                    <FiPhone className="w-6 h-6 rotate-[135deg]" />
                                </button>
                                <span className="text-white/50 text-[10px]">End</span>
                            </div>

                            {/* Toggle video */}
                            {callType === "video" && (
                                <div className="flex flex-col items-center gap-1">
                                    <button
                                        onClick={toggleVideo}
                                        className={`btn btn-circle border-0 w-12 h-12 min-h-0 backdrop-blur-md ${
                                            isVideoOff
                                                ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                                                : "bg-white/15 text-white hover:bg-white/25"
                                        }`}
                                        title={isVideoOff ? "Turn on video" : "Turn off video"}
                                    >
                                        {isVideoOff ? <FiVideoOff className="w-5 h-5" /> : <FiVideo className="w-5 h-5" />}
                                    </button>
                                    <span className="text-white/50 text-[10px]">{isVideoOff ? "Show video" : "Hide video"}</span>
                                </div>
                            )}

                            {/* Placeholder (to balance UI for voice calls) */}
                            {callType !== "video" && (
                                <div className="flex flex-col items-center gap-1">
                                    <button
                                        disabled
                                        className="btn btn-circle border-0 w-12 h-12 min-h-0 bg-white/5 text-white/20 cursor-default"
                                    >
                                        <FiVideo className="w-5 h-5" />
                                    </button>
                                    <span className="text-white/20 text-[10px]">Video</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CallInterface;