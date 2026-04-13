import { computeContactSetForUser } from "./privacy.js";
import { sanitizeGroupMessageForViewer } from "./groupSanitizers.js";
import { getReceiverSocketId, io } from "./socket.js";

const toStringId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  return String(value);
};

export const broadcastGroupMessageEvent = async ({
  group,
  message,
  eventName = "group:newMessage",
  skipUserId,
} = {}) => {
  if (!group || !message) return;

  const members = Array.isArray(group.members) ? group.members : [];
  const skipId = toStringId(skipUserId);
  const recipients = [];
  const seen = new Set();

  members.forEach((member) => {
    const memberId = toStringId(member?._id || member);
    if (!memberId || memberId === skipId || seen.has(memberId)) {
      return;
    }
    seen.add(memberId);
    const socketId = getReceiverSocketId(memberId);
    if (socketId) {
      recipients.push({ memberId, socketId });
    }
  });

  await Promise.all(
    recipients.map(async ({ memberId, socketId }) => {
      try {
        const viewerContacts = await computeContactSetForUser(memberId);
        const payload = sanitizeGroupMessageForViewer(message, memberId, viewerContacts);
        io.to(socketId).emit(eventName, payload);
      } catch (error) {
        console.error(`Unable to emit ${eventName} to member ${memberId}`, error.message);
      }
    })
  );
};
