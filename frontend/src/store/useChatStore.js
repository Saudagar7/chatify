import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import {
  normalizeId,
  sortByLastMessage,
  getConversationKey,
  isConversationUnread,
  getStoredUnreadCount,
} from "../lib/conversationUtils";
import { chatSoundEngine } from "../lib/chatSounds";

const CONVERSATION_SEEN_KEY = "chatConversationSeenAt";
const CONVERSATION_UNREAD_KEY = "chatConversationUnreadCounts";

const safeReadStorage = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn("Unable to read from storage", error);
    return fallback;
  }
};

const safeWriteStorage = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to persist to storage", error);
  }
};

const storedConversationSeenAt = safeReadStorage(CONVERSATION_SEEN_KEY, {});
const storedConversationUnreadCounts = safeReadStorage(CONVERSATION_UNREAD_KEY, {});
const unreadHydrationInFlight = new Set();

const ensureIsoTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const updateSeenMapEntry = (currentMap, key, timestamp) => {
  if (!key) return { map: currentMap, changed: false };
  const isoTimestamp = ensureIsoTimestamp(timestamp);
  const nextTime = new Date(isoTimestamp).getTime();
  const currentValue = currentMap[key];
  if (currentValue) {
    const currentTime = new Date(currentValue).getTime();
    if (currentTime >= nextTime) {
      return { map: currentMap, changed: false };
    }
  }
  return { map: { ...currentMap, [key]: isoTimestamp }, changed: true };
};

const persistSeenMapIfNeeded = (map, changed) => {
  if (changed) {
    safeWriteStorage(CONVERSATION_SEEN_KEY, map);
  }
};

const updateUnreadCountEntry = (currentMap = {}, key, updater) => {
  if (!key || typeof updater !== "function") {
    return { map: currentMap, changed: false };
  }
  const previous = Number(currentMap[key]) || 0;
  const next = Math.max(0, Math.round(updater(previous) || 0));
  if (next === previous) {
    return { map: currentMap, changed: false };
  }
  const nextMap = { ...currentMap };
  if (next === 0) {
    delete nextMap[key];
  } else {
    nextMap[key] = next;
  }
  return { map: nextMap, changed: true };
};

const persistUnreadMapIfNeeded = (map, changed) => {
  if (changed) {
    safeWriteStorage(CONVERSATION_UNREAD_KEY, map);
  }
};

const toEpochMillis = (value) => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const countUnreadFromMessages = (messages = [], partnerId, seenTimestamp) => {
  if (!partnerId) return 0;
  const seenTime = toEpochMillis(seenTimestamp);
  return messages.reduce((total, message) => {
    if (normalizeId(message.senderId) !== partnerId) return total;
    const status = (message.status || "").toLowerCase();
    if (status === "read") return total;
    const created = toEpochMillis(message.createdAt);
    if (seenTime && created && created <= seenTime) return total;
    return total + 1;
  }, 0);
};

const updateCollectionWithMessage = (items = [], itemId, message) => {
  if (!itemId || !message) return items;
  const targetId = normalizeId(itemId);
  let updated = false;
  const nextItems = items.map((item) => {
    if (normalizeId(item._id) === targetId) {
      updated = true;
      return { ...item, lastMessage: message };
    }
    return item;
  });
  return updated ? sortByLastMessage(nextItems) : items;
};

const enhanceGroup = (group) => {
  if (!group) return group;
  const memberCount = group.members?.length ?? group.memberCount ?? 0;
  return {
    ...group,
    name: group.name || group.fullName || "Untitled group",
    fullName: group.fullName || group.name || "Untitled group",
    isGroup: true,
    memberCount,
  };
};

const rehydrateSelectedGroup = (groups, selectedUser) => {
  if (!selectedUser?.isGroup) return selectedUser;
  const match = groups.find((group) => normalizeId(group._id) === normalizeId(selectedUser._id));
  return match ? enhanceGroup(match) : null;
};

const storedActiveTab = localStorage.getItem("chatActiveTab") ?? "chats";
const storedSelectedUser = localStorage.getItem("chatSelectedUser");

const DEFAULT_MESSAGE_LIMIT = 50;
const EMPTY_PAGE_INFO = {
  hasOlder: false,
  hasNewer: false,
  oldestCursor: null,
  newestCursor: null,
  limit: DEFAULT_MESSAGE_LIMIT,
};

const normalizePageInfo = (info) => ({
  hasOlder: Boolean(info?.hasOlder),
  hasNewer: Boolean(info?.hasNewer),
  oldestCursor: info?.oldestCursor || null,
  newestCursor: info?.newestCursor || null,
  limit: info?.limit || DEFAULT_MESSAGE_LIMIT,
});

const hasUnreadFromPartner = (messages, partnerId) =>
  messages.some(
    (msg) => normalizeId(msg.senderId) === partnerId && msg.status !== "read"
  );

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  groups: [],
  messages: [],
  activeTab: storedActiveTab,
  selectedUser: storedSelectedUser ? JSON.parse(storedSelectedUser) : null,
  isUsersLoading: false,
  isGroupsLoading: false,
  isMessagesLoading: false,
  messagePageInfo: EMPTY_PAGE_INFO,
  isOlderMessagesLoading: false,
  isJumpingToDate: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  editingMessage: null,
  conversationSeenAt: storedConversationSeenAt,
  conversationUnreadCounts: storedConversationUnreadCounts,

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => {
    localStorage.setItem("chatActiveTab", tab);
    set({ activeTab: tab });
  },
  setSelectedUser: (selectedUser) => {
    if (!selectedUser) {
      localStorage.removeItem("chatSelectedUser");
      set({
        selectedUser: null,
        editingMessage: null,
        messages: [],
        messagePageInfo: EMPTY_PAGE_INFO,
      });
      return;
    }

    const normalizedUser = selectedUser.isGroup
      ? enhanceGroup(selectedUser)
      : selectedUser._id
      ? selectedUser
      : selectedUser.id
      ? { ...selectedUser, _id: selectedUser.id }
      : selectedUser;

    localStorage.setItem("chatSelectedUser", JSON.stringify(normalizedUser));
    set((state) => {
      const currentUser = state.selectedUser;
      const isSameConversation =
        currentUser?._id &&
        normalizeId(currentUser._id) === normalizeId(normalizedUser._id) &&
        (!!currentUser.isGroup === !!normalizedUser.isGroup);

      const updates = {
        selectedUser: normalizedUser,
        editingMessage: null,
        messages: isSameConversation ? state.messages : [],
        messagePageInfo: isSameConversation ? state.messagePageInfo : EMPTY_PAGE_INFO,
      };

      const conversationKey = getConversationKey(normalizedUser);
      if (conversationKey) {
        const { map: seenMap, changed: seenChanged } = updateSeenMapEntry(
          state.conversationSeenAt,
          conversationKey,
          normalizedUser.lastMessage?.createdAt || new Date().toISOString()
        );
        if (seenChanged) {
          persistSeenMapIfNeeded(seenMap, seenChanged);
          updates.conversationSeenAt = seenMap;
        }

        const { map: unreadMap, changed: unreadChanged } = updateUnreadCountEntry(
          state.conversationUnreadCounts,
          conversationKey,
          () => 0
        );
        if (unreadChanged) {
          persistUnreadMapIfNeeded(unreadMap, unreadChanged);
          updates.conversationUnreadCounts = unreadMap;
        }
      }

      return updates;
    });
  },
  setEditingMessage: (message) => set({ editingMessage: message }),
  clearEditingMessage: () => set({ editingMessage: null }),

  hydrateUnreadCountsForConversations: async (conversations = []) => {
    if (!Array.isArray(conversations) || !conversations.length) return;
    const authUserId = useAuthStore.getState().authUser?._id;
    if (!authUserId) return;

    const snapshot = get();
    const candidates = conversations
      .filter((conversation) => {
        if (!conversation || conversation.isGroup) return false;
        const storedCount = getStoredUnreadCount(conversation, snapshot.conversationUnreadCounts);
        if (storedCount > 0) return false;
        return isConversationUnread(conversation, authUserId, snapshot.conversationSeenAt);
      });

    for (const conversation of candidates) {
      const partnerId = normalizeId(conversation._id);
      const conversationKey = getConversationKey(conversation);
      if (!partnerId || !conversationKey || unreadHydrationInFlight.has(conversationKey)) {
        continue;
      }

      unreadHydrationInFlight.add(conversationKey);
      try {
        const res = await axiosInstance.get(`/messages/${partnerId}`, {
          params: { limit: Math.max(DEFAULT_MESSAGE_LIMIT, 200) },
        });
        const payload = res.data || {};
        const messages = payload.messages || payload;
        const seenTimestamp = get().conversationSeenAt[conversationKey];
        const unreadCount = countUnreadFromMessages(messages, partnerId, seenTimestamp);
        if (unreadCount > 0) {
          set((state) => {
            const { map, changed } = updateUnreadCountEntry(
              state.conversationUnreadCounts,
              conversationKey,
              () => unreadCount
            );
            if (!changed) return {};
            persistUnreadMapIfNeeded(map, changed);
            return { conversationUnreadCounts: map };
          });
        }
      } catch (error) {
        console.warn(
          "Unable to hydrate unread count",
          error?.response?.data?.message || error.message
        );
      } finally {
        unreadHydrationInFlight.delete(conversationKey);
      }
    }
  },

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/contacts");
      const contacts = res.data || [];
      set((state) => {
        const updates = { allContacts: contacts };
        if (state.selectedUser && !state.selectedUser.isGroup) {
          const refreshed = contacts.find(
            (contact) => normalizeId(contact._id) === normalizeId(state.selectedUser._id)
          );
          if (refreshed) {
            updates.selectedUser = refreshed;
            localStorage.setItem("chatSelectedUser", JSON.stringify(refreshed));
          }
        }
        return updates;
      });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },
  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/chats");
      const sortedChats = sortByLastMessage(res.data || []);
      set((state) => {
        const updates = { chats: sortedChats };
        if (state.selectedUser && !state.selectedUser.isGroup) {
          const refreshed = sortedChats.find(
            (chat) => normalizeId(chat._id) === normalizeId(state.selectedUser._id)
          );
          if (refreshed) {
            updates.selectedUser = refreshed;
            localStorage.setItem("chatSelectedUser", JSON.stringify(refreshed));
          }
        }
        return updates;
      });
      get().hydrateUnreadCountsForConversations(sortedChats);
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMyGroups: async () => {
    set({ isGroupsLoading: true });
    try {
      const res = await axiosInstance.get("/groups");
      const enhancedGroups = sortByLastMessage((res.data || []).map(enhanceGroup));

      set((state) => {
        const updates = { groups: enhancedGroups, isGroupsLoading: false };
        if (state.selectedUser?.isGroup) {
          const refreshed = rehydrateSelectedGroup(enhancedGroups, state.selectedUser);
          if (refreshed) {
            updates.selectedUser = refreshed;
            localStorage.setItem("chatSelectedUser", JSON.stringify(refreshed));
          } else {
            updates.selectedUser = null;
            updates.messages = [];
            localStorage.removeItem("chatSelectedUser");
          }
        }
        return updates;
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load groups");
      set({ isGroupsLoading: false });
    }
  },

  getMessagesByUserId: async (userId, params = {}) => {
    if (!userId) return;
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`, {
        params: {
          limit: params.limit || DEFAULT_MESSAGE_LIMIT,
        },
      });
      const payload = res.data || {};
      const fetchedMessages = payload.messages || [];
      const pageInfo = normalizePageInfo(payload.pageInfo);

      set({
        messages: fetchedMessages,
        messagePageInfo: pageInfo,
        isMessagesLoading: false,
      });

      const partnerId = normalizeId(userId);
      if (hasUnreadFromPartner(fetchedMessages, partnerId)) {
        await get().markConversationAsRead(partnerId);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
      set({
        isMessagesLoading: false,
        messages: [],
        messagePageInfo: EMPTY_PAGE_INFO,
      });
    }
  },
  fetchOlderMessages: async (userId) => {
    const { messagePageInfo, isOlderMessagesLoading } = get();
    if (!userId || isOlderMessagesLoading) return { fetchedCount: 0 };
    if (!messagePageInfo?.hasOlder || !messagePageInfo?.oldestCursor) {
      return { fetchedCount: 0 };
    }

    set({ isOlderMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`, {
        params: {
          cursor: messagePageInfo.oldestCursor,
          direction: "older",
          limit: messagePageInfo.limit || DEFAULT_MESSAGE_LIMIT,
        },
      });
      const payload = res.data || {};
      const olderMessages = payload.messages || [];
      const incomingInfo = normalizePageInfo(payload.pageInfo);

      set((state) => ({
        messages: olderMessages.length ? [...olderMessages, ...state.messages] : state.messages,
        messagePageInfo: olderMessages.length
          ? {
              ...state.messagePageInfo,
              ...incomingInfo,
              newestCursor: state.messagePageInfo?.newestCursor || incomingInfo.newestCursor,
              hasNewer: state.messagePageInfo?.hasNewer || incomingInfo.hasNewer,
            }
          : { ...state.messagePageInfo, ...incomingInfo },
        isOlderMessagesLoading: false,
      }));

      return { fetchedCount: olderMessages.length };
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load older messages");
      set({ isOlderMessagesLoading: false });
      return { fetchedCount: 0, error: true };
    }
  },
  jumpToDate: async (userId, dateISO) => {
    if (!userId || !dateISO) {
      toast.error("Select a date to jump");
      return { fetchedCount: 0 };
    }
    set({ isJumpingToDate: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`, {
        params: { date: dateISO, limit: DEFAULT_MESSAGE_LIMIT },
      });
      const payload = res.data || {};
      const chunk = payload.messages || [];
      const pageInfo = normalizePageInfo(payload.pageInfo);

      set({
        messages: chunk,
        messagePageInfo: pageInfo,
        isJumpingToDate: false,
      });

      const partnerId = normalizeId(userId);
      if (hasUnreadFromPartner(chunk, partnerId)) {
        await get().markConversationAsRead(partnerId);
      }

      return { fetchedCount: chunk.length };
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to jump to that date");
      set({ isJumpingToDate: false });
      return { fetchedCount: 0, error: true };
    }
  },

  getGroupMessages: async (groupId) => {
    if (!groupId) return;
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      set({ messages: res.data, messagePageInfo: EMPTY_PAGE_INFO });
    } catch (error) {
      const status = error.response?.status;
      if (status === 403) {
        toast.error("You are no longer a member of this group");
        get().setSelectedUser(null);
      } else {
        toast.error(error.response?.data?.message || "Unable to load group messages");
      }
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, isSoundEnabled } = get();
    if (!selectedUser?._id) {
      toast.error("Select a conversation first");
      return;
    }

    if (isSoundEnabled) {
      chatSoundEngine.playOutgoing();
    }

    const { authUser } = useAuthStore.getState();
    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      text: messageData.text,
      image: messageData.image,
      audio: messageData.audio,
      audioDuration: messageData.audioDuration,
      file: messageData.file,
      fileName: messageData.fileName,
      fileSize: messageData.fileSize,
      fileType: messageData.fileType,
      createdAt: new Date().toISOString(),
      status: "sending",
      isOptimistic: true,
      ...(selectedUser.isGroup
        ? { groupId: selectedUser._id, sender: authUser }
        : { receiverId: selectedUser._id }),
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      editingMessage: null,
    }));

    try {
      const url = selectedUser.isGroup
        ? `/groups/${selectedUser._id}/messages`
        : `/messages/send/${selectedUser._id}`;
      const res = await axiosInstance.post(url, messageData);
      set((state) => ({
        messages: state.messages.map((msg) => (msg._id === tempId ? res.data : msg)),
        messagePageInfo: state.messagePageInfo
          ? { ...state.messagePageInfo, newestCursor: res.data.createdAt, hasNewer: false }
          : state.messagePageInfo,
      }));
      set((state) => {
        const updates = {};
        if (selectedUser.isGroup) {
          updates.groups = updateCollectionWithMessage(state.groups, selectedUser._id, res.data);
        } else {
          updates.chats = updateCollectionWithMessage(state.chats, selectedUser._id, res.data);
        }

        if (
          state.selectedUser?._id &&
          normalizeId(state.selectedUser._id) === normalizeId(selectedUser._id) &&
          (!!state.selectedUser.isGroup === !!selectedUser.isGroup)
        ) {
          const refreshedSelection = { ...state.selectedUser, lastMessage: res.data };
          updates.selectedUser = refreshedSelection;
          localStorage.setItem("chatSelectedUser", JSON.stringify(refreshedSelection));
        }

        return updates;
      });
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
      toast.error(error.response?.data?.message || "Something went wrong");
    }
  },

  forwardMessages: async ({ sourceId, sourceType, targets }) => {
    const safeSourceId = normalizeId(sourceId);
    if (!safeSourceId || !Array.isArray(targets) || !targets.length) {
      toast.error("Select at least one chat to forward the message");
      return { forwarded: [], errors: [] };
    }

    try {
      const res = await axiosInstance.post("/messages/forward", {
        sourceMessageId: safeSourceId,
        sourceType: sourceType === "group" ? "group" : "direct",
        targets: targets.map((target) => ({
          type: target.type === "group" ? "group" : "user",
          id: normalizeId(target.id),
        })),
      });

      const forwarded = res.data?.forwarded || [];
      const errors = res.data?.errors || [];

      if (forwarded.length) {
        set((state) => {
          let nextChats = state.chats;
          let nextGroups = state.groups;
          let nextMessages = state.messages;
          let nextSelectedUser = state.selectedUser;
          let selectionUpdated = false;
          let nextPageInfo = state.messagePageInfo;

          forwarded.forEach((entry) => {
            const normalizedTargetId = normalizeId(entry.targetId);
            if (entry.targetType === "group") {
              nextGroups = updateCollectionWithMessage(nextGroups, normalizedTargetId, entry.message);
              if (
                nextSelectedUser?.isGroup &&
                normalizeId(nextSelectedUser._id) === normalizedTargetId
              ) {
                nextMessages = [...nextMessages, entry.message];
                nextSelectedUser = { ...nextSelectedUser, lastMessage: entry.message };
                selectionUpdated = true;
                if (nextPageInfo) {
                  nextPageInfo = {
                    ...nextPageInfo,
                    newestCursor: entry.message.createdAt,
                    hasNewer: false,
                  };
                }
              }
            } else {
              nextChats = updateCollectionWithMessage(nextChats, normalizedTargetId, entry.message);
              if (
                nextSelectedUser &&
                !nextSelectedUser.isGroup &&
                normalizeId(nextSelectedUser._id) === normalizedTargetId
              ) {
                nextMessages = [...nextMessages, entry.message];
                nextSelectedUser = { ...nextSelectedUser, lastMessage: entry.message };
                selectionUpdated = true;
                if (nextPageInfo) {
                  nextPageInfo = {
                    ...nextPageInfo,
                    newestCursor: entry.message.createdAt,
                    hasNewer: false,
                  };
                }
              }
            }
          });

          if (selectionUpdated && nextSelectedUser) {
            localStorage.setItem("chatSelectedUser", JSON.stringify(nextSelectedUser));
          }

          return {
            chats: nextChats,
            groups: nextGroups,
            messages: nextMessages,
            selectedUser: nextSelectedUser,
            messagePageInfo: selectionUpdated ? nextPageInfo : state.messagePageInfo,
          };
        });

        toast.success(
          `Forwarded to ${forwarded.length} chat${forwarded.length === 1 ? "" : "s"}`
        );
      }

      if (errors.length) {
        toast.error(errors[0]?.reason || "Some chats could not be updated");
      }

      return { forwarded, errors };
    } catch (error) {
      const message = error.response?.data?.message || "Unable to forward message";
      toast.error(message);
      return { forwarded: [], errors: [{ reason: message }] };
    }
  },

  markConversationAsRead: async (partnerId) => {
    const normalizedPartnerId = normalizeId(partnerId);
    if (!normalizedPartnerId) return;

    try {
      const res = await axiosInstance.post(`/messages/${normalizedPartnerId}/read`);
      const updatedIds = res.data?.updatedMessageIds || [];
      if (!updatedIds.length) return;

      const updatedIdSet = new Set(updatedIds.map((id) => normalizeId(id)));
      const timestamp = new Date().toISOString();

      set((state) => {
        const updateLastMessage = (entry) => {
          if (!entry?.lastMessage) return entry;
          if (!updatedIdSet.has(normalizeId(entry.lastMessage._id))) return entry;
          return {
            ...entry,
            lastMessage: {
              ...entry.lastMessage,
              status: "read",
              readAt: timestamp,
              deliveredAt: entry.lastMessage.deliveredAt || timestamp,
            },
          };
        };

        const updates = {
          messages: state.messages.map((msg) =>
            updatedIdSet.has(normalizeId(msg._id))
              ? {
                  ...msg,
                  status: "read",
                  readAt: timestamp,
                  deliveredAt: msg.deliveredAt || timestamp,
                }
              : msg
          ),
          chats: state.chats.map((chat) =>
            normalizeId(chat._id) === normalizedPartnerId ? updateLastMessage(chat) : chat
          ),
        };

        if (state.selectedUser && normalizeId(state.selectedUser._id) === normalizedPartnerId) {
          updates.selectedUser = updateLastMessage(state.selectedUser);
        }

        const conversationKey = getConversationKey(normalizedPartnerId, false);
        if (conversationKey) {
          const { map, changed } = updateSeenMapEntry(
            state.conversationSeenAt,
            conversationKey,
            timestamp
          );
          if (changed) {
            persistSeenMapIfNeeded(map, changed);
            updates.conversationSeenAt = map;
          }

          const { map: unreadMap, changed: unreadChanged } = updateUnreadCountEntry(
            state.conversationUnreadCounts,
            conversationKey,
            () => 0
          );
          if (unreadChanged) {
            persistUnreadMapIfNeeded(unreadMap, unreadChanged);
            updates.conversationUnreadCounts = unreadMap;
          }
        }

        return updates;
      });
    } catch (error) {
      console.error("Unable to mark messages as read", error.response?.data || error.message);
    }
  },

  updateMessage: async (messageId, text) => {
    const trimmed = text?.trim();
    if (!trimmed) {
      toast.error("Message cannot be empty");
      return;
    }
    try {
      const res = await axiosInstance.put(`/messages/edit/${messageId}`, { text: trimmed });
      set((state) => ({
        messages: state.messages.map((msg) => (msg._id === messageId ? res.data : msg)),
        editingMessage: null,
      }));
      toast.success("Message updated");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update message");
      return false;
    }
  },

  createGroup: async (groupData) => {
    try {
      const res = await axiosInstance.post("/groups", groupData);
      const newGroup = enhanceGroup(res.data);
      set((state) => ({
        groups: sortByLastMessage([
          newGroup,
          ...state.groups.filter((group) => normalizeId(group._id) !== normalizeId(newGroup._id)),
        ]),
      }));
      toast.success("Group created successfully");
      return newGroup;
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to create group");
      return null;
    }
  },

  addGroupMembers: async (groupId, memberIds = []) => {
    if (!groupId || memberIds.length === 0) {
      toast.error("Select at least one member to add");
      return false;
    }
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/members`, { memberIds });
      const updatedGroup = enhanceGroup(res.data);
      set((state) => {
        const updatedGroups = state.groups.map((group) =>
          normalizeId(group._id) === normalizeId(groupId) ? updatedGroup : group
        );
        const updates = { groups: sortByLastMessage(updatedGroups) };
        if (state.selectedUser?.isGroup && normalizeId(state.selectedUser._id) === normalizeId(groupId)) {
          updates.selectedUser = updatedGroup;
          localStorage.setItem("chatSelectedUser", JSON.stringify(updatedGroup));
        }
        return updates;
      });
      toast.success("Members added");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to add members");
      return false;
    }
  },

  removeGroupMember: async (groupId, memberId) => {
    if (!groupId || !memberId) {
      toast.error("Member selection is required");
      return false;
    }
    try {
      const res = await axiosInstance.delete(`/groups/${groupId}/members`, { data: { memberId } });
      const updatedGroup = enhanceGroup(res.data);
      set((state) => {
        const updatedGroups = state.groups.map((group) =>
          normalizeId(group._id) === normalizeId(groupId) ? updatedGroup : group
        );
        const updates = { groups: sortByLastMessage(updatedGroups) };
        if (state.selectedUser?.isGroup && normalizeId(state.selectedUser._id) === normalizeId(groupId)) {
          updates.selectedUser = updatedGroup;
          localStorage.setItem("chatSelectedUser", JSON.stringify(updatedGroup));
        }
        return updates;
      });
      toast.success("Member removed");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to remove member");
      return false;
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    const updateMessageStatuses = (messageIds = [], updates = {}) => {
      if (!messageIds.length) return;
      const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      );
      if (!Object.keys(sanitizedUpdates).length) return;

      const idSet = new Set(messageIds.map((id) => normalizeId(id)));

      set((state) => {
        const patchMessage = (message) =>
          idSet.has(normalizeId(message._id)) ? { ...message, ...sanitizedUpdates } : message;

        const patchChatEntry = (entry) => {
          if (!entry?.lastMessage) return entry;
          return idSet.has(normalizeId(entry.lastMessage._id))
            ? { ...entry, lastMessage: { ...entry.lastMessage, ...sanitizedUpdates } }
            : entry;
        };

        const updatesPayload = {
          messages: state.messages.map(patchMessage),
          chats: state.chats.map(patchChatEntry),
        };

        if (state.selectedUser?.lastMessage && idSet.has(normalizeId(state.selectedUser.lastMessage._id))) {
          updatesPayload.selectedUser = {
            ...state.selectedUser,
            lastMessage: { ...state.selectedUser.lastMessage, ...sanitizedUpdates },
          };
        }

        return updatesPayload;
      });
    };

    socket.on("newMessage", (newMessage) => {
      const { selectedUser: currentSelectedUser, isSoundEnabled } = get();
      const senderId = normalizeId(newMessage.senderId);
      const isActiveDirectConversation =
        currentSelectedUser &&
        !currentSelectedUser.isGroup &&
        normalizeId(currentSelectedUser._id) === senderId;

      if (isActiveDirectConversation) {
        set((state) => ({
          messages: [...state.messages, newMessage],
          messagePageInfo: state.messagePageInfo
            ? { ...state.messagePageInfo, newestCursor: newMessage.createdAt, hasNewer: false }
            : state.messagePageInfo,
        }));
        get().markConversationAsRead(senderId);
      }

      set((state) => {
        const updates = {
          chats: updateCollectionWithMessage(state.chats, senderId, newMessage),
        };

        if (!isActiveDirectConversation) {
          const conversationKey = getConversationKey(senderId, false);
          const { map, changed } = updateUnreadCountEntry(
            state.conversationUnreadCounts,
            conversationKey,
            (prev) => prev + 1
          );
          if (changed) {
            persistUnreadMapIfNeeded(map, changed);
            updates.conversationUnreadCounts = map;
          }
        }

        return updates;
      });

      if (isSoundEnabled) {
        chatSoundEngine.playIncoming();
      }
    });

    socket.on("messagesDelivered", ({ messageIds = [], deliveredAt }) => {
      updateMessageStatuses(messageIds, { status: "delivered", deliveredAt });
    });

    socket.on("messagesRead", ({ messageIds = [], readAt }) => {
      updateMessageStatuses(messageIds, {
        status: "read",
        readAt,
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("newMessage");
    socket.off("messagesDelivered");
    socket.off("messagesRead");
  },
}));