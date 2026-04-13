import {
  ArrowLeftIcon,
  BanIcon,
  MoreVerticalIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { CALL_STATES, useCallStore } from "../store/useCallStore";
import SettingsModal from "./SettingsModal";

const formatLastSeen = (value) => {
  if (!value) return "Offline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Offline";

  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isSameDay) {
    return `Last seen today at ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return `Last seen ${date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  })} at ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

function ChatHeader({
  onToggleSearch,
  isSearchOpen,
  matchCount,
  activeMatchIndex,
  onShowProfile,
  onBackToList,
  onMenuClearChat,
  onMenuToggleBlock,
  onMenuOpenTheme,
  isSelectedUserBlocked = false,
}) {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const startVideoCall = useCallStore((state) => state.startVideoCall);
  const callState = useCallStore((state) => state.callState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isGroup = selectedUser?.isGroup;
  const normalizedOnlineUsers = Array.isArray(onlineUsers)
    ? onlineUsers.map((id) => id?.toString?.() || id)
    : [];
  const selectedUserId = selectedUser?._id?.toString?.() || selectedUser?._id;
  const isOnline =
    !isGroup && (Boolean(selectedUser?.isOnline) || normalizedOnlineUsers.includes(selectedUserId));
  const isLastSeenVisible = selectedUser?.isLastSeenVisible !== false;

  const subtitle = isGroup
    ? `${selectedUser?.memberCount ?? selectedUser?.members?.length ?? 0} members`
    : isOnline
    ? "Online"
    : isLastSeenVisible
    ? formatLastSeen(selectedUser?.lastSeenAt)
    : "Last seen hidden";

  const canShowProfile = !isGroup && typeof onShowProfile === "function";

  const menuItems = useMemo(
    () => [
      {
        key: "block",
        label: isSelectedUserBlocked ? "Unblock" : "Block",
        icon: BanIcon,
        onClick: onMenuToggleBlock,
        disabled: isGroup || typeof onMenuToggleBlock !== "function",
      },
      {
        key: "clear",
        label: "Clear chat",
        icon: Trash2Icon,
        onClick: onMenuClearChat,
        disabled: isGroup || typeof onMenuClearChat !== "function",
      },
      {
        key: "theme",
        label: "Theme",
        icon: PaletteIcon,
        onClick: onMenuOpenTheme,
        disabled: typeof onMenuOpenTheme !== "function",
      },
    ],
    [isGroup, isSelectedUserBlocked, onMenuClearChat, onMenuOpenTheme, onMenuToggleBlock]
  );

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        if (isMenuOpen) {
          setIsMenuOpen(false);
          return;
        }
        setSelectedUser(null);
      }
    };

    const handleOutsideClick = (event) => {
      if (!isMenuOpen) return;
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.removeEventListener("keydown", handleEscKey);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [setSelectedUser, isMenuOpen]);

  const runMenuAction = (handler) => {
    if (typeof handler === "function") {
      handler();
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="flex items-center justify-between bg-slate-800/50 border-b border-slate-700/50 max-h-[84px] px-4 sm:px-6 flex-1">
      <div className="flex items-center gap-3">
        {typeof onBackToList === "function" && (
          <button
            type="button"
            onClick={onBackToList}
            className="rounded-full border border-slate-600/60 p-2 text-slate-300 hover:text-white hover:border-slate-500 transition-colors lg:hidden"
            aria-label="Back to chats"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (canShowProfile ? onShowProfile() : null)}
          className="flex items-center space-x-3 text-left"
          disabled={!canShowProfile}
        >
          <div className={`avatar ${isGroup ? "" : isOnline ? "online" : "offline"}`}>
            <div className="w-12 rounded-full">
              <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
            </div>
          </div>

          <div>
            <h3 className="text-slate-200 font-medium">{selectedUser.fullName}</h3>
            <p className={`text-sm ${isOnline ? "text-emerald-300" : "text-slate-400"}`}>{subtitle}</p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {!isGroup && (
          <button
            type="button"
            onClick={() => startVideoCall(selectedUser)}
            disabled={!selectedUser?._id || callState !== CALL_STATES.IDLE}
            className={`group relative rounded-full border border-slate-600/60 p-2 transition-colors ${
              callState === CALL_STATES.IDLE
                ? "text-slate-300 hover:text-white"
                : "opacity-60 cursor-not-allowed text-slate-500"
            }`}
            aria-label="Start video call"
          >
            <VideoIcon className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="group relative rounded-full border border-slate-600/60 p-2 text-slate-300 hover:text-white hover:border-cyan-400/60 transition-colors"
          aria-label="Privacy settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        {isSearchOpen && matchCount > 0 && (
          <span className="text-xs text-cyan-300 font-medium">
            {activeMatchIndex + 1}/{matchCount}
          </span>
        )}

        <button
          type="button"
          onClick={onToggleSearch}
          className={`group relative rounded-full border border-slate-600/60 p-2 transition-colors ${
            isSearchOpen ? "bg-slate-700/70 text-cyan-300" : "text-slate-300 hover:text-white"
          }`}
          aria-label="Search messages"
        >
          <SearchIcon className="w-4 h-4" />
          {!isSearchOpen && matchCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-cyan-500 text-[10px] px-1.5 py-[1px] text-white">
              {matchCount}
            </span>
          )}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="rounded-full border border-slate-600/60 p-2 text-slate-300 hover:text-white hover:border-cyan-400/60 transition-colors"
            aria-label="Conversation menu"
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 z-40 w-48 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/95 shadow-2xl">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => runMenuAction(item.onClick)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default ChatHeader;
