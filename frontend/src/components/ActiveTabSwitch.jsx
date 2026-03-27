import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { isConversationUnread, getStoredUnreadCount } from "../lib/conversationUtils";

function ActiveTabSwitch() {
  const {
    activeTab,
    setActiveTab,
    chats,
    groups,
    conversationSeenAt,
    conversationUnreadCounts,
  } = useChatStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      chats: state.chats,
      groups: state.groups,
      conversationSeenAt: state.conversationSeenAt,
      conversationUnreadCounts: state.conversationUnreadCounts,
    }))
  );
  const authUser = useAuthStore((state) => state.authUser);
  const authUserId = authUser?._id || null;

  const unreadCount = useMemo(() => {
    const combined = [...chats, ...groups];
    return combined.reduce((total, chat) => {
      const storedCount = getStoredUnreadCount(chat, conversationUnreadCounts);
      if (storedCount > 0) return total + storedCount;
      return isConversationUnread(chat, authUserId, conversationSeenAt) ? total + 1 : total;
    }, 0);
  }, [authUserId, chats, groups, conversationSeenAt, conversationUnreadCounts]);

  return (
    <div className="tabs tabs-boxed bg-transparent p-2 m-2">
        <button
          onClick={() => setActiveTab("chats")}
          className={`tab ${
            activeTab === "chats" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400"
          }`}
        >
          All
        </button>

        <button
          onClick={() => setActiveTab("unread")}
          className={`tab flex items-center gap-2 ${
            activeTab === "unread" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400"
          }`}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span className="min-w-5 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-950 text-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

      <button
        onClick={() => setActiveTab("contacts")}
        className={`tab ${
          activeTab === "contacts" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400"
        }`}
      >
        Contacts
      </button>

      <button
        onClick={() => setActiveTab("groups")}
        className={`tab ${
          activeTab === "groups" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400"
        }`}
      >
        Groups
      </button>
    </div>
  );
}
export default ActiveTabSwitch;