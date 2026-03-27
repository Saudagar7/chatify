import express from 'express';
import { getAllContacts,
        getChatPartners,
        getMessageByUserId,
        sendMessage,
        updateMessage,
        markConversationAsRead,
        forwardMessage,
 } from '../controllers/message.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import { arcjetProtection } from '../middleware/arcjet.middleware.js';


const router = express.Router();
router.use(arcjetProtection, protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners);
router.get("/:id", getMessageByUserId);
router.post("/:id/read", markConversationAsRead);
router.post("/send/:id", sendMessage);
router.post("/forward", forwardMessage);
router.put("/edit/:messageId", updateMessage);


export default router;