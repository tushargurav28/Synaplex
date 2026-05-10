import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useSocketStore } from "../store/useSocketStore";

export const useSocket = () => {
  const { authUser } = useAuthStore();
  const { connectSocket, disconnectSocket, socket, onlineUsers } = useSocketStore();

  useEffect(() => {
    if (authUser) {
      connectSocket(authUser._id);
    } else {
      disconnectSocket();
    }

    return () => {
      // Don't necessarily disconnect on unmount, but let it be handled by auth state
    };
  }, [authUser, connectSocket, disconnectSocket]);

  return { socket, onlineUsers };
};
