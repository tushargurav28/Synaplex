import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

export const getUsersForSidebar = async (req,res)=>{
    try{
        const loggedInUserId = req.user._id;

        const filteredUsers = await User.find({_id:{$ne: loggedInUserId }}).lean();

        // Get conversations for the logged in user
        const conversations = await Conversation.find({
            participants: loggedInUserId,
            isGroup: false
        }).lean();

        // Map users to their last message
        const usersWithLastMessage = await Promise.all(filteredUsers.map(async (user) => {
            // Find conversation between logged in user and this user
            const conversation = conversations.find(c => 
                c.participants.map(p => p.toString()).includes(user._id.toString())
            );

            let lastMessageStr = null;
            let lastMessageTime = null;

            if (conversation) {
                const lastMessage = await Message.findOne({ conversationId: conversation._id })
                    .sort({ createdAt: -1 })
                    .lean();
                
                if (lastMessage) {
                    lastMessageStr = lastMessage.message || (lastMessage.attachments?.length > 0 ? "Attachment" : null);
                    lastMessageTime = lastMessage.createdAt;
                }
            }

            return {
                ...user,
                lastMessage: lastMessageStr,
                lastMessageTime: lastMessageTime
            };
        }));

        // Sort by last message time (recent first)
        usersWithLastMessage.sort((a, b) => {
            if (!a.lastMessageTime) return 1;
            if (!b.lastMessageTime) return -1;
            return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        });

        res.status(200).json(usersWithLastMessage);

    }catch(error){
        console.error("Error in getUsersForSidebar : ",error.message)
        res.status(500).json({error:"Internal server Error"});
    }
}