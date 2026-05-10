import { useEffect } from "react";
import { useSocketStore } from "../store/useSocketStore";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

import notificationSound from "../assets/sounds/notification.mp3";

const useListenMessages = () => {
  const { socket } = useSocketStore();
  const { addMessage, editMessageInStore, markMessageDeleted } = useChatStore();

  useEffect(() => {
    if (!socket) return;

    // Listen for new messages
    socket.on("newMessage", (newMessage) => {
      newMessage.shouldShake = true;
      
      const authUser = useAuthStore.getState().authUser;
      const senderId = typeof newMessage.senderId === "object" ? newMessage.senderId?._id : newMessage.senderId;
      const isFromMe = senderId === authUser?._id;

      if (!isFromMe) {
        const sound = new Audio(notificationSound);
        sound.play().catch((e) => console.log("Audio play prevented:", e));
      }
      
      // Zustand addMessage will check for duplicates and correct conversation
      addMessage(newMessage);
    });

    // Listen for edited messages
    socket.on("messageEdited", ({ messageId, newMessage, editedAt }) => {
      editMessageInStore(messageId, newMessage, editedAt);
    });

    // Listen for deleted messages
    socket.on("messageDeleted", ({ messageId }) => {
      markMessageDeleted(messageId);
    });

    return () => {
      socket.off("newMessage");
      socket.off("messageEdited");
      socket.off("messageDeleted");
    };
  }, [socket, addMessage, editMessageInStore, markMessageDeleted]);
};
export default useListenMessages;
