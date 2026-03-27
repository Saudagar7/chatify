import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import {
  computeContactSetForUser,
  sanitizeUserForViewer,
  sanitizeUsersForViewer,
} from "../lib/privacy.js";

const ensureBase64DataUri = (payload, mimeType, fallbackType = "application/octet-stream") => {
  if (!payload || typeof payload !== "string") return null;
  if (payload.startsWith("data:")) return payload;
  const normalizedType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : fallbackType;
  return `data:${normalizedType};base64,${payload}`;
};

const serializeMessage = (messageDoc) => {
  if (!messageDoc) return null;
  const plain = typeof messageDoc.toObject === "function" ? messageDoc.toObject() : messageDoc;
  if (plain.senderId && typeof plain.senderId === "object") {
    plain.sender = plain.senderId;
    plain.senderId = plain.senderId._id ?? plain.senderId;
  } else {
    plain.sender = null;
  }
  return plain;
};

const ensureGroupMembership = (group, userId) => {
  return group.members.some((member) => member.equals(userId));
};

const stripPrivacySettings = (user) => {
  if (!user || typeof user !== "object") return user;
  const cloned = { ...user };
  if (Object.prototype.hasOwnProperty.call(cloned, "privacySettings")) {
    delete cloned.privacySettings;
  }
  return cloned;
};

const sanitizeUserSnapshot = (user, viewerId, viewerContacts) => {
  if (!user) return user;
  return stripPrivacySettings(sanitizeUserForViewer(user, viewerId, viewerContacts));
};

const sanitizeMemberList = (members = [], viewerId, viewerContacts) =>
  sanitizeUsersForViewer(members, viewerId, viewerContacts).map(stripPrivacySettings);

const sanitizeGroupPayload = (group, viewerId, viewerContacts) => {
  if (!group) return group;
  const sanitizedMembers = sanitizeMemberList(group.members || [], viewerId, viewerContacts);
  const sanitizedAdmin = sanitizeUserSnapshot(group.admin, viewerId, viewerContacts);
  let sanitizedLastMessage = group.lastMessage;

  if (group.lastMessage?.sender) {
    sanitizedLastMessage = {
      ...group.lastMessage,
      sender: sanitizeUserSnapshot(group.lastMessage.sender, viewerId, viewerContacts),
    };
  }

  return {
    ...group,
    admin: sanitizedAdmin,
    members: sanitizedMembers,
    lastMessage: sanitizedLastMessage,
  };
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
      .lean();

    const serialized = messages.map((message) => ({
      ...message,
      sender: message.senderId,
      senderId: message.senderId?._id,
    }));

    const viewerContacts = await computeContactSetForUser(userId);
    const sanitized = serialized.map((message) => ({
      ...message,
      sender: sanitizeUserSnapshot(message.sender, userId, viewerContacts),
    }));

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
      audio,
      audioType,
      audioDuration,
      file,
      fileName,
      fileSize,
      fileType,
    } = req.body;

    const trimmedText = text?.trim();

    if (!trimmedText && !image && !audio && !file) {
      return res.status(400).json({ message: "Message text, media, audio, or file is required" });
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
      audio: audioUrl,
      audioDuration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
      file: fileUrl,
      fileName: fileName?.trim(),
      fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined,
      fileType: fileType || undefined,
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullName profilePic privacySettings");

    res.status(201).json(serializeMessage(newMessage));
  } catch (error) {
    console.error("Error sending group message:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
