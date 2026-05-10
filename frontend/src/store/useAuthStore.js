import { create } from "zustand";

export const useAuthStore = create((set, get) => ({
  authUser: JSON.parse(localStorage.getItem("chat-user")) || null,
  setAuthUser: (user) => {
    if (user) {
      // If it's a partial update (no _id), merge with existing user
      const existing = get().authUser;
      const merged = (existing && !user._id) ? { ...existing, ...user } : user;
      localStorage.setItem("chat-user", JSON.stringify(merged));
      set({ authUser: merged });
    } else {
      localStorage.removeItem("chat-user");
      set({ authUser: null });
    }
  },
  logout: () => {
    localStorage.removeItem("chat-user");
    set({ authUser: null });
  },
}));
