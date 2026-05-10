import { create } from "zustand";
import { io } from "socket.io-client";

export const useSocketStore = create((set, get) => ({
  socket: null,
  onlineUsers: [],
  incomingCall: null,

  setIncomingCall: (call) => set({ incomingCall: call }),
  
  emitCallEvent: (eventName, data) => {
    const { socket } = get();
    if (socket) {
      socket.emit(eventName, data);
    }
  },

  connectSocket: (userId) => {
    if (!userId) return;
    
    // Check if a socket connection already exists
    if (get().socket?.connected) return;

    // The backend uses localhost:5000 directly or Vite proxies it?
    // Using default Vite proxy configuration with relative URL won't work for socket.io by default unless configured.
    // Assuming backend runs at same origin or use /
    const socket = io(window.location.origin, {
      path: "/socket.io", // adjust if necessary, backend default is /socket.io
      query: {
        userId,
      },
    });

    socket.on("getOnlineUsers", (users) => {
      set({ onlineUsers: users });
    });

    socket.on("incomingCall", (data) => {
      // data: { from, conversationId, signalData, type, callerName, timestamp }
      set({ incomingCall: data });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, onlineUsers: [] });
    }
  },
}));
