import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import Message from "../models/message.js";
import User from "../models/User.js";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import {
    computeContactSetForUser,
    sanitizeUserForViewer,
    sanitizeUsersForViewer,
} from "../lib/privacy.js";

const emitToUser = (eventName, userId, payload) => {
    if (!userId) return;
    const socketId = getReceiverSocketId(userId.toString());
    if (!socketId) return;
    io.to(socketId).emit(eventName, payload);
};

const serializeGroupMessage = (messageDoc) => {
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

const stripPrivacySettings = (user) => {
    if (!user || typeof user !== "object") return user;
    const cloned = { ...user };
    if (Object.prototype.hasOwnProperty.call(cloned, "privacySettings")) {
        delete cloned.privacySettings;
    }
    return cloned;
};

const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;

const clampPageSize = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(Math.round(numeric), MIN_PAGE_SIZE), MAX_PAGE_SIZE);
};

const buildConversationFilter = (myId, peerId) => ({
    $or: [
        { senderId: myId, receiverId: peerId },
        { senderId: peerId, receiverId: myId },
    ],
});

const parseDateValue = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const buildDayRange = (date) => {
    if (!date) return null;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
};

const ensureBase64DataUri = (payload, mimeType, fallbackType = "application/octet-stream") => {
    if (!payload || typeof payload !== "string") return null;
    if (payload.startsWith("data:")) return payload;
    const normalizedType = typeof mimeType === "string" && mimeType.trim()
        ? mimeType.trim()
        : fallbackType;
    return `data:${normalizedType};base64,${payload}`;
};


export const getAllContacts = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } })
            .select("-password")
            .lean();

        const viewerContacts = await computeContactSetForUser(loggedInUserId);
        const sanitized = sanitizeUsersForViewer(filteredUsers, loggedInUserId, viewerContacts).map(
            stripPrivacySettings
        );

        res.status(200).json(sanitized);

    } catch (error) {
        console.error("Error fetching contacts:", error.message);
        res.status(500).json({ message: "Server error" });

    }
}
export const getMessageByUserId = async (req, res) => {
    try {
        const myId = req.user._id;
        const { id: userToChatId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userToChatId)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        const { cursor, direction = "older", limit, date } = req.query;
        const sanitizedDirection = direction === "newer" ? "newer" : "older";
        const pageLimit = clampPageSize(limit);
        const cursorDate = parseDateValue(cursor);
        const targetDate = parseDateValue(date);
        const baseFilter = buildConversationFilter(myId, userToChatId);

        let queryFilter = { ...baseFilter };
        let shouldReverse = false;
        let fetchedMessages = [];

        if (targetDate) {
            const dayRange = buildDayRange(targetDate);
            queryFilter.createdAt = { $gte: dayRange.start, $lt: dayRange.end };
            fetchedMessages = await Message.find(queryFilter)
                .sort({ createdAt: 1 })
                .limit(pageLimit)
                .exec();

            if (!fetchedMessages.length) {
                const fallbackFilter = {
                    ...baseFilter,
                    createdAt: { $lt: dayRange.end },
                };
                fetchedMessages = await Message.find(fallbackFilter)
                    .sort({ createdAt: -1 })
                    .limit(pageLimit)
                    .exec();
                shouldReverse = true;
            }
        } else if (cursorDate) {
            if (sanitizedDirection === "newer") {
                queryFilter.createdAt = { $gt: cursorDate };
                fetchedMessages = await Message.find(queryFilter)
                    .sort({ createdAt: 1 })
                    .limit(pageLimit + 1)
                    .exec();
            } else {
                queryFilter.createdAt = { $lt: cursorDate };
                fetchedMessages = await Message.find(queryFilter)
                    .sort({ createdAt: -1 })
                    .limit(pageLimit + 1)
                    .exec();
                shouldReverse = true;
            }
            if (fetchedMessages.length > pageLimit) {
                fetchedMessages = fetchedMessages.slice(0, pageLimit);
            }
        } else {
            fetchedMessages = await Message.find(baseFilter)
                .sort({ createdAt: -1 })
                .limit(pageLimit + 1)
                .exec();
            if (fetchedMessages.length > pageLimit) {
                fetchedMessages = fetchedMessages.slice(0, pageLimit);
            }
            shouldReverse = true;
        }

        if (shouldReverse) {
            fetchedMessages = fetchedMessages.reverse();
        }

        const deliverableMessageIds = [];
        const now = new Date();

        fetchedMessages.forEach((msg) => {
            msg.status = msg.status || "sent";
            if (msg.receiverId.equals(myId) && msg.status === "sent") {
                deliverableMessageIds.push(msg._id);
                msg.status = "delivered";
                msg.deliveredAt = now;
            }
        });

        if (deliverableMessageIds.length) {
            await Message.updateMany(
                { _id: { $in: deliverableMessageIds } },
                { $set: { status: "delivered", deliveredAt: now } }
            );

            emitToUser("messagesDelivered", userToChatId, {
                conversationId: myId.toString(),
                messageIds: deliverableMessageIds.map((id) => id.toString()),
                deliveredAt: now.toISOString(),
            });
        }

        const oldestCursor = fetchedMessages[0]?.createdAt || null;
        const newestCursor = fetchedMessages[fetchedMessages.length - 1]?.createdAt || null;

        const hasOlder = oldestCursor
            ? await Message.exists({ ...baseFilter, createdAt: { $lt: oldestCursor } })
            : false;
        const hasNewer = newestCursor
            ? await Message.exists({ ...baseFilter, createdAt: { $gt: newestCursor } })
            : false;

        res.status(200).json({
            messages: fetchedMessages,
            pageInfo: {
                limit: pageLimit,
                oldestCursor,
                newestCursor,
                hasOlder,
                hasNewer,
            },
        });
    } catch (error) {
        console.log("Error in getmessages controller: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
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
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

       const trimmedText = text?.trim();

       if(!trimmedText && !image && !audio && !file){
        return res.status(400).json({ message: "Message text, media, audio, or file is required" });
       }
       if(senderId.equals(receiverId)){
        return res.status(400).json({ message: "You cannot send message to yourself" });
       }
       const receiverExists = await User.exists({ _id: receiverId });
         if(!receiverExists){
        return res.status(404).json({ message: "Receiver not found" });
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

        const newMessage = new Message({
            senderId,
            receiverId,
            text: trimmedText,
            image: imageUrl,
            audio: audioUrl,
            audioDuration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
            file: fileUrl,
            fileName: fileName?.trim(),
            fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined,
            fileType: fileType || undefined,
            status: "sent",
        });

        await newMessage.save();
        await newMessage.populate("senderId", "fullName profilePic privacySettings");

        const serializedMessage = newMessage.toObject({ getters: true });

        // sanitize payload for receiver to respect privacy
        const senderObjectId = serializedMessage.senderId?._id?.toString?.();
        const receiverContactSet = new Set(senderObjectId ? [senderObjectId] : []);
        const sanitizedSender =
            typeof serializedMessage.senderId === "object"
                ? stripPrivacySettings(
                      sanitizeUserForViewer(
                          serializedMessage.senderId,
                          receiverId,
                          receiverContactSet
                      )
                  )
                : serializedMessage.senderId;

        const receiverPayload = {
            ...serializedMessage,
            senderId: sanitizedSender,
        };

        // notify receiver in real time
        emitToUser("newMessage", receiverId, receiverPayload);

        res.status(201).json(serializedMessage);

    } catch (error) {
        console.log("Error in sendMessage controller: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const forwardMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { sourceMessageId, sourceType = "direct", targets = [] } = req.body;

        if (!sourceMessageId || !Array.isArray(targets) || !targets.length) {
            return res.status(400).json({ message: "Source message and at least one target are required" });
        }

        const normalizedTargets = [];
        const seen = new Set();
        targets.forEach((target) => {
            if (!target?.id) return;
            const type = target.type === "group" ? "group" : "user";
            const key = `${type}:${target.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            normalizedTargets.push({ type, id: target.id.toString() });
        });

        if (!normalizedTargets.length) {
            return res.status(400).json({ message: "No valid forwarding targets provided" });
        }

        const sanitizedSourceType = sourceType === "group" ? "group" : "direct";
        const sourceMessage =
            sanitizedSourceType === "group"
                ? await GroupMessage.findById(sourceMessageId)
                : await Message.findById(sourceMessageId);

        if (!sourceMessage) {
            return res.status(404).json({ message: "Original message not found" });
        }

        if (sanitizedSourceType === "group") {
            const sourceGroup = await Group.findById(sourceMessage.groupId).select("_id members");
            if (!sourceGroup) {
                return res.status(404).json({ message: "Source group not found" });
            }
            const isMember = sourceGroup.members.some((member) => member.equals(userId));
            if (!isMember) {
                return res
                    .status(403)
                    .json({ message: "You are not allowed to forward this group message" });
            }
        } else {
            const isParticipant =
                sourceMessage.senderId.equals(userId) || sourceMessage.receiverId.equals(userId);
            if (!isParticipant) {
                return res
                    .status(403)
                    .json({ message: "You can only forward messages from your conversations" });
            }
        }

        const basePayload = {
            text: sourceMessage.text?.trim() || undefined,
            image: sourceMessage.image || undefined,
            audio: sourceMessage.audio || undefined,
            audioDuration: sourceMessage.audioDuration,
            file: sourceMessage.file || undefined,
            fileName: sourceMessage.fileName || undefined,
            fileSize: sourceMessage.fileSize,
            fileType: sourceMessage.fileType || undefined,
        };

        const forwarded = [];
        const errors = [];
        const validUsers = new Set();
        const validGroups = new Set();

        const userTargetIds = normalizedTargets
            .filter((target) => target.type === "user")
            .map((target) => target.id);
        const groupTargetIds = normalizedTargets
            .filter((target) => target.type === "group")
            .map((target) => target.id);

        if (userTargetIds.length) {
            const users = await User.find({ _id: { $in: userTargetIds } }).select("_id");
            users.forEach((user) => validUsers.add(user._id.toString()));
        }

        if (groupTargetIds.length) {
            const groups = await Group.find({ _id: { $in: groupTargetIds }, members: userId }).select(
                "_id"
            );
            groups.forEach((group) => validGroups.add(group._id.toString()));
        }

        for (const target of normalizedTargets) {
            if (target.type === "user") {
                if (target.id === userId.toString()) {
                    errors.push({ targetId: target.id, type: target.type, reason: "Cannot forward to yourself" });
                    continue;
                }
                if (!validUsers.has(target.id)) {
                    errors.push({ targetId: target.id, type: target.type, reason: "Recipient not found" });
                    continue;
                }

                const newMessage = new Message({
                    senderId: userId,
                    receiverId: target.id,
                    ...basePayload,
                    status: "sent",
                });

                await newMessage.save();
                await newMessage.populate("senderId", "fullName profilePic privacySettings");

                const serialized = newMessage.toObject({ getters: true });
                forwarded.push({ targetType: "user", targetId: target.id, message: serialized });
                emitToUser("newMessage", target.id, serialized);
            } else {
                if (!validGroups.has(target.id)) {
                    errors.push({
                        targetId: target.id,
                        type: target.type,
                        reason: "Group not found or membership required",
                    });
                    continue;
                }

                const newGroupMessage = new GroupMessage({
                    groupId: target.id,
                    senderId: userId,
                    ...basePayload,
                });

                await newGroupMessage.save();
                await newGroupMessage.populate("senderId", "fullName profilePic privacySettings");

                forwarded.push({
                    targetType: "group",
                    targetId: target.id,
                    message: serializeGroupMessage(newGroupMessage),
                });
            }
        }

        if (!forwarded.length) {
            return res.status(400).json({
                message: "Unable to forward message to the selected recipients",
                errors,
            });
        }

        res.status(201).json({ forwarded, errors });
    } catch (error) {
        console.error("Error in forwardMessage controller: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getChatPartners = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;

        const messages = await Message.find({
            $or: [
                { senderId: loggedInUserId },
                { receiverId: loggedInUserId },
            ],
        })
        .sort({ createdAt: 1 })
        .lean();

        const latestMessagesMap = {};

        messages.forEach((msg) => {
            const partnerId = msg.senderId.equals(loggedInUserId)
                ? msg.receiverId.toString()
                : msg.senderId.toString();

            latestMessagesMap[partnerId] = {
                _id: msg._id,
                text: msg.text,
                image: msg.image,
                audio: msg.audio,
                audioDuration: msg.audioDuration,
                file: msg.file,
                fileName: msg.fileName,
                fileSize: msg.fileSize,
                fileType: msg.fileType,
                createdAt: msg.createdAt,
                senderId: msg.senderId,
                status: msg.status || "sent",
                deliveredAt: msg.deliveredAt,
                readAt: msg.readAt,
            };
        });

        const chatPartnerIds = Object.keys(latestMessagesMap);

        if (chatPartnerIds.length === 0) {
            return res.status(200).json([]);
        }

        const chatPartners = await User.find({ _id: { $in: chatPartnerIds } })
            .select("-password")
            .lean();

        const unsanitized = chatPartners
            .map((partner) => ({
                ...partner,
                lastMessage: latestMessagesMap[partner._id.toString()] || null,
            }))
            .sort((a, b) => {
                const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
                const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
                return timeB - timeA;
            });

        const viewerContacts = await computeContactSetForUser(loggedInUserId);
        const sanitized = unsanitized.map((entry) =>
            stripPrivacySettings(sanitizeUserForViewer(entry, loggedInUserId, viewerContacts))
        );

        res.status(200).json(sanitized);

    } catch (error) {
        console.error("Error in getChatPartners: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }

};

export const updateMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const userId = req.user._id;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Updated message text is required" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (!message.senderId.equals(userId)) {
            return res.status(403).json({ message: "You can only edit your own messages" });
        }

        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        const age = Date.now() - new Date(message.createdAt).getTime();
        if (age > FIVE_MINUTES_MS) {
            return res.status(400).json({ message: "Messages can only be edited within 5 minutes" });
        }

        message.text = text.trim();
        await message.save();

        res.status(200).json(message);
    } catch (error) {
        console.error("Error in updateMessage controller: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const markConversationAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id: senderId } = req.params;

        if (!senderId) {
            return res.status(400).json({ message: "Sender id is required" });
        }

        const filter = {
            senderId,
            receiverId: userId,
            status: { $in: [null, "sent", "delivered"] },
        };

        const candidates = await Message.find(filter).select("_id");
        if (!candidates.length) {
            return res.status(200).json({ updatedMessageIds: [] });
        }

        const messageIds = candidates.map((msg) => msg._id);
        const now = new Date();

        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $set: { status: "read", readAt: now, deliveredAt: now } }
        );

        const payload = {
            conversationId: userId.toString(),
            messageIds: messageIds.map((id) => id.toString()),
            readAt: now.toISOString(),
        };

        emitToUser("messagesRead", senderId, payload);

        res.status(200).json({ updatedMessageIds: messageIds });
    } catch (error) {
        console.error("Error in markConversationAsRead controller: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
};