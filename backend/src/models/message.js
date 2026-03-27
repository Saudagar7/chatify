import mangoose from 'mongoose';

const messageSchema = new mangoose.Schema(
    {
        senderId: {
            type: mangoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        receiverId: {
            type: mangoose.Schema.Types.ObjectId,
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
    },
    { timestamps: true }
);
const Message = mangoose.model('Message', messageSchema);
export default Message;