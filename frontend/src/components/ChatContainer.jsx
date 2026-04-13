import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CornerUpRightIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { CALL_STATES, useCallStore } from "../store/useCallStore";
import { useShallow } from "zustand/react/shallow";
import ChatHeader from "./ChatHeader";
import GroupInfoBar from "./GroupInfoBar";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import ContactProfileModal from "./ContactProfileModal";
import VideoCallOverlay from "./VideoCallOverlay";
import ForwardMessageModal from "./ForwardMessageModal";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import CallLogEntry from "./CallLogEntry";
import { useThemeStore } from "../store/useThemeStore";

const SEARCH_FILTERS = [
  { value: "all", label: "All" },
  { value: "media", label: "Media" },
  { value: "links", label: "Links" },
  { value: "docs", label: "Documents" },
  { value: "audio", label: "Audio" },
];
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const REACTION_TRAY_CLOSE_MS = 170;
const EDIT_WINDOW_MS = 5 * 60 * 1000;

const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasLinks = (text = "") => /(https?:\/\/|www\.)/i.test(text);

const matchesSearchFilter = (message = {}, filter = "all") => {
  switch (filter) {
    case "media":
      return Boolean(message.image || message.video || message.location);
    case "links":
      return Boolean(message.text && hasLinks(message.text));
    case "docs":
      return Boolean(message.file);
    case "audio":
      return Boolean(message.audio);
    default:
      return true;
  }
};

const isCallMessage = (message = {}) =>
  Boolean(message) && (message.messageType === "call" || Boolean(message.callMetadata));

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatDayLabel = (date) => {
  if (!date) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: today.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
};

const formatFileSize = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  const precision = value >= 10 || idx === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") {
    if (value._id) return value._id.toString?.() || "";
    if (value.id) return value.id.toString?.() || "";
  }
  return value.toString?.() || "";
};

const getPollSelectionsForUser = (poll = {}, userId) => {
  if (!poll || !Array.isArray(poll.options) || !userId) return [];
  const selections = [];
  poll.options.forEach((option) => {
    const voters = Array.isArray(option?.voters) ? option.voters : [];
    const hasVote = voters.some((voter) => normalizeId(voter?._id || voter?.id) === userId);
    if (hasVote && option?._id) {
      selections.push(option._id.toString?.() || option._id);
    }
  });
  return selections;
};

const buildReactionSummary = (reactions = [], myUserId = "") => {
  const summaryMap = new Map();
  reactions.forEach((reaction) => {
    const emoji = reaction?.emoji;
    if (!emoji) return;
    const reactorId = normalizeId(reaction?.userId);
    const existing = summaryMap.get(emoji) || { emoji, count: 0, reactedByMe: false };
    existing.count += 1;
    if (reactorId && myUserId && reactorId === myUserId) {
      existing.reactedByMe = true;
    }
    summaryMap.set(emoji, existing);
  });
  return Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);
};

const renderStatusIcon = (status = "sent") => {
  const baseClass = "h-3.5 w-3.5";
  switch (status) {
    case "read":
      return (
        <svg viewBox="0 0 20 20" className={`${baseClass} text-cyan-300`} aria-label="Read">
          <path d="M4 11l3.5 3.5L16 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 11l3.5 3.5L20 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "delivered":
      return (
        <svg viewBox="0 0 20 20" className={`${baseClass} text-slate-200`} aria-label="Delivered">
          <path d="M4 11l3.5 3.5L16 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 11l3.5 3.5L20 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sent":
      return (
        <svg viewBox="0 0 20 20" className={`${baseClass} text-slate-400`} aria-label="Sent">
          <path d="M3 11l4 4L17 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" className={`${baseClass} text-slate-500 animate-pulse`} aria-label="Sending">
          <path d="M3 11l4 4L17 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
};

const getMessageIdentity = (message) => {
  if (!message) return null;
  return (
    message._id ||
    message.id ||
    message.tempId ||
    (message.createdAt ? `${message.createdAt}-${message.senderId || ""}` : null)
  );
};

function ChatContainer({ onBackToList }) {
  const {
    messages,
    chats,
    groups,
    allContacts,
    getAllContacts,
    getMessagesByUserId,
    getGroupMessages,
    fetchOlderMessages,
    jumpToDate,
    messagePageInfo,
    isMessagesLoading,
    isOlderMessagesLoading,
    isJumpingToDate,
    selectedUser,
    setEditingMessage,
    reactToMessage,
    forwardMessages,
    voteOnPoll,
    clearConversation,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      chats: state.chats,
      groups: state.groups,
      allContacts: state.allContacts,
      getAllContacts: state.getAllContacts,
      getMessagesByUserId: state.getMessagesByUserId,
      getGroupMessages: state.getGroupMessages,
      fetchOlderMessages: state.fetchOlderMessages,
      jumpToDate: state.jumpToDate,
      messagePageInfo: state.messagePageInfo,
      isMessagesLoading: state.isMessagesLoading,
      isOlderMessagesLoading: state.isOlderMessagesLoading,
      isJumpingToDate: state.isJumpingToDate,
      selectedUser: state.selectedUser,
      setEditingMessage: state.setEditingMessage,
      reactToMessage: state.reactToMessage,
      forwardMessages: state.forwardMessages,
      voteOnPoll: state.voteOnPoll,
      clearConversation: state.clearConversation,
    }))
  );
  const { callState, startVideoCall } = useCallStore(
    useShallow((state) => ({
      callState: state.callState,
      startVideoCall: state.startVideoCall,
    }))
  );
  const authUser = useAuthStore((state) => state.authUser);
  const toggleBlockUser = useAuthStore((state) => state.toggleBlockUser);
  const toggleMode = useThemeStore((state) => state.toggleMode);
  const myUserId = useMemo(() => normalizeId(authUser?._id), [authUser?._id]);
  const blockedUsers = useMemo(
    () => new Set((authUser?.blockedUsers || []).map((id) => normalizeId(id))),
    [authUser?.blockedUsers]
  );
  const isSelectedUserBlocked = Boolean(
    selectedUser && !selectedUser.isGroup && blockedUsers.has(normalizeId(selectedUser._id))
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [isContactProfileOpen, setIsContactProfileOpen] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardContext, setForwardContext] = useState(null);
  const [jumpDate, setJumpDate] = useState("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [pendingNewMessages, setPendingNewMessages] = useState(0);
  const [quickReplyDraft, setQuickReplyDraft] = useState("");
  const [pollVoteBusyId, setPollVoteBusyId] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [closingReactionPickerMessageId, setClosingReactionPickerMessageId] = useState(null);
  const [lastTouchTap, setLastTouchTap] = useState({ messageId: null, at: 0 });

  const messageListRef = useRef(null);
  const messageRefs = useRef({});
  const skipAutoScrollRef = useRef(false);
  const isFetchingOlderRef = useRef(false);
  const previousConversationRef = useRef(null);
  const pendingInitialScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastMessageKeyRef = useRef(null);
  const reactionCloseTimerRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const container = messageListRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedUser?._id) return;
    if (selectedUser.isGroup) {
      getGroupMessages(selectedUser._id);
    } else {
      getMessagesByUserId(selectedUser._id);
    }
  }, [selectedUser?._id, selectedUser?.isGroup, getGroupMessages, getMessagesByUserId]);

  useEffect(() => {
    messageRefs.current = {};
  }, [selectedUser?._id]);

  useEffect(() => {
    const container = messageListRef.current;

    if (!messages.length) {
      lastMessageKeyRef.current = null;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const nextLastKey = getMessageIdentity(lastMessage);
    const previousKey = lastMessageKeyRef.current;
    const hasNewLastMessage = nextLastKey && nextLastKey !== previousKey;
    if (nextLastKey) {
      lastMessageKeyRef.current = nextLastKey;
    }

    if (!container || isMessagesLoading) {
      return;
    }

    if (!pendingInitialScrollRef.current && !hasNewLastMessage) {
      return;
    }

    if (pendingInitialScrollRef.current) {
      pendingInitialScrollRef.current = false;
      skipAutoScrollRef.current = false;
      scrollToBottom("auto");
      isNearBottomRef.current = true;
      setShowScrollToBottom(false);
      setPendingNewMessages(0);
      return;
    }

    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }

    const senderId = normalizeId(lastMessage?.senderId);
    const isOwnMessage = senderId && myUserId && senderId === myUserId;
    if (!isNearBottomRef.current && !isOwnMessage) {
      setPendingNewMessages((count) => count + 1);
      setShowScrollToBottom(true);
      return;
    }

    scrollToBottom(isOwnMessage ? "auto" : "smooth");
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setPendingNewMessages(0);
  }, [messages, myUserId, scrollToBottom, isMessagesLoading]);

  const conversationKey = selectedUser?._id
    ? `${selectedUser._id}-${selectedUser.isGroup ? "group" : "direct"}`
    : null;

  useEffect(() => {
    if (!conversationKey) {
      previousConversationRef.current = null;
      pendingInitialScrollRef.current = false;
      isNearBottomRef.current = true;
      setShowScrollToBottom(false);
      setPendingNewMessages(0);
      return;
    }
    const hasConversationChanged = previousConversationRef.current !== conversationKey;
    if (hasConversationChanged) {
      pendingInitialScrollRef.current = true;
      skipAutoScrollRef.current = false;
      isNearBottomRef.current = true;
      setShowScrollToBottom(false);
      setPendingNewMessages(0);
      if (!isMessagesLoading && messages.length) {
        pendingInitialScrollRef.current = false;
        scrollToBottom("auto");
        isNearBottomRef.current = true;
      }
    }
    previousConversationRef.current = conversationKey;
  }, [conversationKey, isMessagesLoading, messages.length, scrollToBottom]);

  useEffect(() => {
    if (isForwardModalOpen && !allContacts.length) {
      getAllContacts();
    }
  }, [isForwardModalOpen, allContacts.length, getAllContacts]);

  useEffect(() => {
    if (!selectedUser || selectedUser.isGroup) {
      setIsContactProfileOpen(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser && isForwardModalOpen) {
      setIsForwardModalOpen(false);
      setForwardContext(null);
    }
  }, [selectedUser, isForwardModalOpen]);

  useEffect(() => {
    setReactionPickerMessageId(null);
    setClosingReactionPickerMessageId(null);
    if (reactionCloseTimerRef.current) {
      clearTimeout(reactionCloseTimerRef.current);
      reactionCloseTimerRef.current = null;
    }
  }, [selectedUser?._id]);

  useEffect(() => {
    return () => {
      if (reactionCloseTimerRef.current) {
        clearTimeout(reactionCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeMatchId) return;
    const target = messageRefs.current[activeMatchId];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeMatchId]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = Boolean(normalizedQuery) || searchFilter !== "all";

  const textMatches = useMemo(() => {
    if (!isSearchActive) return [];
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => {
        if (!matchesSearchFilter(msg, searchFilter)) return false;
        if (!normalizedQuery) return true;
        return msg.text?.toLowerCase().includes(normalizedQuery);
      });
  }, [messages, normalizedQuery, searchFilter, isSearchActive]);

  useEffect(() => {
    if (activeMatchIndex >= textMatches.length) {
      setActiveMatchIndex(textMatches.length ? textMatches.length - 1 : 0);
    }
  }, [textMatches.length, activeMatchIndex]);

  const matchIdSet = useMemo(() => new Set(textMatches.map(({ msg }) => msg._id)), [textMatches]);

  const highlightText = (text = "") => {
    if (!normalizedQuery) return text;
    const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig");
    return text.split(regex).map((part, idx) =>
      part.toLowerCase() === normalizedQuery ? (
        <span key={`${part}-${idx}`} className="text-amber-300 font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const handleToggleSearch = () => {
    setIsSearchOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery("");
        setSearchFilter("all");
        setActiveMatchIndex(0);
        setActiveMatchId(null);
        setJumpDate("");
      }
      return next;
    });
  };

  const handleFilterChange = (value) => {
    setSearchFilter(value);
    setActiveMatchIndex(0);
    setActiveMatchId(null);
  };

  const handleMessageSelect = (targetIndex) => {
    if (!textMatches[targetIndex]) return;
    setActiveMatchIndex(targetIndex);
    setActiveMatchId(textMatches[targetIndex].msg._id);
  };

  const handleOpenForwardModal = (message) => {
    if (!message?._id) return;
    setForwardContext({
      message,
      sourceType: selectedUser?.isGroup ? "group" : "direct",
    });
    if (!allContacts.length) {
      getAllContacts();
    }
    setIsForwardModalOpen(true);
  };

  const handleForwardSubmit = async (targets) => {
    if (!forwardContext?.message?._id) return;
    const result = await forwardMessages({
      sourceId: forwardContext.message._id,
      sourceType: forwardContext.sourceType,
      targets,
    });
    if (result?.forwarded?.length) {
      setForwardContext(null);
      setIsForwardModalOpen(false);
    }
  };

  const handleCloseForwardModal = () => {
    setIsForwardModalOpen(false);
    setForwardContext(null);
  };

  const handleQuickReply = useCallback((text) => {
    if (!text) return;
    setQuickReplyDraft(text);
  }, []);

  const handleQuickReplyConsumed = useCallback(() => {
    setQuickReplyDraft("");
  }, []);

  const closeReactionPicker = useCallback((messageId) => {
    const targetId = messageId || reactionPickerMessageId;
    if (!targetId) {
      setReactionPickerMessageId(null);
      setClosingReactionPickerMessageId(null);
      return;
    }

    setReactionPickerMessageId((current) => (current === targetId ? null : current));
    setClosingReactionPickerMessageId(targetId);

    if (reactionCloseTimerRef.current) {
      clearTimeout(reactionCloseTimerRef.current);
    }

    reactionCloseTimerRef.current = setTimeout(() => {
      setClosingReactionPickerMessageId((current) =>
        current === targetId ? null : current
      );
      reactionCloseTimerRef.current = null;
    }, REACTION_TRAY_CLOSE_MS);
  }, [reactionPickerMessageId]);

  const handleApplyReaction = useCallback(
    async (messageId, emoji) => {
      if (!messageId) return;
      await reactToMessage({ messageId, emoji });
      closeReactionPicker(messageId);
    },
    [reactToMessage, closeReactionPicker]
  );

  const handleBubbleDoubleTap = useCallback(
    (messageId) => {
      if (!messageId) return;
      if (reactionPickerMessageId === messageId) {
        closeReactionPicker(messageId);
        return;
      }

      if (reactionPickerMessageId) {
        closeReactionPicker(reactionPickerMessageId);
      }

      setClosingReactionPickerMessageId((current) =>
        current === messageId ? null : current
      );
      setReactionPickerMessageId(messageId);
    },
    [reactionPickerMessageId, closeReactionPicker]
  );

  const handleBubbleTouchEnd = useCallback(
    (event, messageId) => {
      if (!messageId) return;
      if (event.target?.closest?.("button,a,input,textarea,select,video,audio")) {
        return;
      }
      const now = Date.now();
      const isDoubleTap =
        lastTouchTap.messageId === messageId && now - lastTouchTap.at <= 320;
      if (isDoubleTap) {
        event.preventDefault();
        handleBubbleDoubleTap(messageId);
        setLastTouchTap({ messageId: null, at: 0 });
        return;
      }
      setLastTouchTap({ messageId, at: now });
    },
    [lastTouchTap, handleBubbleDoubleTap]
  );

  const loadOlderChunk = useCallback(async () => {
    if (
      !selectedUser ||
      selectedUser.isGroup ||
      !messagePageInfo?.hasOlder ||
      isOlderMessagesLoading ||
      isFetchingOlderRef.current
    ) {
      return;
    }

    const container = messageListRef.current;
    if (!container) return;

    const previousHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;
    isFetchingOlderRef.current = true;
    const result = await fetchOlderMessages(selectedUser._id);
    skipAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop = newHeight - previousHeight + previousScrollTop;
      }
      isFetchingOlderRef.current = false;
    });
    return result;
  }, [
    selectedUser,
    messagePageInfo?.hasOlder,
    isOlderMessagesLoading,
    fetchOlderMessages,
  ]);

  const handleScrollToLatest = useCallback(() => {
    setPendingNewMessages(0);
    setShowScrollToBottom(false);
    isNearBottomRef.current = true;
    skipAutoScrollRef.current = false;
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = messageListRef.current;
    if (!container) return;
    if (container.scrollTop <= 120) {
      loadOlderChunk();
    }
    const distanceFromBottom =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    const isNearBottom = distanceFromBottom <= 160;
    isNearBottomRef.current = isNearBottom;
    setShowScrollToBottom((prev) => {
      const next = !isNearBottom;
      return prev === next ? prev : next;
    });
    if (isNearBottom) {
      setPendingNewMessages((count) => (count ? 0 : count));
    }
  }, [loadOlderChunk]);

  const handleJumpToDate = useCallback(
    async (event) => {
      event.preventDefault();
      if (!selectedUser?._id || !jumpDate) return;
      skipAutoScrollRef.current = true;
      const result = await jumpToDate(selectedUser._id, jumpDate);
      if (result?.fetchedCount) {
        setActiveMatchIndex(0);
        setActiveMatchId(null);
        requestAnimationFrame(() => {
          if (messageListRef.current) {
            messageListRef.current.scrollTop = 0;
          }
        });
      }
    },
    [jumpDate, jumpToDate, selectedUser]
  );

  const handleFileDownload = async (message) => {
    if (!message?.file) return;
    try {
      setDownloadingFileId(message._id);
      const response = await fetch(message.file, { mode: "cors" });
      if (!response.ok) {
        throw new Error("Failed to fetch attachment");
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = message.fileName || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Unable to download file", error);
      window.open(message.file, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handlePollOptionToggle = useCallback(
    async (message, optionId) => {
      if (
        !selectedUser?.isGroup ||
        !selectedUser?._id ||
        !message?._id ||
        !message?.poll ||
        !optionId ||
        pollVoteBusyId === message._id
      ) {
        return;
      }

      const normalizedOptionId = optionId.toString?.() || optionId;
      if (!normalizedOptionId) return;

      const currentSelections = getPollSelectionsForUser(message.poll, myUserId);
      let nextSelections;
      if (message.poll.allowMultiple) {
        const selectionSet = new Set(currentSelections);
        if (selectionSet.has(normalizedOptionId)) {
          selectionSet.delete(normalizedOptionId);
        } else {
          selectionSet.add(normalizedOptionId);
        }
        nextSelections = Array.from(selectionSet);
      } else {
        nextSelections = currentSelections.includes(normalizedOptionId)
          ? []
          : [normalizedOptionId];
      }

      try {
        setPollVoteBusyId(message._id);
        await voteOnPoll({
          groupId: selectedUser._id,
          messageId: message._id,
          optionIds: nextSelections,
        });
      } finally {
        setPollVoteBusyId(null);
      }
    },
    [selectedUser?.isGroup, selectedUser?._id, voteOnPoll, pollVoteBusyId, myUserId]
  );

  const handleMenuClearChat = useCallback(async () => {
    if (!selectedUser?._id || selectedUser.isGroup) return;
    const confirmed = window.confirm("Clear this chat for both participants?");
    if (!confirmed) return;
    await clearConversation(selectedUser._id);
  }, [selectedUser, clearConversation]);

  const handleMenuToggleBlock = useCallback(async () => {
    if (!selectedUser?._id || selectedUser.isGroup) return;
    await toggleBlockUser({
      targetUserId: selectedUser._id,
      shouldBlock: !isSelectedUserBlocked,
    });
  }, [selectedUser, toggleBlockUser, isSelectedUserBlocked]);

  const handleMenuOpenTheme = useCallback(() => {
    toggleMode();
  }, [toggleMode]);

  if (!selectedUser) {
    return null;
  }

  const displayName = selectedUser.fullName || selectedUser.name || "this contact";
  const isDirectConversation = Boolean(selectedUser && !selectedUser.isGroup);
  const canRetryCall = isDirectConversation && callState === CALL_STATES.IDLE;
  const retryCallHandler =
    isDirectConversation && typeof startVideoCall === "function"
      ? () => startVideoCall(selectedUser)
      : undefined;
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChatHeader
        onToggleSearch={handleToggleSearch}
        isSearchOpen={isSearchOpen}
        matchCount={textMatches.length}
        activeMatchIndex={activeMatchIndex}
        onShowProfile={() => setIsContactProfileOpen(true)}
        onBackToList={onBackToList}
        onMenuClearChat={handleMenuClearChat}
        onMenuToggleBlock={handleMenuToggleBlock}
        onMenuOpenTheme={handleMenuOpenTheme}
        isSelectedUserBlocked={isSelectedUserBlocked}
      />
      {selectedUser.isGroup && <GroupInfoBar group={selectedUser} />}
      {isSearchOpen && (
        <div className="border-b border-slate-800/60 bg-slate-900/60 px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setActiveMatchIndex(0);
                  setActiveMatchId(null);
                }}
                placeholder="Search messages in this chat"
                className="flex-1 rounded-lg border border-slate-700/70 bg-slate-800/40 px-4 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                  setActiveMatchIndex(0);
                  setActiveMatchId(null);
                  setSearchFilter("all");
                  setJumpDate("");
                }}
                className="rounded-full border border-slate-600/60 p-2 text-slate-400 hover:text-white"
                aria-label="Close search"
              >
                ×
              </button>
              <span className="text-xs text-slate-400 font-medium min-w-[140px] text-right">
                {isSearchActive
                  ? `${textMatches.length} result${textMatches.length === 1 ? "" : "s"}`
                  : "Type or filter to search"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {SEARCH_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => handleFilterChange(filter.value)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                    searchFilter === filter.value
                      ? "border-cyan-500/80 bg-cyan-500/10 text-cyan-200"
                      : "border-slate-700/70 text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {isSearchActive ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
                  Matching messages • {SEARCH_FILTERS.find((filter) => filter.value === searchFilter)?.label || "All"}
                </p>
                {textMatches.length ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {textMatches.map(({ msg }, idx) => (
                      <button
                        key={`${msg._id}-${idx}`}
                        type="button"
                        onClick={() => handleMessageSelect(idx)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          idx === activeMatchIndex
                            ? "border-cyan-500/70 bg-slate-800/80"
                            : "border-slate-700/60 bg-slate-800/40 hover:border-cyan-500/60 hover:bg-slate-800/70"
                        }`}
                      >
                        <p className="text-[11px] text-cyan-200 mb-1">
                          {new Date(msg.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-slate-100">
                          {normalizedQuery
                            ? highlightText(msg.text || "(no text)")
                            : msg.text || "(media message)"}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No message matches for this filter.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Start typing to search within this conversation, or use the filters above to browse media, links, and documents.
              </p>
            )}

            {!selectedUser.isGroup && (
              <form
                onSubmit={handleJumpToDate}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">Jump to date</p>
                  {messagePageInfo?.limit && (
                    <span className="text-xs text-slate-500">
                      Viewing {messagePageInfo.limit} at a time
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="date"
                    value={jumpDate}
                    onChange={(event) => setJumpDate(event.target.value)}
                    className="flex-1 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={!jumpDate || isJumpingToDate}
                    className="rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isJumpingToDate ? "Loading..." : "Go"}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Quickly load history near a specific day without endless scrolling.
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      <div
        ref={messageListRef}
        className="flex-1 min-h-0 px-6 overflow-y-auto overscroll-contain py-8"
        onScroll={handleScroll}
      >
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, index) => {
              const senderId = normalizeId(msg.senderId);
              const isOwnMessage = senderId === myUserId;
              const isGroupChat = Boolean(selectedUser.isGroup);
              const msgDate = new Date(msg.createdAt);
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
              const showDateDivider = !prevDate || !isSameDay(prevDate, msgDate);
              const isMatchedMessage = matchIdSet.has(msg._id);
              const isActiveMatch = activeMatchId === msg._id;
              const isCallEntry = isCallMessage(msg);
              const shouldShowStatus = isOwnMessage && !selectedUser.isGroup && !isCallEntry;
              const isEditable =
                !isCallEntry &&
                isOwnMessage &&
                !selectedUser.isGroup &&
                !msg.poll &&
                Date.now() - new Date(msg.createdAt).getTime() <= EDIT_WINDOW_MS;
              const hasAttachments = !isCallEntry && Boolean(msg.image || msg.video || msg.audio || msg.file);
              const pollOptions = msg.poll?.options || [];
              const myPollSelections = msg.poll ? getPollSelectionsForUser(msg.poll, myUserId) : [];
              const reactionSummary = buildReactionSummary(msg.reactions || [], myUserId);
              const hasReactions = reactionSummary.length > 0;
              const isReactionPickerOpen = reactionPickerMessageId === msg._id;
              const isReactionPickerClosing = closingReactionPickerMessageId === msg._id;
              const canReact = !msg.isOptimistic && !String(msg._id || "").startsWith("temp-");

              return (
                <div key={msg._id} className="space-y-3">
                  {showDateDivider && (
                    <div className="flex justify-center">
                      <span className="text-xs tracking-wide uppercase text-slate-400 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700/50">
                        {formatDayLabel(msgDate)}
                      </span>
                    </div>
                  )}
                  <div
                    ref={(el) => {
                      if (el) messageRefs.current[msg._id] = el;
                    }}
                    className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`group flex max-w-full sm:max-w-[80%] flex-col gap-1 ${
                        isOwnMessage ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`relative inline-flex max-w-full flex-col gap-2 rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-lg ${
                          isOwnMessage ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-200"
                        } ${
                          isMatchedMessage
                            ? "ring-2 ring-amber-300/60 shadow-amber-400/30"
                            : ""
                        } ${isActiveMatch ? "scale-[1.01]" : ""}`}
                        onDoubleClick={(event) => {
                          if (!canReact) return;
                          if (event.target?.closest?.("button,a,input,textarea,select,video,audio")) {
                            return;
                          }
                          handleBubbleDoubleTap(msg._id);
                        }}
                        onTouchEnd={(event) => {
                          if (!canReact) return;
                          handleBubbleTouchEnd(event, msg._id);
                        }}
                      >
                        {(isReactionPickerOpen || isReactionPickerClosing) && !isCallEntry && canReact && (
                          <div
                            className={`reaction-picker-tray ${
                              isReactionPickerClosing ? "reaction-picker-tray-closing" : ""
                            } absolute -top-14 z-20 flex items-center gap-1 rounded-full border border-slate-600/70 bg-slate-900/95 px-2 py-1 shadow-2xl ${
                              isOwnMessage ? "right-0" : "left-0"
                            }`}
                          >
                            {QUICK_REACTIONS.map((emoji, idx) => (
                              <button
                                key={`${msg._id}-${emoji}`}
                                type="button"
                                onClick={() => handleApplyReaction(msg._id, emoji)}
                                className="reaction-picker-emoji rounded-full px-2 py-1 text-lg transition hover:bg-slate-700/70"
                                style={{ animationDelay: isReactionPickerClosing ? "0ms" : `${idx * 36}ms` }}
                                aria-label={`React ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        {isEditable && !isCallEntry && (
                          <button
                            type="button"
                            onClick={() => setEditingMessage(msg)}
                            className="absolute -top-3 right-2 rounded-full bg-cyan-900/60 p-1 text-xs text-white/80 hover:bg-cyan-800"
                            aria-label="Edit message"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isCallEntry && (
                          <button
                            type="button"
                            onClick={() => handleOpenForwardModal(msg)}
                            className="absolute -top-3 left-2 rounded-full bg-slate-900/60 p-1 text-xs text-white/80 hover:bg-slate-800"
                            aria-label="Forward message"
                          >
                            <CornerUpRightIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isGroupChat && !isOwnMessage && (
                          <p className="text-xs font-semibold text-slate-200/80 mb-1">
                            {msg.sender?.fullName || "Member"}
                          </p>
                        )}
                        {isCallEntry ? (
                          <CallLogEntry
                            metadata={msg.callMetadata || {}}
                            authUserId={myUserId}
                            onCallAgain={retryCallHandler}
                            disableCallAgain={!canRetryCall}
                          />
                        ) : msg.poll ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-base">{msg.poll.question}</p>
                                <p className="text-xs text-slate-200/70">
                                  {msg.poll.allowMultiple ? "Multiple answers" : "Single answer"} • {msg.poll.totalVotes || 0} votes
                                </p>
                              </div>
                              {pollVoteBusyId === msg._id && (
                                <Loader2Icon className="h-4 w-4 animate-spin text-cyan-200" />
                              )}
                            </div>
                            <div className="space-y-2">
                              {pollOptions.map((option) => {
                                const optionId = option?._id?.toString?.() || option?._id || option?.label;
                                const voteCount = option.voteCount ?? option.voters?.length ?? 0;
                                const percentage = msg.poll.totalVotes
                                  ? Math.round((voteCount / msg.poll.totalVotes) * 100)
                                  : 0;
                                const isSelected = myPollSelections.includes(optionId);
                                const voterNames = (option.voters || []).map((voter) => voter?.fullName || "Member");

                                return (
                                  <button
                                    key={optionId}
                                    type="button"
                                    onClick={() => handlePollOptionToggle(msg, optionId)}
                                    disabled={pollVoteBusyId === msg._id}
                                    className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                                      isSelected
                                        ? "border-cyan-400/70 bg-cyan-500/10"
                                        : "border-slate-600/60 bg-slate-900/40 hover:border-cyan-400/40"
                                    } ${pollVoteBusyId === msg._id ? "opacity-70 cursor-wait" : ""}`}
                                  >
                                    <div className="flex items-center justify-between text-[13px] font-semibold">
                                      <span>{option.label}</span>
                                      <span>
                                        {voteCount} · {percentage}%
                                      </span>
                                    </div>
                                    <div className="mt-2 h-1.5 rounded-full bg-slate-700/60">
                                      <div
                                        className={`h-full rounded-full ${isSelected ? "bg-cyan-400" : "bg-slate-500/80"}`}
                                        style={{ width: `${msg.poll.totalVotes ? Math.max(5, percentage) : 5}%` }}
                                      />
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {voterNames.length ? voterNames.join(", ") : "No votes yet"}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.image && (
                              <img
                                src={msg.image}
                                alt="Shared"
                                className="rounded-xl max-h-60 w-full object-cover"
                              />
                            )}
                            {msg.video && (
                              <video
                                src={msg.video}
                                controls
                                className="mt-2 w-full rounded-xl border border-slate-600/60 bg-black"
                              />
                            )}
                            {msg.audio && (
                              <div className="mt-2">
                                <VoiceMessagePlayer
                                  src={msg.audio}
                                  duration={msg.audioDuration}
                                  intent={isOwnMessage ? "light" : "dark"}
                                />
                              </div>
                            )}
                            {msg.file && (
                              <button
                                type="button"
                                onClick={() => handleFileDownload(msg)}
                                disabled={downloadingFileId === msg._id}
                                className={`mt-2 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                                  isOwnMessage
                                    ? "border-white/30 bg-white/10"
                                    : "border-slate-600/60 bg-slate-900/40"
                                } ${
                                  downloadingFileId === msg._id
                                    ? "opacity-70 cursor-wait"
                                    : "hover:border-cyan-400/60"
                                }`}
                                aria-busy={downloadingFileId === msg._id}
                              >
                                <div className="flex items-center gap-3">
                                  <FileTextIcon className="w-4 h-4 text-amber-300" />
                                  <div className="text-left">
                                    <p className="font-medium truncate max-w-xs">
                                      {msg.fileName || "Shared file"}
                                    </p>
                                    {msg.fileSize && (
                                      <p className="text-xs opacity-70">{formatFileSize(msg.fileSize)}</p>
                                    )}
                                  </div>
                                </div>
                                {downloadingFileId === msg._id ? (
                                  <Loader2Icon className="w-4 h-4 animate-spin opacity-70" />
                                ) : (
                                  <DownloadIcon className="w-4 h-4 opacity-70" />
                                )}
                              </button>
                            )}
                            {msg.text && (
                              <p className={`${hasAttachments ? "pt-1" : ""} whitespace-pre-wrap break-words`}>
                                {isMatchedMessage && normalizedQuery ? highlightText(msg.text) : msg.text}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {hasReactions && !isCallEntry && canReact && (
                        <div
                          className={`mt-1 flex flex-wrap gap-1 ${
                            isOwnMessage ? "justify-end" : "justify-start"
                          }`}
                        >
                          {reactionSummary.map((reaction) => (
                            <button
                              key={`${msg._id}-reaction-${reaction.emoji}`}
                              type="button"
                              onClick={() =>
                                handleApplyReaction(
                                  msg._id,
                                  reaction.reactedByMe ? "" : reaction.emoji
                                )
                              }
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold transition ${
                                reaction.reactedByMe
                                  ? "border-cyan-300/80 bg-cyan-500/20 text-cyan-100"
                                  : "border-slate-600/70 bg-slate-900/60 text-slate-200 hover:border-cyan-400/60"
                              }`}
                              aria-label={`Reaction ${reaction.emoji}`}
                            >
                              <span>{reaction.emoji}</span>
                              <span className="ml-1">{reaction.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p
                        className={`text-xs flex items-center gap-1 opacity-70 ${
                          isOwnMessage ? "justify-end text-white/80" : "text-slate-400"
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {shouldShowStatus && renderStatusIcon(msg.status)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={displayName} onQuickReply={handleQuickReply} />
        )}
      </div>

      {showScrollToBottom && (
        <button
          type="button"
          onClick={handleScrollToLatest}
          className="absolute bottom-28 right-6 z-20 flex items-center gap-2 rounded-full bg-emerald-400/95 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-xl transition hover:bg-emerald-300/95"
          aria-label="Scroll to latest message"
        >
          {pendingNewMessages > 0 && (
            <span className="rounded-full bg-emerald-900/20 px-2 py-0.5 text-xs font-bold">
              {pendingNewMessages > 99 ? "99+" : pendingNewMessages}
            </span>
          )}
          <span>{pendingNewMessages > 0 ? "New messages" : "Latest"}</span>
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      )}

      <MessageInput
        prefillText={quickReplyDraft}
        onPrefillConsumed={handleQuickReplyConsumed}
      />
      <ContactProfileModal
        user={selectedUser}
        isOpen={Boolean(selectedUser) && !selectedUser.isGroup && isContactProfileOpen}
        onClose={() => setIsContactProfileOpen(false)}
      />
      <ForwardMessageModal
        isOpen={isForwardModalOpen}
        message={forwardContext?.message}
        sourceType={forwardContext?.sourceType}
        chats={chats}
        groups={groups}
        contacts={allContacts}
        onClose={handleCloseForwardModal}
        onSubmit={handleForwardSubmit}
      />
      <VideoCallOverlay />
    </div>
  );
}

export default ChatContainer;