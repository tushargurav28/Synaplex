import { useState } from "react";
import { loginUser, logoutUser, signupUser } from "../api/auth.api";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

export const useAuth = () => {
  const [loading, setLoading] = useState(false);
  const { setAuthUser, logout: storeLogout } = useAuthStore();

  const login = async (credentials) => {
    setLoading(true);
    try {
      const data = await loginUser(credentials);
      // Backend returns { success, user: { _id, username, ... } }
      setAuthUser(data.user);
      toast.success("Logged in successfully!");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to log in");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (userData) => {
    setLoading(true);
    try {
      const data = await signupUser(userData);
      // Backend returns { success, user: { _id, username, ... } }
      setAuthUser(data.user);
      toast.success("Account created successfully!");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to sign up");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutUser();
      storeLogout();
      toast.success("Logged out successfully!");
    } catch (error) {
      // Even if API call fails, still logout locally
      storeLogout();
      toast.error(error.response?.data?.error || "Failed to log out");
    } finally {
      setLoading(false);
    }
  };

  return { login, signup, logout, loading };
};
