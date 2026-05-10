import { useState } from "react";
import { IoSearchSharp } from "react-icons/io5";
import { useChatStore } from "../../store/useChatStore";
import useGetConversations from "../../hooks/useGetConversations";
import toast from "react-hot-toast";

const SearchInput = () => {
	const { searchTerm, setSearchTerm } = useChatStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		// Dynamic filtering handles the search now
	};

	return (
		<form onSubmit={handleSubmit} className='flex items-center gap-2'>
			<input
				type='text'
				placeholder='Search…'
				className='input input-bordered rounded-full w-full'
				value={searchTerm}
				onChange={(e) => setSearchTerm(e.target.value)}
			/>
			<button type='submit' className='btn btn-circle bg-primary text-primary-content hover:bg-primary/80'>
				<IoSearchSharp className='w-6 h-6 outline-none' />
			</button>
		</form>
	);
};
export default SearchInput;
