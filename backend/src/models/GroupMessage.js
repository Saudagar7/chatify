import mongoose from 'mongoose';

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
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    image: {
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
  },
  { timestamps: true }
);

const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);
export default GroupMessage;
