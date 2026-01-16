import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import Path from 'path';
import cors from 'cors';


import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import { connectDB } from './lib/db.js';
import { ENV } from './lib/env.js';


connectDB(process.env.MONGO_URI);
const app = express();
const __dirname = Path.resolve();

const PORT = ENV.PORT || 3000;

app.use(express.json());
app.use(cors({origin: ENV.CLIENT_URL, credentials:true}));

app.use(cookieParser());

  

console.log(process.env.PORT);

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

if(ENV.NODE_ENV === 'production') {
  app.use(express.static(Path.join(__dirname, '../frontend/dist')));

  app.get('*', (_, res) => {
    res.sendFile(Path.join(__dirname, "../frontend","dist","index.html"));
  });
}


app.listen(PORT, () => {
  console.log("Server is running on port: " +PORT);
  connectDB()
});