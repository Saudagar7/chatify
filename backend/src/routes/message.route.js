import express from 'express';
import { getAllContacts,
        getChatPartners,
         getMessageByUserId,
        sendMessage,
 } from '../controllers/message.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import arcjet from '@arcjet/node';

const router = express.Router();
router.use(arcjetProtection, protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners);
router.get("/:id", getMessageByUserId);
router.post("/send/:id", sendMessage);


export default router;