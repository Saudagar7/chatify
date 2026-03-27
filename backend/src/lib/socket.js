import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import Message from "../models/message.js";

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
  return userSocketMap[userId];
}

// this is for storing online users
const userSocketMap = {}; // {userId:socketId}

const emitToUser = (userId, eventName, payload) => {
  const socketId = userSocketMap[userId];
  if (!socketId) return false;
  io.to(socketId).emit(eventName, payload);
  return true;
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

io.on("connection", async (socket) => {
  console.log("A user connected", socket.user.fullName);

  const userId = socket.userId;
  userSocketMap[userId] = socket.id;

  // io.emit() is used to send events to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  await markPendingMessagesDelivered(userId);

  const getUserProfile = () => ({
    _id: userId,
    fullName: socket.user?.fullName,
    profilePic: socket.user?.profilePic,
  });

  socket.on("call:offer", ({ targetUserId, offer, metadata }) => {
    if (!targetUserId || !offer) return;
    const forwarded = emitToUser(targetUserId, "call:incoming", {
      from: getUserProfile(),
      offer,
      metadata: metadata || null,
    });
    if (!forwarded) {
      socket.emit("call:unavailable", { targetUserId });
    }
  });

  socket.on("call:answer", ({ targetUserId, answer }) => {
    if (!targetUserId || !answer) return;
    const forwarded = emitToUser(targetUserId, "call:answered", {
      from: getUserProfile(),
      answer,
    });
    if (!forwarded) {
      socket.emit("call:unavailable", { targetUserId });
    }
  });

  socket.on("call:ice-candidate", ({ targetUserId, candidate }) => {
    if (!targetUserId || !candidate) return;
    emitToUser(targetUserId, "call:ice-candidate", {
      from: getUserProfile(),
      candidate,
    });
  });

  socket.on("call:hangup", ({ targetUserId, reason }) => {
    if (!targetUserId) return;
    emitToUser(targetUserId, "call:ended", {
      from: getUserProfile(),
      reason: reason || "hangup",
    });
  });

  socket.on("call:busy", ({ targetUserId }) => {
    if (!targetUserId) return;
    emitToUser(targetUserId, "call:busy", { from: getUserProfile() });
  });

  // with socket.on we listen for events from clients
  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.user.fullName);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };