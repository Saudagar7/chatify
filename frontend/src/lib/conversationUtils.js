export const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
  }
  return value.toString?.() || "";
};

export const sortByLastMessage = (items = []) => {
  return [...items].sort((a, b) => {
    const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return timeB - timeA;
  });
};

export const getSenderId = (message) => {
  if (!message) return "";
  if (typeof message.senderId === "string") return message.senderId;
  if (typeof message.senderId === "object") {
    if (message.senderId?._id) return message.senderId._id;
    if (message.senderId?.id) return message.senderId.id;
  }
  return message.senderId?.toString?.() || "";
};

export const getConversationKey = (entityOrId, isGroupFallback = false) => {
  if (!entityOrId) return null;

  if (typeof entityOrId === "string") {
    const trimmed = entityOrId.trim();
    return trimmed ? `${isGroupFallback ? "group" : "user"}:${trimmed}` : null;
  }

  if (typeof entityOrId === "object") {
    const idCandidate = entityOrId._id ?? entityOrId.id ?? entityOrId;
    const resolvedId = normalizeId(idCandidate);
    if (!resolvedId) return null;
    const resolvedGroupFlag =
      typeof entityOrId.isGroup === "boolean" ? entityOrId.isGroup : Boolean(isGroupFallback);
    return `${resolvedGroupFlag ? "group" : "user"}:${resolvedId}`;
  }

  return null;
};

export const getStoredUnreadCount = (entityOrId, unreadMap = {}) => {
  const key = getConversationKey(entityOrId);
  if (!key) return 0;
  const rawValue = unreadMap[key];
  const parsed = Number(rawValue);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
};

const summarizeMessageContent = (message) => {
  if (!message) return "Sent an update";
  if (message.text?.trim()) return message.text.trim();
  if (message.image) return "Shared an image";
  if (message.audio) return "Voice message";
  if (message.file) {
    return message.fileName ? `Shared ${message.fileName}` : "Shared a document";
  }
  return "Sent an update";
};

const isCallMessage = (message) =>
  Boolean(message) && (message.messageType === "call" || Boolean(message.callMetadata));

const formatCallDuration = (seconds = 0) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const buildCallPreviewText = (message, viewerId) => {
  if (!isCallMessage(message)) return "Call";
  const metadata = message.callMetadata || {};
  const callLabel = metadata.callType === "audio" ? "voice call" : "video call";
  const status = (metadata.status || "").toLowerCase();
  const initiatedByMe = normalizeId(metadata.initiatedBy) === normalizeId(viewerId);
  const endedByMe = normalizeId(metadata.endedBy) === normalizeId(viewerId);
  const duration = formatCallDuration(Number(metadata.durationSeconds) || 0);

  switch (status) {
    case "completed":
      return duration ? `${callLabel} \u00b7 ${duration}` : `Completed ${callLabel}`;
    case "missed":
    case "unanswered":
      return initiatedByMe ? `No answer (${callLabel})` : `Missed ${callLabel}`;
    case "declined":
      return endedByMe ? `You declined the ${callLabel}` : `Declined ${callLabel}`;
    case "cancelled":
      return initiatedByMe ? `Cancelled ${callLabel}` : `Call cancelled`;
    case "busy":
      return initiatedByMe ? `User busy (${callLabel})` : `You were busy (${callLabel})`;
    case "failed":
      return `Call failed (${callLabel})`;
    default:
      return callLabel;
  }
};

export const buildChatPreview = (chat, authUser) => {
  if (!chat) return "";
  if (!chat.lastMessage) {
    if (chat.isGroup) {
      const count = chat.memberCount ?? chat.members?.length ?? 0;
      return count ? `${count} member${count === 1 ? "" : "s"}` : "New group";
    }
    return "Start chatting";
  }

  const senderId = getSenderId(chat.lastMessage);
  const myId = normalizeId(authUser?._id);
  const isOwnMessage = myId && senderId === myId;
  const senderName = isOwnMessage ? "You" : chat.lastMessage.sender?.fullName || "Someone";
  const isCall = isCallMessage(chat.lastMessage);
  const content = isCall
    ? buildCallPreviewText(chat.lastMessage, authUser?._id)
    : summarizeMessageContent(chat.lastMessage);

  if (chat.isGroup) {
    return `${senderName}: ${content}`;
  }
  return isOwnMessage ? `You: ${content}` : content;
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isConversationUnread = (conversation, authUserId, seenMap = {}) => {
  if (!conversation?.lastMessage) return false;
  const senderId = getSenderId(conversation.lastMessage);
  const myId = normalizeId(authUserId);
  if (myId && senderId === myId) return false;

  const lastMessageDate = parseTimestamp(conversation.lastMessage.createdAt);
  if (!lastMessageDate) return false;

  if (conversation.isGroup) {
    const key = getConversationKey(conversation);
    const seenDate = key && seenMap[key] ? parseTimestamp(seenMap[key]) : null;
    return !seenDate || lastMessageDate.getTime() > seenDate.getTime();
  }

  const status = (conversation.lastMessage.status || "").toLowerCase();
  if (status && status !== "read") {
    return true;
  }

  const key = getConversationKey(conversation);
  const seenDate = key && seenMap[key] ? parseTimestamp(seenMap[key]) : null;
  return lastMessageDate && seenDate ? lastMessageDate.getTime() > seenDate.getTime() : false;
};
