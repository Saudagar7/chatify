import { create } from "zustand";
import { io } from "socket.io-client";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

const normalizeUrl = (url) => (url ? url.replace(/\/$/, "") : "");

const resolveSocketOrigin = () => {
  const envUrl = normalizeUrl(import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL);
  if (envUrl) return envUrl;
  const axiosBase = normalizeUrl(axiosInstance.defaults.baseURL);
  if (axiosBase?.startsWith("http")) {
    return axiosBase.replace(/\/api$/, "");
  }
  return window.location.origin;
};

const BASE_URL = resolveSocketOrigin();

export const useAuthStore = create((set, get) => ({
    authUser: null,
    isCheckingAuth: true,
    isSigningUp: false,
    isLoggingIn: false,
  isResettingPassword: false,
  socket: null,
  onlineUsers: [],

    checkAuth : async () => {
        set({ isCheckingAuth: true });
        try {
            const res = await axiosInstance.get('/auth/check');
            set({ authUser: res.data });
        } catch (error) {
            const status = error?.response?.status;
            if (status && status !== 401) {
                toast.error('Unable to verify session');
            }
            set({ authUser: null });
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
      set({ isSigningUp: true });
      try {
        const res = await axiosInstance.post('/auth/signup', data);
        set({ authUser: res.data});

        toast.success("Account created successfully!");

      } catch (error) {
        toast.error(error.response?.data?.message || "Unable to sign up");

      } finally {
        set({ isSigningUp: false });
      }
    },

      login: async (data) => {
      set({ isLoggingIn: true });
      try {
        const res = await axiosInstance.post('/auth/login', data);
        set({ authUser: res.data});

        toast.success("Logged in successfully");

      } catch (error) {
        toast.error(error.response?.data?.message || "Unable to log in");

      } finally {
        set({ isLoggingIn: false });
      }
    },

    resetPassword: async (data) => {
      set({ isResettingPassword: true });
      try {
        await axiosInstance.post('/auth/reset-password', data);
        toast.success("Password updated successfully");
        return true;
      } catch (error) {
        toast.error(error.response?.data?.message || "Unable to reset password");
        return false;
      } finally {
        set({ isResettingPassword: false });
      }
    },

    logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error("Error logging out");
      console.log("Logout error:", error);
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
      return true;
    } catch (error) {
      console.log("Error in update profile:", error);
      toast.error(error.response?.data?.message || "Unable to update profile");
      return false;
    }
  },

  updatePrivacySettings: async (preferences) => {
    try {
      const res = await axiosInstance.put("/auth/privacy", preferences);
      set({ authUser: res.data });
      toast.success("Privacy settings updated");
      return true;
    } catch (error) {
      console.log("Error updating privacy settings:", error);
      toast.error(error.response?.data?.message || "Unable to update privacy settings");
      return false;
    }
  },

  connectSocket: () => {
    const { authUser, socket } = get();
    if (!authUser) return;

    if (socket) {
      if (!socket.connected) socket.connect();
      return;
    }

    const nextSocket = io(BASE_URL, {
      withCredentials: true,
      autoConnect: false,
    });

    nextSocket.on("connect_error", (error) => {
      console.error("Socket connection failed:", error?.message || error);
    });

    nextSocket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    nextSocket.connect();

    set({ socket: nextSocket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.off("getOnlineUsers");
      socket.off("connect_error");
      socket.disconnect();
    }
    set({ socket: null, onlineUsers: [] });
  },


    
}));
