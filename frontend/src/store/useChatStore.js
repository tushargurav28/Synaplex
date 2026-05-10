import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";

// Helper: extract the raw userId string from either a plain string or populated object
const extractId = (field) => {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (typeof field === "object" && field._id) return field._id.toString();
  return field.toString();
};

export const useChatStore = create((set, get) => ({
  messages: [],
  selectedUser: null,
  isMessagesLoading: false,
  unreadCounts: {},
  aiMessages: [],
  searchTerm: "",

  setMessages: (messages) => set({ messages }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),
  setIsMessagesLoading: (isLoading) => set({ isMessagesLoading: isLoading }),
  setUnreadCount: (userId, count) => set((state) => ({ unreadCounts: { ...state.unreadCounts, [userId]: count } })),
  setAiMessages: (aiMessages) => set({ aiMessages }),
  addAiMessage: (msg) => set((state) => ({ aiMessages: [...state.aiMessages, msg] })),
  setSearchTerm: (term) => set({ searchTerm: term }),
  
  addMessage: (message) => {
    const { selectedUser, messages } = get();
    const msgSenderId = extractId(message.senderId);
    const msgReceiverId = extractId(message.reciverId) || extractId(message.receiverId);
    const msgConvId = extractId(message.conversationId);

    // Determine if this message belongs to the currently open conversation
    let belongsToActiveConv = false;
    if (selectedUser) {
      if (selectedUser.isGroup) {
        // Group chat: match by conversationId
        belongsToActiveConv = msgConvId === selectedUser._id;
      } else {
        // Private chat: match by senderId or receiverId
        belongsToActiveConv =
          msgSenderId === selectedUser._id || msgReceiverId === selectedUser._id;
      }
    }

    if (belongsToActiveConv) {
      // Prevent duplicates
      if (!messages.find((m) => m._id === message._id)) {
        set({ messages: [...messages, message] });
      }
    } else {
      // Increase unread count if not currently selected
      if (msgSenderId) {
        const currentCount = get().unreadCounts[msgSenderId] || 0;
        get().setUnreadCount(msgSenderId, currentCount + 1);
      }
    }
  },

  updateMessageStatus: (tempId, sentMessage) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id === tempId ? { ...sentMessage } : msg
      ),
    }));
  },

  // Edit a message in the local store
  editMessageInStore: (messageId, newText, editedAt) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id === messageId
          ? { ...msg, message: newText, edited: true, updatedAt: editedAt || new Date().toISOString() }
          : msg
      ),
    }));
  },

  // Mark a message as deleted in the local store (soft delete)
  markMessageDeleted: (messageId) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id === messageId
          ? { ...msg, deleted: true, message: "" }
          : msg
      ),
    }));
  },

  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg._id !== messageId),
    }));
  },

  subscribeToMessages: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      get().addMessage(newMessage);
    });

    socket.on("userStatusChanged", ({ userId, status, lastSeen }) => {
      const { selectedUser } = get();
      if (selectedUser && selectedUser._id === userId) {
        set({
          selectedUser: {
            ...selectedUser,
            lastSeen: status === "offline" ? lastSeen : selectedUser.lastSeen
          }
        });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.off("userStatusChanged");
  },
}));
