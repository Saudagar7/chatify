import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";
import {
  createGroup,
  getMyGroups,
  addGroupMembers,
  removeGroupMember,
  getGroupMessages,
  sendGroupMessage,
  voteOnPoll,
  reactToGroupMessage,
} from "../controllers/group.controller.js";

const router = express.Router();

router.use(arcjetProtection, protectRoute);

router.post("/", createGroup);
router.get("/", getMyGroups);
router.post("/:groupId/members", addGroupMembers);
router.delete("/:groupId/members", removeGroupMember);
router.get("/:groupId/messages", getGroupMessages);
router.post("/:groupId/messages", sendGroupMessage);
router.post("/:groupId/messages/:messageId/poll/vote", voteOnPoll);
router.post("/:groupId/messages/:messageId/reaction", reactToGroupMessage);

export default router;
