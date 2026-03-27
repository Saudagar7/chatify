import { SearchIcon, VideoIcon, XIcon, SettingsIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { CALL_STATES, useCallStore } from "../store/useCallStore";
import SettingsModal from "./SettingsModal";

function ChatHeader({
  onToggleSearch,
  isSearchOpen,
  matchCount,
  activeMatchIndex,
  onShowProfile,
}) {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const startVideoCall = useCallStore((state) => state.startVideoCall);
  const callState = useCallStore((state) => state.callState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isGroup = selectedUser?.isGroup;
  const normalizedOnlineUsers = Array.isArray(onlineUsers)
    ? onlineUsers.map((id) => id?.toString?.() || id)
    : [];
  const selectedUserId = selectedUser?._id?.toString?.() || selectedUser?._id;
  const isOnline = !isGroup && normalizedOnlineUsers.includes(selectedUserId);
  const subtitle = isGroup
    ? `${selectedUser?.memberCount ?? selectedUser?.members?.length ?? 0} members`
    : isOnline
    ? "Online"
    : "Offline";
  const canShowProfile = !isGroup && typeof onShowProfile === "function";

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") setSelectedUser(null);
    };

    window.addEventListener("keydown", handleEscKey);

    // cleanup function
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser]);

  return (
    <div
      className="flex justify-between items-center bg-slate-800/50 border-b
   border-slate-700/50 max-h-[84px] px-6 flex-1"
    >
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
          <p
            className={`text-sm ${isOnline ? "text-emerald-300" : "text-slate-400"}`}
          >
            {subtitle}
          </p>
        </div>
      </button>

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
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Video call
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="group relative rounded-full border border-slate-600/60 p-2 text-slate-300 hover:text-white hover:border-cyan-400/60 transition-colors"
          aria-label="Privacy settings"
        >
          <SettingsIcon className="w-4 h-4" />
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            Privacy settings
          </span>
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
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            Search
          </span>
          {!isSearchOpen && matchCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-cyan-500 text-[10px] px-1.5 py-[1px] text-white">
              {matchCount}
            </span>
          )}
        </button>
        <button onClick={() => setSelectedUser(null)}>
          <XIcon className="w-5 h-5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
        </button>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
export default ChatHeader;