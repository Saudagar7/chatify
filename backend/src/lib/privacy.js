import Message from "../models/message.js";
import Group from "../models/Group.js";
import { PRIVACY_DEFAULTS, PRIVACY_VISIBILITY_OPTIONS } from "../constants/privacy.js";

const toPlainObject = (doc) => {
  if (!doc) return null;
  if (typeof doc.toObject === "function") {
    return doc.toObject({ depopulate: true });
  }
  return { ...doc };
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
  }
  return value.toString?.() || "";
};

const buildMessageContacts = (messages = [], viewerId) => {
  const contacts = new Set();
  messages.forEach((msg) => {
    const senderId = normalizeId(msg.senderId);
    const receiverId = normalizeId(msg.receiverId);
    if (senderId && senderId !== viewerId) {
      contacts.add(senderId);
    }
    if (receiverId && receiverId !== viewerId) {
      contacts.add(receiverId);
    }
  });
  return contacts;
};

const buildGroupContacts = (groups = [], viewerId) => {
  const contacts = new Set();
  groups.forEach((group) => {
    (group.members || []).forEach((member) => {
      const memberId = normalizeId(member);
      if (memberId && memberId !== viewerId) {
        contacts.add(memberId);
      }
    });
  });
  return contacts;
};

export const computeContactSetForUser = async (userId) => {
  const viewerId = normalizeId(userId);
  if (!viewerId) return new Set();

  const [messages, groups] = await Promise.all([
    Message.find({
      $or: [
        { senderId: viewerId },
        { receiverId: viewerId },
      ],
    })
      .select("senderId receiverId")
      .lean(),
    Group.find({ members: viewerId }).select("members").lean(),
  ]);

  const contacts = buildMessageContacts(messages, viewerId);
  const groupContacts = buildGroupContacts(groups, viewerId);
  groupContacts.forEach((contactId) => contacts.add(contactId));

  return contacts;
};

export const normalizePrivacySettings = (settings = {}) => {
  const normalized = {
    ...PRIVACY_DEFAULTS,
  };

  if (settings && PRIVACY_VISIBILITY_OPTIONS.includes(settings.profilePhoto)) {
    normalized.profilePhoto = settings.profilePhoto;
  }

  if (Array.isArray(settings?.profilePhotoExceptions)) {
    normalized.profilePhotoExceptions = settings.profilePhotoExceptions.map((value) => value);
  } else {
    normalized.profilePhotoExceptions = [];
  }

  return normalized;
};

export const shouldShowProfilePhoto = (
  userDoc,
  viewerId,
  viewerContacts = new Set()
) => {
  if (!userDoc) return false;
  const viewer = normalizeId(viewerId);
  const ownerId = normalizeId(userDoc._id || userDoc.id);
  if (!ownerId) return false;

  if (viewer && viewer === ownerId) {
    return true;
  }

  const settings = normalizePrivacySettings(userDoc.privacySettings || {});
  const exceptions = new Set(
    (settings.profilePhotoExceptions || [])
      .map((value) => normalizeId(value))
      .filter(Boolean)
  );
  const isException = viewer && exceptions.has(viewer);

  switch (settings.profilePhoto) {
    case "everyone":
      return true;
    case "nobody":
      return false;
    case "contacts":
      return viewerContacts?.has(ownerId) || false;
    case "contactsExcept":
      return (viewerContacts?.has(ownerId) || false) && !isException;
    default:
      return true;
  }
};

export const sanitizeUserForViewer = (userDoc, viewerId, viewerContacts = new Set()) => {
  if (!userDoc) return null;
  const plain = toPlainObject(userDoc);
  if (!plain) return null;

  if (!shouldShowProfilePhoto(userDoc, viewerId, viewerContacts)) {
    plain.profilePic = "";
  }

  return plain;
};

export const sanitizeUsersForViewer = (users = [], viewerId, viewerContacts = new Set()) =>
  users.map((user) => sanitizeUserForViewer(user, viewerId, viewerContacts));
