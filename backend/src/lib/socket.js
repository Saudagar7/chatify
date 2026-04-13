import { Server } from "socket.io";
import http from "http";
import express from "express";
import mongoose from "mongoose";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import Message from "../models/message.js";
import User from "../models/User.js";
import { computeContactSetForUser, sanitizeUserForViewer } from "../lib/privacy.js";

const app = express();
const server = http.createServer(app);

const normalizeOrigin = (value = "") => value.trim().replace(/\/$/, "");
const parseAllowedOrigins = (raw = "") =>
  raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

const DEFAULT_ALLOWED_ORIGINS = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].map(normalizeOrigin)
);

const configuredOrigins = new Set(parseAllowedOrigins(ENV.CLIENT_URL));
const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
const devTunnelPattern = /^https?:\/\/[a-z0-9-]+-\d+\.inc1\.devtunnels\.ms$/i;

const socketCorsOrigin = (origin, callback) => {
  if (!origin) {
    return callback(null, true);
  }
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.has(normalizedOrigin) || devTunnelPattern.test(normalizedOrigin)) {
    return callback(null, true);
  }
  return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
};

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin,
    credentials: true,
  },
});

// apply authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// we will use this function to check if the user is online or not
export function getReceiverSocketId(userId) {
  const socketIds = userSocketMap[userId];
  if (!socketIds || !socketIds.size) return null;
  return [...socketIds][0];
}

// this is for storing online users
const userSocketMap = {}; // {userId:Set<socketId>}

const getOnlineUserIds = () =>
  Object.entries(userSocketMap)
    .filter(([, socketIds]) => socketIds && socketIds.size > 0)
    .map(([userId]) => userId);

const emitToUser = (userId, eventName, payload) => {
  const socketIds = userSocketMap[userId];
  if (!socketIds || !socketIds.size) return false;
  socketIds.forEach((socketId) => io.to(socketId).emit(eventName, payload));
  return true;
};

const activeCallSessions = new Map();

const stripPrivacySettings = (user) => {
  if (!user || typeof user !== "object") return user;
  const cloned = { ...user };
  if (Object.prototype.hasOwnProperty.call(cloned, "privacySettings")) {
    delete cloned.privacySettings;
  }
  return cloned;
};

const toStringId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  return String(value);
};

const determineCallStatus = (session, reason, triggeredBy) => {
  const normalizedReason = (reason || "").toLowerCase();
  const endedByCaller = toStringId(triggeredBy) === toStringId(session?.initiatorId);
  const wasConnected = Boolean(session?.connectedAt);

  if (!wasConnected) {
    switch (normalizedReason) {
      case "declined":
        return "declined";
      case "busy":
        return "busy";
      case "unavailable":
      case "unanswered":
        return "unanswered";
      case "hangup":
        return endedByCaller ? "cancelled" : "missed";
      default:
        return "missed";
    }
  }

  if (normalizedReason === "connection-lost" || normalizedReason === "failed") {
    return "failed";
  }

  if (normalizedReason === "declined") {
    return "declined";
  }

  return "completed";
};

const broadcastCallMessage = async (messageDoc, session) => {
  if (!messageDoc || !session) return;
  const serialized = typeof messageDoc.toObject === "function"
    ? messageDoc.toObject({ getters: true })
    : messageDoc;

  const senderSnapshot = typeof serialized.senderId === "object"
    ? stripPrivacySettings(serialized.senderId)
    : serialized.senderId;

  const callerPayload = {
    ...serialized,
    senderId: senderSnapshot,
  };

  emitToUser(toStringId(session.initiatorId), "newMessage", callerPayload);

  const receiverContacts = new Set([toStringId(session.initiatorId)].filter(Boolean));
  const sanitizedSenderForReceiver =
    typeof serialized.senderId === "object"
      ? stripPrivacySettings(
          sanitizeUserForViewer(serialized.senderId, session.targetUserId, receiverContacts)
        )
      : serialized.senderId;

  const receiverPayload = {
    ...serialized,
    senderId: sanitizedSenderForReceiver,
  };

  emitToUser(toStringId(session.targetUserId), "newMessage", receiverPayload);
};

const persistCallLogMessage = async (session, status, reason, triggeredBy) => {
  if (!session || session.conversationType !== "direct") return;

  const endedAt = session.endedAt || new Date();
  const startedAt = session.startedAt || endedAt;
  const connectedAt = session.connectedAt || null;
  const durationSeconds = connectedAt
    ? Math.max(0, Math.round((endedAt.getTime() - connectedAt.getTime()) / 1000))
    : 0;

  const callMessage = new Message({
    senderId: session.initiatorId,
    receiverId: session.targetUserId,
    messageType: "call",
    callMetadata: {
      callType: session.callType || "video",
      conversationType: session.conversationType,
      participants: [session.initiatorId, session.targetUserId],
      initiatedBy: session.initiatorId,
      sessionId: session.callId,
      status: status || "missed",
      durationSeconds,
      startedAt,
      connectedAt,
      endedAt,
      endedReason: reason || null,
      endedBy: triggeredBy || null,
    },
  });

  await callMessage.save();
  await callMessage.populate("senderId", "fullName profilePic privacySettings");
  await broadcastCallMessage(callMessage, session);
};

const finalizeCallSession = async (callId, { reason, triggeredBy } = {}) => {
  if (!callId) return null;
  const session = activeCallSessions.get(callId);
  if (!session || session.completed) {
    return session || null;
  }

  session.completed = true;
  session.endedAt = session.endedAt || new Date();
  session.endedReason = reason || session.endedReason || null;
  session.endedBy = triggeredBy || session.endedBy || null;
  const finalStatus = determineCallStatus(session, reason, triggeredBy);
  activeCallSessions.delete(callId);

  try {
    await persistCallLogMessage(session, finalStatus, reason, triggeredBy);
  } catch (error) {
    console.error("Unable to persist call log", error);
  }

  return session;
};

const markPendingMessagesDelivered = async (receiverId) => {
  if (!receiverId) return;
  try {
    const pendingMessages = await Message.find({
      receiverId,
      status: "sent",
    })
      .select("_id senderId")
      .lean();

    if (!pendingMessages.length) return;

    const now = new Date();
    const pendingIds = pendingMessages.map((msg) => msg._id);

    await Message.updateMany(
      { _id: { $in: pendingIds } },
      { $set: { status: "delivered", deliveredAt: now } }
    );

    const groupedBySender = pendingMessages.reduce((acc, msg) => {
      const senderKey = msg.senderId?.toString();
      if (!senderKey) return acc;
      if (!acc[senderKey]) acc[senderKey] = [];
      acc[senderKey].push(msg._id.toString());
      return acc;
    }, {});

    Object.entries(groupedBySender).forEach(([senderId, messageIds]) => {
      emitToUser(senderId, "messagesDelivered", {
        conversationId: receiverId.toString(),
        messageIds,
        deliveredAt: now.toISOString(),
      });
    });
  } catch (error) {
    console.error("Unable to mark pending messages as delivered", error);
  }
};

const updateLastSeen = async (userId, timestamp = new Date()) => {
  if (!userId) return null;
  try {
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { lastSeenAt: timestamp } },
      { new: true }
    )
      .select("_id fullName profilePic lastSeenAt privacySettings")
      .lean();
    return updated;
  } catch (error) {
    console.error("Unable to update last seen", error);
    return null;
  }
};

const broadcastPresenceUpdate = async (ownerUserDoc, { isOnline = false } = {}) => {
  if (!ownerUserDoc?._id) return;
  const ownerId = toStringId(ownerUserDoc._id);
  const recipientIds = Object.keys(userSocketMap).filter((candidateId) => candidateId !== ownerId);

  await Promise.all(
    recipientIds.map(async (viewerId) => {
      try {
        const [viewerContacts, viewerDoc] = await Promise.all([
          computeContactSetForUser(viewerId),
          User.findById(viewerId).select("privacySettings").lean(),
        ]);
        const sanitizedOwner = sanitizeUserForViewer(ownerUserDoc, viewerId, viewerContacts, {
          viewerPrivacySettings: viewerDoc?.privacySettings,
        });
        emitToUser(viewerId, "user:presenceUpdated", {
          _id: ownerId,
          isOnline: sanitizedOwner?.isLastSeenVisible ? isOnline : false,
          lastSeenAt: sanitizedOwner?.isLastSeenVisible ? sanitizedOwner?.lastSeenAt || null : null,
          isLastSeenVisible: sanitizedOwner?.isLastSeenVisible !== false,
        });
      } catch (error) {
        console.error("Unable to broadcast presence update", error);
      }
    })
  );
};

io.on("connection", async (socket) => {
  console.log("A user connected", socket.user.fullName);

  const userId = socket.userId;
  if (!userSocketMap[userId]) {
    userSocketMap[userId] = new Set();
  }
  userSocketMap[userId].add(socket.id);

  // io.emit() is used to send events to all connected clients
  io.emit("getOnlineUsers", getOnlineUserIds());

  await markPendingMessagesDelivered(userId);
  const connectedUserDoc = await updateLastSeen(userId, new Date());
  if (connectedUserDoc) {
    await broadcastPresenceUpdate(connectedUserDoc, { isOnline: true });
  }

  const getUserProfile = () => ({
    _id: userId,
    fullName: socket.user?.fullName,
    profilePic: socket.user?.profilePic,
  });

  socket.on("call:offer", async (payload = {}, ack) => {
    const { targetUserId, offer, metadata } = payload;
    if (!targetUserId || !offer) {
      if (typeof ack === "function") {
        ack({ error: "Target and offer are required" });
      }
      return;
    }

    const callId = new mongoose.Types.ObjectId().toString();
    const session = {
      callId,
      initiatorId: userId,
      targetUserId,
      callType: metadata?.callType === "audio" ? "audio" : "video",
      conversationType: metadata?.conversationType === "group" ? "group" : "direct",
      startedAt: new Date(),
      status: "ringing",
    };

    activeCallSessions.set(callId, session);

    if (typeof ack === "function") {
      ack({ callId });
    }

    const forwarded = emitToUser(targetUserId, "call:incoming", {
      from: getUserProfile(),
      offer,
      metadata: metadata || null,
      callId,
    });

    if (!forwarded) {
      await finalizeCallSession(callId, { reason: "unavailable", triggeredBy: userId });
      socket.emit("call:unavailable", { targetUserId, callId });
    }
  });

  socket.on("call:answer", async ({ targetUserId, answer, callId }) => {
    if (!targetUserId || !answer || !callId) return;
    const session = activeCallSessions.get(callId);
    if (!session) return;

    const isCallee = toStringId(session.targetUserId) === toStringId(userId);
    const isInitiatorTarget = toStringId(session.initiatorId) === toStringId(targetUserId);
    if (!isCallee || !isInitiatorTarget) return;

    session.connectedAt = new Date();
    session.status = "connected";
    session.acceptedBy = userId;

    const forwarded = emitToUser(targetUserId, "call:answered", {
      from: getUserProfile(),
      answer,
      callId,
    });
    if (!forwarded) {
      await finalizeCallSession(callId, { reason: "unavailable", triggeredBy: userId });
      socket.emit("call:unavailable", { targetUserId, callId });
    }
  });

  socket.on("call:ice-candidate", ({ targetUserId, candidate, callId }) => {
    if (!targetUserId || !candidate) return;
    emitToUser(targetUserId, "call:ice-candidate", {
      from: getUserProfile(),
      candidate,
      callId,
    });
  });

  socket.on("call:hangup", async ({ targetUserId, reason, callId }) => {
    if (!targetUserId || !callId) return;
    await finalizeCallSession(callId, { reason: reason || "hangup", triggeredBy: userId });
    emitToUser(targetUserId, "call:ended", {
      from: getUserProfile(),
      reason: reason || "hangup",
      callId,
    });
  });

  socket.on("call:busy", async ({ targetUserId, callId }) => {
    if (!targetUserId) return;
    if (callId) {
      await finalizeCallSession(callId, { reason: "busy", triggeredBy: userId });
    }
    emitToUser(targetUserId, "call:busy", { from: getUserProfile(), callId });
  });

  // with socket.on we listen for events from clients
  socket.on("disconnect", async () => {
    const impacted = [];
    activeCallSessions.forEach((session, callId) => {
      if (
        toStringId(session.initiatorId) === toStringId(userId) ||
        toStringId(session.targetUserId) === toStringId(userId)
      ) {
        impacted.push({ callId, session });
      }
    });

    for (const { callId, session } of impacted) {
      await finalizeCallSession(callId, { reason: "connection-lost", triggeredBy: userId });
      const otherUserId =
        toStringId(session.initiatorId) === toStringId(userId)
          ? session.targetUserId
          : session.initiatorId;
      if (otherUserId) {
        emitToUser(toStringId(otherUserId), "call:ended", {
          from: getUserProfile(),
          reason: "connection-lost",
          callId,
        });
      }
    }

    const disconnectedAt = new Date();
    const socketIds = userSocketMap[userId];
    if (socketIds) {
      socketIds.delete(socket.id);
      if (socketIds.size === 0) {
        delete userSocketMap[userId];
      }
    }

    console.log("A user disconnected", socket.user.fullName);
    io.emit("getOnlineUsers", getOnlineUserIds());

    const isStillOnline = Boolean(userSocketMap[userId]?.size);
    const disconnectedUserDoc = await updateLastSeen(userId, disconnectedAt);
    if (disconnectedUserDoc) {
      await broadcastPresenceUpdate(disconnectedUserDoc, { isOnline: isStillOnline });
    }
  });
});

export { io, app, server };