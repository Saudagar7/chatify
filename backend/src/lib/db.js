import mongoose from 'mongoose';
import { ENV } from './env.js';

export const connectDB = async (mongoURI = ENV.MONGO_URI) => {
    try {
        if (!mongoURI) {
            throw new Error('MONGO_URI is not set');
        }

        const conn = await mongoose.connect(mongoURI);
        console.log('MongoDB Connected:', conn.connection.host ?? 'unknown host');
        return conn;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        throw error;
    }
};
        