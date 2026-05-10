import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // IMPORTANT: To send httpOnly cookies for JWT
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Auto logout on 401
      useAuthStore.getState().logout();
      toast.error("Session expired. Please log in again.", { id: "sessionExpired" });
    }
    return Promise.reject(error);
  }
);

export default api;
