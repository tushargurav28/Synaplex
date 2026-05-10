import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import Home from "./pages/home/Home";
import Login from "./pages/login/Login";
import SignUp from "./pages/signup/SignUp";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store/useAuthStore";
import { useSocketStore } from "./store/useSocketStore";
import { useSocket } from "./hooks/useSocket";
import CallInterface, { IncomingCallBanner } from "./components/chat/CallInterface";

function App() {
    const { authUser } = useAuthStore();
    const { incomingCall, setIncomingCall } = useSocketStore();
    const [answeringCall, setAnsweringCall] = useState(null); // { type, callerName, conversationId }
    useSocket();

    const handleAcceptCall = () => {
        if (!incomingCall) return;
        setAnsweringCall({
            type: incomingCall.type || "voice",
            callerName: incomingCall.callerName,
            conversationId: incomingCall.conversationId,
            _id: incomingCall.conversationId,
            fullName: incomingCall.callerName
        });
    };

    const handleRejectCall = () => {
        setIncomingCall(null);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-base-300 to-base-200 flex items-center justify-center">
            <Routes>
                <Route path='/' element={authUser ? <Home /> : <Navigate to={"/login"} />} />
                <Route path='/login' element={authUser ? <Navigate to='/' /> : <Login />} />
                <Route path='/signup' element={authUser ? <Navigate to='/' /> : <SignUp />} />
            </Routes>

            {/* Global incoming call banner */}
            {incomingCall && !answeringCall && (
                <IncomingCallBanner
                    incomingCall={incomingCall}
                    onAccept={handleAcceptCall}
                    onReject={handleRejectCall}
                />
            )}

            {/* Full call UI when answering */}
            {answeringCall && (
                <CallInterface
                    conversation={answeringCall}
                    callType={answeringCall.type}
                    isAnswering={true}
                    onClose={() => { setAnsweringCall(null); setIncomingCall(null); }}
                />
            )}

            <Toaster 
                position="top-right"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: "var(--b1)",
                        color: "var(--bc)",
                        border: "1px solid var(--b2)"
                    }
                }}
            />
        </div>
    );
}

export default App;