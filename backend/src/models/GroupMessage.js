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
      default: "group",
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
    startedAt: Date,
    connectedAt: Date,
    endedAt: Date,
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

const pollOptionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: 120,
      required: true,
    },
    voters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { _id: true }
);

const pollSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      trim: true,
      maxlength: 300,
      required: true,
    },
    allowMultiple: {
      type: Boolean,
      default: false,
    },
    options: {
      type: [pollOptionSchema],
      validate: {
        validator: (options = []) => Array.isArray(options) && options.length >= 2,
        message: "Poll must contain at least two options",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalVotes: {
      type: Number,
      min: 0,
      default: 0,
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

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    senderId: {
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
    callMetadata: {
      type: callMetadataSchema,
      default: null,
    },
    poll: {
      type: pollSchema,
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);
export default GroupMessage;
