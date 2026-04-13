import mongoose from 'mongoose';

const callMetadataSchema = new mongoose.Schema(
    {
        callType: {
            type: String,
            enum: ["video", "audio"],
            default: "video",
        },
        conversationType: {
            type: String,
            enum: ["direct", "group"],
            default: "direct",
        },
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        initiatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        status: {
            type: String,
            enum: ["missed", "declined", "completed", "cancelled", "failed", "busy", "unanswered"],
        },
        durationSeconds: {
            type: Number,
            min: 0,
            default: 0,
        },
        startedAt: {
            type: Date,
        },
        connectedAt: {
            type: Date,
        },
        endedAt: {
            type: Date,
        },
        endedReason: {
            type: String,
            trim: true,
        },
        endedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
        },
        sessionId: {
            type: String,
            trim: true,
        },
    },
    { _id: false }
);

const reactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        emoji: {
            type: String,
            required: true,
            trim: true,
            maxlength: 16,
        },
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        messageType: {
            type: String,
            enum: ["text", "call"],
            default: "text",
        },
        text: {
            type: String,
            trim: true,
            maxlength: 2000,
            
        },
        image: {
            type: String,
        },
        video: {
            type: String,
        },
        audio: {
            type: String,
        },
        audioDuration: {
            type: Number,
            min: 0,
        },
        file: {
            type: String,
        },
        fileName: {
            type: String,
            trim: true,
        },
        fileSize: {
            type: Number,
            min: 0,
        },
        fileType: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ["sent", "delivered", "read"],
            default: "sent",
        },
        deliveredAt: {
            type: Date,
        },
        readAt: {
            type: Date,
        },
        callMetadata: {
            type: callMetadataSchema,
            default: null,
        },
        reactions: {
            type: [reactionSchema],
            default: [],
        },
    },
    { timestamps: true }
);
const Message = mongoose.model('Message', messageSchema);
export default Message;