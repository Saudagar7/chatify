import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import { computeContactSetForUser } from "../lib/privacy.js";
import {
  sanitizeGroupMessageForViewer,
  sanitizeGroupPayload,
} from "../lib/groupSanitizers.js";
import { broadcastGroupMessageEvent } from "../lib/groupRealtime.js";

const ensureBase64DataUri = (payload, mimeType, fallbackType = "application/octet-stream") => {
  if (!payload || typeof payload !== "string") return null;
  if (payload.startsWith("data:")) return payload;
  const normalizedType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : fallbackType;
  return `data:${normalizedType};base64,${payload}`;
};

const ensureGroupMembership = (group, userId) => {
  return group.members.some((member) => member.equals(userId));
};

const equalsObjectId = (a, b) => {
  if (!a || !b) return false;
  const valueA = typeof a === "object" && a.toString ? a.toString() : `${a}`;
  const valueB = typeof b === "object" && b.toString ? b.toString() : `${b}`;
  return valueA === valueB;
};

const normalizePollOptions = (rawOptions = []) => {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set();
  return rawOptions
    .map((option) => {
      if (typeof option === "string") return option.trim();
      if (option && typeof option.label === "string") return option.label.trim();
      return null;
    })
    .filter((label) => {
      if (!label) return false;
      const lower = label.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    })
    .map((label) => ({ label, voters: [] }));
};

const buildPollPayload = (pollInput, creatorId) => {
  if (!pollInput) return null;
  const question = pollInput.question?.trim();
  if (!question) return null;
  const options = normalizePollOptions(pollInput.options);
  if (options.length < 2) return null;
  return {
    question,
    allowMultiple: Boolean(pollInput.allowMultiple),
    options,
    createdBy: creatorId,
    totalVotes: 0,
  };
};

const normalizeReactionEmoji = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 16);
};

const applyReactionUpdate = (messageDoc, userId, emoji) => {
  const userIdString = userId?.toString?.() || "";
  if (!Array.isArray(messageDoc.reactions)) {
    messageDoc.reactions = [];
  }

  const existingIndex = messageDoc.reactions.findIndex(
    (reaction) => (reaction?.userId?.toString?.() || "") === userIdString
  );

  if (!emoji) {
    if (existingIndex >= 0) {
      messageDoc.reactions.splice(existingIndex, 1);
    }
    return;
  }

  if (existingIndex >= 0) {
    const previousEmoji = messageDoc.reactions[existingIndex]?.emoji || "";
    if (previousEmoji === emoji) {
      messageDoc.reactions.splice(existingIndex, 1);
    } else {
      messageDoc.reactions[existingIndex].emoji = emoji;
    }
    return;
  }

  messageDoc.reactions.push({ userId, emoji });
};


export const createGroup = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { name, description, memberIds = [], profilePic } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const uniqueMemberIds = new Set([adminId.toString(), ...memberIds.map((id) => id.toString())]);
    const createdAt = new Date();

    let profilePicUrl = "";
    if (profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      profilePicUrl = uploadResponse.secure_url;
    }

    const group = await Group.create({
      name: name.trim(),
      description: description?.trim(),
      admin: adminId,
      members: Array.from(uniqueMemberIds),
      memberJoins: Array.from(uniqueMemberIds).map((id) => ({
        user: id,
        joinedAt: createdAt,
        shouldHideHistory: false,
      })),
      profilePic: profilePicUrl,
    });

    const populatedGroup = await Group.findById(group._id)
      .populate("members", "fullName profilePic email privacySettings")
      .populate("admin", "fullName profilePic email privacySettings")
      .lean();

    const viewerContacts = await computeContactSetForUser(adminId);
    const sanitized = sanitizeGroupPayload(
      { ...populatedGroup, lastMessage: null },
      adminId,
      viewerContacts
    );

    res.status(201).json(sanitized);
  } catch (error) {
    console.error("Error creating group:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await Group.find({ members: userId })
      .populate("members", "fullName profilePic email privacySettings")
      .populate("admin", "fullName profilePic email privacySettings")
      .lean();

    const groupsWithLastMessage = await Promise.all(
      groups.map(async (group) => {
        const lastMessageDoc = await GroupMessage.findOne({ groupId: group._id })
          .sort({ createdAt: -1 })
          .populate("senderId", "fullName profilePic privacySettings")
          .lean();

        const lastMessage = lastMessageDoc
          ? {
              ...lastMessageDoc,
              sender: lastMessageDoc.senderId,
              senderId: lastMessageDoc.senderId?._id,
            }
          : null;

        return { ...group, lastMessage };
      })
    );

    const sorted = groupsWithLastMessage.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const viewerContacts = await computeContactSetForUser(userId);
    const sanitized = sorted.map((group) => sanitizeGroupPayload(group, userId, viewerContacts));

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error fetching groups:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const addGroupMembers = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { groupId } = req.params;
    const { memberIds = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.admin.equals(adminId)) {
      return res.status(403).json({ message: "Only group admins can add members" });
    }

    const uniqueMembers = new Set(group.members.map((member) => member.toString()));
    const joinedEntries = group.memberJoins || [];
    const joinedMap = new Set(joinedEntries.map((entry) => entry.user?.toString()));

    const ensureJoinEntry = (id, { hideHistory = true, joinedAt } = {}) => {
      const normalized = id.toString();
      if (!joinedMap.has(normalized)) {
        joinedEntries.push({
          user: id,
          joinedAt: joinedAt || new Date(),
          shouldHideHistory: hideHistory,
        });
        joinedMap.add(normalized);
      }
    };

    memberIds.forEach((id) => {
      const normalized = id.toString();
      if (!uniqueMembers.has(normalized)) {
        ensureJoinEntry(id, { hideHistory: true });
      }
      uniqueMembers.add(normalized);
    });

    const adminIdStr = group.admin.toString();
    uniqueMembers.add(adminIdStr);
    ensureJoinEntry(group.admin, {
      hideHistory: false,
      joinedAt: group.createdAt || group.updatedAt || new Date(),
    });

    group.members = Array.from(uniqueMembers);
    group.memberJoins = joinedEntries;
    await group.save();

    const populatedGroup = await Group.findById(groupId)
      .populate("members", "fullName profilePic email privacySettings")
      .populate("admin", "fullName profilePic email privacySettings")
      .lean();

    const viewerContacts = await computeContactSetForUser(adminId);
    const sanitized = sanitizeGroupPayload(populatedGroup, adminId, viewerContacts);

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error adding members:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const removeGroupMember = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { groupId } = req.params;
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ message: "Member id is required" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.admin.equals(adminId)) {
      return res.status(403).json({ message: "Only group admins can remove members" });
    }

    if (group.admin.equals(memberId)) {
      return res.status(400).json({ message: "Admin cannot be removed" });
    }

    group.members = group.members.filter((member) => !member.equals(memberId));
    if (Array.isArray(group.memberJoins)) {
      group.memberJoins = group.memberJoins.filter(
        (entry) => !entry.user.equals(memberId)
      );
    }
    await group.save();

    const populatedGroup = await Group.findById(groupId)
      .populate("members", "fullName profilePic email privacySettings")
      .populate("admin", "fullName profilePic email privacySettings")
      .lean();

    const viewerContacts = await computeContactSetForUser(adminId);
    const sanitized = sanitizeGroupPayload(populatedGroup, adminId, viewerContacts);

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error removing member:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureGroupMembership(group, userId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    const userIdStr = userId.toString();
    const joinRecord = (group.memberJoins || []).find(
      (entry) => entry.user?.toString() === userIdStr
    );

    const groupCreatedAt = group.createdAt || new Date(0);
    let historyStart = groupCreatedAt;

    if (joinRecord) {
      const joinedAtDate = joinRecord.joinedAt ? new Date(joinRecord.joinedAt) : groupCreatedAt;
      const shouldHideHistory =
        typeof joinRecord.shouldHideHistory === "boolean"
          ? joinRecord.shouldHideHistory
          : joinedAtDate.getTime() > groupCreatedAt.getTime();

      historyStart = shouldHideHistory ? joinedAtDate : groupCreatedAt;
    }

    const messages = await GroupMessage.find({
      groupId,
      createdAt: { $gte: historyStart },
    })
      .sort({ createdAt: 1 })
      .populate("senderId", "fullName profilePic privacySettings")
      .populate("poll.options.voters", "fullName profilePic privacySettings")
      .lean();

    const viewerContacts = await computeContactSetForUser(userId);
    const sanitized = messages.map((message) =>
      sanitizeGroupMessageForViewer(message, userId, viewerContacts)
    );

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error fetching group messages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { groupId } = req.params;
    const {
      text,
      image,
      video,
      videoType,
      audio,
      audioType,
      audioDuration,
      file,
      fileName,
      fileSize,
      fileType,
      poll,
    } = req.body;

    const trimmedText = text?.trim();
    const pollPayload = buildPollPayload(poll, senderId);

    if (!trimmedText && !image && !video && !audio && !file && !pollPayload) {
      return res
        .status(400)
        .json({ message: "Provide text, media, audio, file, or poll content" });
    }

    if (poll && !pollPayload) {
      return res.status(400).json({ message: "Poll must include a question and two options" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureGroupMembership(group, senderId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    let videoUrl;
    if (video) {
      const videoDataUri = ensureBase64DataUri(video, videoType, "video/mp4");
      const uploadResponse = await cloudinary.uploader.upload(videoDataUri, {
        resource_type: "video",
      });
      videoUrl = uploadResponse.secure_url;
    }

    let audioUrl;
    if (audio) {
      const audioDataUri = ensureBase64DataUri(audio, audioType, "audio/webm");
      const uploadResponse = await cloudinary.uploader.upload(audioDataUri, {
        resource_type: "video",
      });
      audioUrl = uploadResponse.secure_url;
    }

    const parsedDuration = Number(audioDuration);
    let fileUrl;
    if (file) {
      const uploadResponse = await cloudinary.uploader.upload(file, {
        resource_type: "raw",
      });
      fileUrl = uploadResponse.secure_url;
    }

    const newMessage = new GroupMessage({
      groupId,
      senderId,
      text: trimmedText,
      image: imageUrl,
      video: videoUrl,
      audio: audioUrl,
      audioDuration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
      file: fileUrl,
      fileName: fileName?.trim(),
      fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined,
      fileType: fileType || undefined,
      poll: pollPayload,
    });

    await newMessage.save();
    await newMessage.populate([
      { path: "senderId", select: "fullName profilePic privacySettings" },
      { path: "poll.options.voters", select: "fullName profilePic privacySettings" },
    ]);

    const viewerContacts = await computeContactSetForUser(senderId);
    const sanitized = sanitizeGroupMessageForViewer(newMessage, senderId, viewerContacts);

    await broadcastGroupMessageEvent({
      group,
      message: newMessage,
      skipUserId: senderId,
      eventName: "group:newMessage",
    });

    res.status(201).json(sanitized);
  } catch (error) {
    console.error("Error sending group message:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const voteOnPoll = async (req, res) => {
  try {
    const voterId = req.user._id;
    const { groupId, messageId } = req.params;
    const { optionIds = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid group or message id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureGroupMembership(group, voterId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    const message = await GroupMessage.findOne({ _id: messageId, groupId })
      .populate("senderId", "fullName profilePic privacySettings")
      .populate("poll.options.voters", "fullName profilePic privacySettings");

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (!message.poll) {
      return res.status(400).json({ message: "This message is not a poll" });
    }

    const normalizedOptionIds = Array.isArray(optionIds)
      ? [...new Set(optionIds.map((id) => (id ? id.toString() : null)).filter(Boolean))]
      : [];

    const selectedOptionIds = message.poll.allowMultiple
      ? normalizedOptionIds
      : normalizedOptionIds.slice(0, 1);
    const selectionSet = new Set(selectedOptionIds);

    (message.poll.options || []).forEach((option) => {
      const optionId = option._id?.toString();
      const existing = Array.isArray(option.voters) ? option.voters : [];
      option.voters = existing.filter((voter) => !equalsObjectId(voter?._id || voter, voterId));
      if (selectionSet.size && optionId && selectionSet.has(optionId)) {
        option.voters.push(voterId);
      }
    });

    const pollOptions = message.poll.options || [];
    message.poll.totalVotes = pollOptions.reduce(
      (sum, option) => sum + (Array.isArray(option.voters) ? option.voters.length : 0),
      0
    );

    await message.save();
    await message.populate([
      { path: "senderId", select: "fullName profilePic privacySettings" },
      { path: "poll.options.voters", select: "fullName profilePic privacySettings" },
    ]);

    const viewerContacts = await computeContactSetForUser(voterId);
    const sanitized = sanitizeGroupMessageForViewer(message, voterId, viewerContacts);

    await broadcastGroupMessageEvent({
      group,
      message,
      skipUserId: voterId,
      eventName: "group:messageUpdated",
    });

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error voting on poll:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const reactToGroupMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId, messageId } = req.params;
    const emoji = normalizeReactionEmoji(req.body?.emoji);

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid group or message id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureGroupMembership(group, userId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    const message = await GroupMessage.findOne({ _id: messageId, groupId })
      .populate("senderId", "fullName profilePic privacySettings")
      .populate("poll.options.voters", "fullName profilePic privacySettings");

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    applyReactionUpdate(message, userId, emoji);
    await message.save();
    await message.populate([
      { path: "senderId", select: "fullName profilePic privacySettings" },
      { path: "poll.options.voters", select: "fullName profilePic privacySettings" },
    ]);

    const viewerContacts = await computeContactSetForUser(userId);
    const sanitized = sanitizeGroupMessageForViewer(message, userId, viewerContacts);

    await broadcastGroupMessageEvent({
      group,
      message,
      skipUserId: userId,
      eventName: "group:messageUpdated",
    });

    res.status(200).json(sanitized);
  } catch (error) {
    console.error("Error reacting to group message:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
