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
            
        },
        image: {
            type: String,
        },
    },
    { timestamps: true }
);
const Message = mangoose.model('Message', messageSchema);
export default Message;