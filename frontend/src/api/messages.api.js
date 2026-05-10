import api from "./axios";

export const getMessages = async (id, isGroup = false) => {
  const url = isGroup ? `/messages/conversation/${id}` : `/messages/${id}`;
  const response = await api.get(url);
  return response.data;
};

export const sendMessage = async (id, messageData, isGroup = false) => {
  if (isGroup) {
    messageData.conversationId = id;
    const response = await api.post(`/messages/send`, messageData);
    return response.data;
  } else {
    const response = await api.post(`/messages/send/${id}`, messageData);
    return response.data;
  }
};

export const editMessage = async (messageId, newText) => {
  const response = await api.patch(`/messages/${messageId}`, { message: newText });
  return response.data;
};

export const deleteMessage = async (messageId) => {
  const response = await api.delete(`/messages/${messageId}`);
  return response.data;
};
