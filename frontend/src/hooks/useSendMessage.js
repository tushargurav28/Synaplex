import { useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";
import { sendMessage as apiSendMessage } from "../api/messages.api";
import api from "../api/axios";

const useSendMessage = () => {
  const [loading, setLoading] = useState(false);
  const { selectedUser, addMessage, updateMessageStatus, removeMessage } = useChatStore();
  const { authUser } = useAuthStore();

  const sendMessage = async (message, meta = {}) => {
    if (!selectedUser?._id) return;

    const { type = "text", codeLanguage = "plaintext" } = meta;

    // Optimistic UI
    const tempId = Date.now().toString();
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      reciverId: selectedUser._id,
      message,
      type,
      codeLanguage,
      createdAt: new Date().toISOString(),
      status: "sending",
    };

    addMessage(optimisticMessage);
    setLoading(true);

    try {
      const payload = { message, type, codeLanguage };
      const data = await apiSendMessage(selectedUser._id, payload, selectedUser.isGroup);
      updateMessageStatus(tempId, { ...data, status: "sent" });
    } catch (error) {
      removeMessage(tempId);

      if (error.response?.data?.requiresInvitation) {
          try {
              await api.post("/invitations", {
                  receiverId: selectedUser._id,
                  type: "direct"
              });
              toast.success("This user is private. An invitation has been sent!");
          } catch (invError) {
              if (invError.response?.data?.error === "Invitation already sent") {
                  toast.success("Invitation already sent! Waiting for them to accept.");
              } else {
                  toast.error("Could not send invitation.");
              }
          }
      } else {
          toast.error(error.response?.data?.error || "Failed to send message");
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMediaMessage = async (file, caption = "") => {
    if (!selectedUser?._id) return;

    setLoading(true);
    try {
      // Upload file first
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      const uploadData = uploadRes.data;

      // Send message with attachment
      const payload = {
        message: caption,
        attachments: [
          {
            url: uploadData.file.url,
            fileName: uploadData.file.fileName,
            mimeType: uploadData.file.mimeType,
            size: uploadData.file.size,
            publicId: uploadData.file.publicId,
          },
        ],
        type: file.type.startsWith("image/") ? "image" : "file",
      };

      const data = await apiSendMessage(selectedUser._id, payload, selectedUser.isGroup);
      addMessage(data);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to send media");
    } finally {
      setLoading(false);
    }
  };

  return { sendMessage, sendMediaMessage, loading };
};

export default useSendMessage;