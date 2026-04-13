import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

export const CALL_STATES = {
  IDLE: "idle",
  CALLING: "calling",
  RINGING: "ringing",
  CONNECTING: "connecting",
  CONNECTED: "connected",
};

const parseCsv = (value = "") =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

const buildIceServers = () => {
  const stunUrls = parseCsv(import.meta.env.VITE_STUN_URLS).length
    ? parseCsv(import.meta.env.VITE_STUN_URLS)
    : DEFAULT_STUN_URLS;

  const turnUrls = parseCsv(import.meta.env.VITE_TURN_URLS);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  const iceServers = [{ urls: stunUrls }];

  if (turnUrls.length) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return iceServers;
};

const RTC_CONFIGURATION = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 4,
};

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch (error) {
      console.warn("Unable to stop media track", error);
    }
  });
};

const normalizeGetUserMediaError = (error) => {
  const errorName = error?.name || "";
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    const wrapped = new Error("Camera and microphone permission denied. Please allow access to start a video call.");
    wrapped.name = errorName;
    return wrapped;
  }
  if (errorName === "NotFoundError") {
    const wrapped = new Error("No camera or microphone detected on this device.");
    wrapped.name = errorName;
    return wrapped;
  }
  if (errorName === "NotReadableError") {
    const wrapped = new Error("Camera appears to be in use by another application.");
    wrapped.name = errorName;
    return wrapped;
  }
  return error;
};

const requestUserMedia = async (constraints) => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera or microphone not supported in this browser");
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    throw normalizeGetUserMediaError(error);
  }
};

const acquireLocalCallStream = async () => {
  try {
    const stream = await requestUserMedia({ video: true, audio: true });
    return {
      stream,
      hasVideoTrack: Boolean(stream.getVideoTracks?.().length),
      fallbackNotice: null,
    };
  } catch (error) {
    if (error?.name === "NotReadableError") {
      try {
        const audioOnlyStream = await requestUserMedia({ video: false, audio: true });
        return {
          stream: audioOnlyStream,
          hasVideoTrack: false,
          fallbackNotice: "Camera is currently in use by another application. Joined the call with microphone only.",
        };
      } catch {
        throw error;
      }
    }
    throw error;
  }
};

const buildSessionDescription = (description) => {
  if (!description) return null;
  if (typeof window !== "undefined" && window.RTCSessionDescription) {
    return new RTCSessionDescription(description);
  }
  return description;
};

const buildIceCandidate = (candidate) => {
  if (!candidate) return null;
  if (typeof window !== "undefined" && window.RTCIceCandidate) {
    return new RTCIceCandidate(candidate);
  }
  return candidate;
};

const isUserOnline = (userId) => {
  if (!userId) return false;
  const { onlineUsers } = useAuthStore.getState();
  return onlineUsers?.includes(userId.toString?.() || userId) ?? false;
};

export const useCallStore = create((set, get) => ({
  callState: CALL_STATES.IDLE,
  direction: null,
  callUser: null,
  incomingOffer: null,
  pendingIceCandidates: [],
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  connectTimeoutId: null,
  isMuted: false,
  isCameraDisabled: false,
  socketBindings: null,
  activeCallId: null,

  bindSocketEvents: (socket) => {
    if (!socket) return;
    const { socketBindings } = get();
    if (socketBindings?.socket === socket) return;

    if (socketBindings?.socket && socketBindings.socket !== socket) {
      socketBindings.entries.forEach(([event, handler]) => {
        socketBindings.socket.off(event, handler);
      });
    }

    const handleIncomingCall = ({ from, offer, callId }) => {
      const { callState } = get();
      if (callState !== CALL_STATES.IDLE) {
        socket.emit("call:busy", { targetUserId: from?._id, callId });
        return;
      }
      set({
        callState: CALL_STATES.RINGING,
        direction: "incoming",
        callUser: from,
        incomingOffer: offer,
        pendingIceCandidates: [],
        remoteStream: null,
        activeCallId: callId || null,
      });
    };

    const handleAnswered = async ({ answer, callId }) => {
      const { peerConnection, activeCallId } = get();
      if (!peerConnection || !answer) return;
      if (callId && activeCallId && callId !== activeCallId) return;
      try {
        await peerConnection.setRemoteDescription(buildSessionDescription(answer));
        await get().flushPendingIceCandidates();
        set({ callState: CALL_STATES.CONNECTING });
      } catch (error) {
        console.error("Unable to set remote description", error);
        get().handleRemoteHangup("failed");
      }
    };

    const handleIceCandidate = async ({ candidate, callId }) => {
      const { peerConnection, activeCallId } = get();
      if (!candidate) return;
      if (callId && activeCallId && callId !== activeCallId) return;

      if (!peerConnection || !peerConnection.remoteDescription) {
        set((state) => ({
          pendingIceCandidates: [...state.pendingIceCandidates, candidate],
        }));
        return;
      }

      try {
        await peerConnection.addIceCandidate(buildIceCandidate(candidate));
      } catch (error) {
        console.error("Unable to add ICE candidate", error);
        set((state) => ({
          pendingIceCandidates: [...state.pendingIceCandidates, candidate],
        }));
      }
    };

    const handleCallEnded = ({ reason, callId }) => {
      const { activeCallId } = get();
      if (callId && activeCallId && callId !== activeCallId) {
        return;
      }
      get().handleRemoteHangup(reason || "hangup");
    };

    const handleBusy = ({ callId }) => {
      const { activeCallId } = get();
      if (callId && activeCallId && callId !== activeCallId) return;
      toast.error("User is on another call");
      get().resetCallState();
    };

    const handleUnavailable = ({ callId }) => {
      const { activeCallId } = get();
      if (callId && activeCallId && callId !== activeCallId) return;
      toast.error("User is unavailable for a video call");
      get().resetCallState();
    };

    const entries = [
      ["call:incoming", handleIncomingCall],
      ["call:answered", handleAnswered],
      ["call:ice-candidate", handleIceCandidate],
      ["call:ended", handleCallEnded],
      ["call:busy", handleBusy],
      ["call:unavailable", handleUnavailable],
    ];

    entries.forEach(([event, handler]) => socket.on(event, handler));

    set({ socketBindings: { socket, entries } });
  },

  unbindSocketEvents: (socket) => {
    const { socketBindings } = get();
    const activeSocket = socket || socketBindings?.socket;
    if (!socketBindings || !activeSocket) return;
    socketBindings.entries.forEach(([event, handler]) => activeSocket.off(event, handler));
    set({ socketBindings: null });
  },

  ensureSocketConnected: () => {
    const { authUser, socket, connectSocket } = useAuthStore.getState();
    if (!authUser) return null;
    if (socket?.connected) return socket;
    connectSocket?.();
    return useAuthStore.getState().socket;
  },

  startConnectTimeout: () => {
    const { connectTimeoutId } = get();
    if (connectTimeoutId) {
      clearTimeout(connectTimeoutId);
    }

    const timeoutId = setTimeout(() => {
      const { callState } = get();
      if (callState === CALL_STATES.CONNECTED || callState === CALL_STATES.IDLE) {
        return;
      }
      toast.error("Unable to establish media path. Configure TURN server for cross-network calls.");
    }, 12000);

    set({ connectTimeoutId: timeoutId });
  },

  clearConnectTimeout: () => {
    const { connectTimeoutId } = get();
    if (connectTimeoutId) {
      clearTimeout(connectTimeoutId);
      set({ connectTimeoutId: null });
    }
  },

  startVideoCall: async (targetUser) => {
    if (!targetUser?._id) {
      toast.error("Select a contact first");
      return;
    }
    if (targetUser.isGroup) {
      toast.error("Video calls are only available for 1:1 chats");
      return;
    }
    if (get().callState !== CALL_STATES.IDLE) {
      toast.error("You are already in a call");
      return;
    }

    const authUser = useAuthStore.getState().authUser;
    if (authUser && authUser._id === (targetUser._id?.toString?.() || targetUser._id)) {
      toast.error("You cannot start a call with yourself");
      return;
    }

    if (!isUserOnline(targetUser._id)) {
      toast.error("This user appears to be offline right now");
      return;
    }

    let socket = useAuthStore.getState().socket;
    if (!socket) {
      socket = get().ensureSocketConnected();
    }
    if (!socket) {
      toast.error("Realtime connection unavailable");
      return;
    }

    try {
      const { stream: localStream, hasVideoTrack, fallbackNotice } = await acquireLocalCallStream();
      const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      get().attachPeerListeners(peerConnection);

      set({
        callState: CALL_STATES.CALLING,
        direction: "outgoing",
        callUser: targetUser,
        pendingIceCandidates: [],
        localStream,
        remoteStream: null,
        peerConnection,
        isMuted: false,
        isCameraDisabled: !hasVideoTrack,
      });

      if (fallbackNotice) {
        toast(fallbackNotice);
      }

      get().startConnectTimeout();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const { authUser } = useAuthStore.getState();
      socket.emit(
        "call:offer",
        {
          targetUserId: targetUser._id,
          offer,
          metadata: {
            fullName: authUser?.fullName,
            profilePic: authUser?.profilePic,
            callType: "video",
            conversationType: "direct",
          },
        },
        (response) => {
          if (response?.error) {
            toast.error(response.error || "Unable to start video call");
            get().resetCallState();
            return;
          }
          if (response?.callId) {
            set({ activeCallId: response.callId });
          }
        }
      );
    } catch (error) {
      console.error("Unable to start call", error);
      toast.error(error?.message || "Unable to start video call");
      get().resetCallState();
    }
  },

  acceptIncomingCall: async () => {
    const { callUser, incomingOffer, activeCallId } = get();
    if (!callUser || !incomingOffer || !activeCallId) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) {
      toast.error("Realtime connection unavailable");
      return;
    }

    try {
      const { stream: localStream, hasVideoTrack, fallbackNotice } = await acquireLocalCallStream();
      const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      get().attachPeerListeners(peerConnection);

      await peerConnection.setRemoteDescription(buildSessionDescription(incomingOffer));
      await get().flushPendingIceCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("call:answer", {
        targetUserId: callUser._id,
        answer,
        callId: activeCallId,
      });

      set({
        callState: CALL_STATES.CONNECTING,
        direction: "incoming",
        localStream,
        peerConnection,
        incomingOffer: null,
        pendingIceCandidates: [],
        isMuted: false,
        isCameraDisabled: !hasVideoTrack,
      });

      if (fallbackNotice) {
        toast(fallbackNotice);
      }

      get().startConnectTimeout();
    } catch (error) {
      console.error("Unable to accept call", error);
      toast.error(error?.message || "Unable to accept video call");
      get().resetCallState();
    }
  },

  declineIncomingCall: () => {
    const { callUser, direction, activeCallId } = get();
    const socket = useAuthStore.getState().socket;
    if (socket && callUser?._id) {
      const payload = {
        targetUserId: callUser._id,
        reason: direction === "incoming" ? "declined" : "hangup",
      };
      if (activeCallId) {
        payload.callId = activeCallId;
      }
      socket.emit("call:hangup", payload);
    }
    get().resetCallState();
  },

  endCall: (reason = "hangup") => {
    const { callUser, activeCallId } = get();
    const socket = useAuthStore.getState().socket;
    if (socket && callUser?._id) {
      const payload = { targetUserId: callUser._id, reason };
      if (activeCallId) {
        payload.callId = activeCallId;
      }
      socket.emit("call:hangup", payload);
    }
    get().resetCallState();
  },

  toggleMute: () => {
    const { localStream, isMuted } = get();
    const next = !isMuted;
    localStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = !next;
    });
    set({ isMuted: next });
  },

  toggleCamera: () => {
    const { localStream, isCameraDisabled } = get();
    if (!localStream) {
      return;
    }

    const videoTracks = localStream.getVideoTracks?.() || [];
    if (!videoTracks.length) {
      toast.error("Camera unavailable. End the call and free up your camera before trying again.");
      return;
    }

    const next = !isCameraDisabled;
    videoTracks.forEach((track) => {
      track.enabled = !next;
    });
    set({ isCameraDisabled: next });
  },

  attachPeerListeners: (peerConnection) => {
    if (!peerConnection) return;

    peerConnection.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) {
        get().clearConnectTimeout();
        set({ remoteStream: stream, callState: CALL_STATES.CONNECTED });
        return;
      }
      if (event.track) {
        const current = get().remoteStream || new MediaStream();
        current.addTrack(event.track);
        get().clearConnectTimeout();
        set({ remoteStream: current, callState: CALL_STATES.CONNECTED });
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      const { callUser } = get();
      const socket = useAuthStore.getState().socket;
      if (socket && callUser?._id) {
        socket.emit("call:ice-candidate", {
          targetUserId: callUser._id,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        get().clearConnectTimeout();
      }
      if (state === "failed" || state === "disconnected") {
        get().handleRemoteHangup("connection-lost");
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (state === "connected" || state === "completed") {
        get().clearConnectTimeout();
      }
      if (state === "failed") {
        toast.error("ICE failed. TURN relay may be required on this network.");
      }
    };

    peerConnection.onicecandidateerror = (event) => {
      console.warn("ICE candidate error", {
        url: event?.url,
        errorCode: event?.errorCode,
        errorText: event?.errorText,
      });
    };
  },

  flushPendingIceCandidates: async () => {
    const { peerConnection, pendingIceCandidates } = get();
    if (!peerConnection || !peerConnection.remoteDescription || !pendingIceCandidates.length) {
      return;
    }

    const remaining = [];
    for (const candidate of pendingIceCandidates) {
      try {
        await peerConnection.addIceCandidate(buildIceCandidate(candidate));
      } catch (error) {
        console.error("Unable to flush ICE candidate", error);
        remaining.push(candidate);
      }
    }

    set({ pendingIceCandidates: remaining });
  },

  handleRemoteHangup: (reason = "hangup") => {
    if (reason === "declined") {
      toast.error("Call declined");
    } else if (reason === "connection-lost") {
      toast.error("Connection lost");
    } else if (reason === "unanswered") {
      toast("Call unanswered");
    } else if (reason === "hangup") {
      toast("Call ended");
    }
    get().resetCallState();
  },

  resetCallState: (overrides = {}) => {
    const { peerConnection, localStream, remoteStream } = get();
    get().clearConnectTimeout();
    if (peerConnection) {
      try {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidateerror = null;
        peerConnection.close();
      } catch (error) {
        console.warn("Unable to close peer connection", error);
      }
    }
    stopStreamTracks(localStream);
    stopStreamTracks(remoteStream);
    set({
      callState: CALL_STATES.IDLE,
      direction: null,
      callUser: null,
      incomingOffer: null,
      pendingIceCandidates: [],
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      connectTimeoutId: null,
      isMuted: false,
      isCameraDisabled: false,
      activeCallId: null,
      ...overrides,
    });
  },
}));
