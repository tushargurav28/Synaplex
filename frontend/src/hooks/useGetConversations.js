import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../api/axios";

const useGetConversations = () => {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch DM users, group conversations, and personal agents in parallel
      const [usersRes, groupsRes, agentsRes] = await Promise.all([
        api.get("/users"),
        api.get("/conversations"),
        api.get("/agents/my").catch(() => ({ data: { agents: [] } }))
      ]);

      const users = usersRes.data || [];
      const allConversations = groupsRes.data || [];
      const personalAgents = agentsRes.data?.agents || [];

      // Filter to only group conversations
      const groups = allConversations
        .filter(c => c.isGroup)
        .map(g => ({
          ...g,
          // Normalize fields so the Conversation component can render them uniformly
          fullName: g.groupName,
          profilePic: g.groupPhoto || null,
          lastMessage: g.lastMessage?.message || null,
          lastMessageTime: g.lastMessage?.createdAt || g.updatedAt,
          isGroup: true,
        }));

      // Normalize personal agents
      const normalizedAgents = personalAgents.map(a => ({
          ...a,
          fullName: a.name,
          profilePic: null, // Will use dicebear in Conversation.jsx based on triggerName
          lastMessage: a.description || "AI Agent",
          lastMessageTime: a.updatedAt,
          isPersonalAgent: true,
          isGroup: false
      }));

      // Merge: groups first by recency, then DM users, then personal agents
      const merged = [
        ...groups,
        ...users,
        ...normalizedAgents
      ];

      // Sort everything by lastMessageTime descending (most recent first)
      merged.sort((a, b) => {
        const ta = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(0);
        const tb = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(0);
        return tb - ta;
      });

      setConversations(merged);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();

    const handleRefetch = () => fetchConversations();
    window.addEventListener("refetch-conversations", handleRefetch);

    return () => {
      window.removeEventListener("refetch-conversations", handleRefetch);
    };
  }, [fetchConversations]);

  return { loading, conversations, refetch: fetchConversations };
};

export default useGetConversations;
