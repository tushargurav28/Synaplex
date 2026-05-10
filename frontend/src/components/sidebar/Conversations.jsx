import useGetConversations from "../../hooks/useGetConversations";
import Conversation from "./Conversation";
import { useChatStore } from "../../store/useChatStore";
import { useEffect, useMemo } from "react";

const Conversations = () => {
	const { loading, conversations, refetch } = useGetConversations();
	const { searchTerm } = useChatStore();

	// Listen for external refetch requests (e.g., after creating a group)
	useEffect(() => {
		const handler = () => refetch();
		window.addEventListener('refetch-conversations', handler);
		return () => window.removeEventListener('refetch-conversations', handler);
	}, [refetch]);

	const filteredConversations = useMemo(() => {
		if (!searchTerm) return conversations;
		const searchLower = searchTerm.toLowerCase();
		return conversations.filter((c) =>
			(c.fullName && c.fullName.toLowerCase().includes(searchLower)) ||
			(c.username && c.username.toLowerCase().includes(searchLower)) ||
			(c.groupName && c.groupName.toLowerCase().includes(searchLower))
		);
	}, [conversations, searchTerm]);

	return (
		<div className='py-2 flex flex-col overflow-auto'>
			{filteredConversations.map((conversation, idx) => (
				<Conversation
					key={conversation._id}
					conversation={conversation}
					lastIdx={idx === filteredConversations.length - 1}
				/>
			))}

			{filteredConversations.length === 0 && !loading && searchTerm && (
				<div className="text-center text-base-content/60 py-4">
					No results found for "{searchTerm}"
				</div>
			)}

			{filteredConversations.length === 0 && !loading && !searchTerm && (
				<div className="text-center text-base-content/40 py-8 text-sm">
					No conversations yet.<br/>Start a chat or create a group!
				</div>
			)}

			{loading && <span className='loading loading-spinner mx-auto mt-4'></span>}
		</div>
	);
};
export default Conversations;
