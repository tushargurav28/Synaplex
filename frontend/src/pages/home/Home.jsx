import MessageContainer from "../../components/messages/MessageContainer";
import Sidebar from "../../components/sidebar/Sidebar";
import { useChatStore } from "../../store/useChatStore";

const Home = () => {
    const { selectedUser } = useChatStore();

	return (
		<div className='flex h-screen w-full overflow-hidden bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
			<div className={`w-full md:w-80 flex-shrink-0 ${selectedUser ? "hidden md:block" : "block"}`}>
				<Sidebar />
			</div>
			<div className={`flex-1 flex ${!selectedUser ? "hidden md:flex" : "flex"}`}>
				<MessageContainer />
			</div>
		</div>
	);
};
export default Home;
