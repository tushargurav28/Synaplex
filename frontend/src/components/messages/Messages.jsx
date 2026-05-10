import { useEffect, useRef } from "react";
import useGetMessages from "../../hooks/useGetMessages";
import MessageSkeleton from "../skeletons/MessageSkeleton";
import Message from "./Message";
import useListenMessages from "../../hooks/useListenMessages";

const Messages = () => {
	const { messages, loading } = useGetMessages();
	useListenMessages();
	const lastMessageRef = useRef();

	useEffect(() => {
		setTimeout(() => {
			lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
		}, 100);
	}, [messages]);

	const groupMessagesByDate = (messages) => {
		const groups = {};
		messages.forEach((msg) => {
			const date = new Date(msg.createdAt).toLocaleDateString(undefined, {
				weekday: "long",
				month: "short",
				day: "numeric",
			});
			if (!groups[date]) groups[date] = [];
			groups[date].push(msg);
		});
		return groups;
	};

	const groupedMessages = groupMessagesByDate(messages);

	return (
		<div className='px-4 flex-1 overflow-auto bg-base-100'>
			{!loading && messages.length > 0 && Object.keys(groupedMessages).map((date) => (
				<div key={date}>
					<div className="flex justify-center my-4">
						<span className="bg-base-200 text-base-content/60 text-xs px-3 py-1 rounded-full shadow-sm">
							{date}
						</span>
					</div>
					{groupedMessages[date].map((message, index) => {
						const isLast = index === groupedMessages[date].length - 1 && date === Object.keys(groupedMessages)[Object.keys(groupedMessages).length - 1];
						return (
							<div key={message._id} ref={isLast ? lastMessageRef : null}>
								<Message message={message} />
							</div>
						);
					})}
				</div>
			))}

			{loading && [...Array(3)].map((_, idx) => <MessageSkeleton key={idx} />)}
			{!loading && messages.length === 0 && (
				<div className="flex flex-col items-center justify-center h-full text-base-content/50">
					<p className="text-center text-lg font-medium">No messages yet</p>
					<p className='text-center text-sm'>Send a message to start the conversation</p>
				</div>
			)}
		</div>
	);
};
export default Messages;