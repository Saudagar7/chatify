import {
  sanitizeUserForViewer,
  sanitizeUsersForViewer,
} from "./privacy.js";

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

const buildPollStats = (poll) => {
  if (!poll) return null;
  const options = (poll.options || []).map((option) => {
    const votersArray = Array.isArray(option.voters) ? option.voters : [];
    return {
      ...option,
      voters: votersArray,
      voteCount: votersArray.length,
    };
  });
  const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);
  return {
    ...poll,
    options,
    totalVotes,
  };
};

const sanitizePollForViewer = (poll, viewerId, viewerContacts) => {
  if (!poll) return null;
  const withStats = buildPollStats(poll);
  return {
    ...withStats,
    options: withStats.options.map((option) => ({
      ...option,
      voters: (option.voters || []).map((voter) =>
        sanitizeUserSnapshot(voter, viewerId, viewerContacts)
      ),
    })),
  };
};

export const sanitizeGroupMessageForViewer = (message, viewerId, viewerContacts) => {
  if (!message) return null;
  const serialized = serializeMessage(message);
  return {
    ...serialized,
    sender: sanitizeUserSnapshot(serialized.sender, viewerId, viewerContacts),
    poll: sanitizePollForViewer(serialized.poll, viewerId, viewerContacts),
  };
};

export const sanitizeGroupPayload = (group, viewerId, viewerContacts) => {
  if (!group) return group;
  const sanitizedMembers = sanitizeMemberList(group.members || [], viewerId, viewerContacts);
  const sanitizedAdmin = sanitizeUserSnapshot(group.admin, viewerId, viewerContacts);
  const sanitizedLastMessage = group.lastMessage
    ? sanitizeGroupMessageForViewer(group.lastMessage, viewerId, viewerContacts)
    : null;

  return {
    ...group,
    admin: sanitizedAdmin,
    members: sanitizedMembers,
    lastMessage: sanitizedLastMessage,
  };
};
