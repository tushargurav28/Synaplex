import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { getMessages } from "../api/messages.api";

const useGetMessages = () => {
  const [loading, setLoading] = useState(false);
  const { messages, setMessages, selectedUser } = useChatStore();

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const data = await getMessages(selectedUser._id, selectedUser.isGroup);
        // Backend legacy GET /messages/:id returns { messages: [...], page, total, hasMore }
        // OR plain array [] when no conversation exists
        if (Array.isArray(data)) {
          setMessages(data);
        } else if (data?.messages) {
          setMessages(data.messages);
        } else {
          setMessages([]);
        }
      } catch (error) {
        toast.error(error.response?.data?.error || "Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    if (selectedUser?._id) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [selectedUser?._id, setMessages]);

  return { messages, loading };
};
export default useGetMessages;
