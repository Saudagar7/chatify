import express from 'express';
import cookieParser from 'cookie-parser';
import Path from 'path';
import cors from 'cors';

import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import groupRoutes from './routes/group.route.js';
import { connectDB } from './lib/db.js';
import { ENV } from './lib/env.js';
import { app, server } from './lib/socket.js';

const __dirname = Path.resolve();

const normalizeOrigin = (value = '') => value.trim().replace(/\/$/, '');
const parseAllowedOrigins = (raw = '') =>
  raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

const DEFAULT_ALLOWED_ORIGINS = new Set(
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].map(normalizeOrigin)
);

const configuredOrigins = new Set(parseAllowedOrigins(ENV.CLIENT_URL));
const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
const devTunnelPattern = /^https?:\/\/[a-z0-9-]+-\d+\.inc1\.devtunnels\.ms$/i;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.has(normalizedOrigin) || devTunnelPattern.test(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

const PORT = ENV.PORT || 3000;

// Render sits behind a reverse proxy; trust proxy headers so req.ip is correct.
app.set("trust proxy", 1);

app.use(express.json({limit: '20mb'}));
app.use(cors(corsOptions));

app.use(cookieParser());

  

console.log(process.env.PORT);

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);

if(ENV.NODE_ENV === 'production') {
  app.use(express.static(Path.join(__dirname, '../frontend/dist')));

  app.get('*', (_, res) => {
    res.sendFile(Path.join(__dirname, "../frontend","dist","index.html"));
  });
}


const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log("Server is running on port: " + PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();