import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "../store/useAuthStore";
import { SearchIcon } from "lucide-react";
import {
  buildChatPreview,
  sortByLastMessage,
  isConversationUnread,
  getStoredUnreadCount,
} from "../lib/conversationUtils";

function ChatsList() {
  const {
    getMyChatPartners,
    getMyGroups,
    chats,
    groups,
    isUsersLoading,
    isGroupsLoading,
    setSelectedUser,
    conversationSeenAt,
    conversationUnreadCounts,
  } = useChatStore(
    useShallow((state) => ({
      getMyChatPartners: state.getMyChatPartners,
      getMyGroups: state.getMyGroups,
      chats: state.chats,
      groups: state.groups,
      isUsersLoading: state.isUsersLoading,
      isGroupsLoading: state.isGroupsLoading,
      setSelectedUser: state.setSelectedUser,
      conversationSeenAt: state.conversationSeenAt,
      conversationUnreadCounts: state.conversationUnreadCounts,
    }))
  );
  const { onlineUsers, authUser } = useAuthStore();
  const [previewImage, setPreviewImage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getMyChatPartners();
    getMyGroups();
  }, [getMyChatPartners, getMyGroups]);

  const combinedChats = useMemo(() => {
    const directChats = chats.map((chat) => ({ ...chat, isGroup: chat.isGroup ?? false }));
    return sortByLastMessage([...directChats, ...groups]);
  }, [chats, groups]);

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return combinedChats;
    return combinedChats.filter((chat) => {
      const name = chat.fullName || chat.name || "";
      return name.toLowerCase().includes(query);
    });
  }, [combinedChats, searchQuery]);
  const isFiltering = Boolean(searchQuery.trim());

  if (isUsersLoading || isGroupsLoading) return <UsersLoadingSkeleton />;
  if (combinedChats.length === 0) return <NoChatsFound />;

  return (
    <>
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search contacts"
          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {isFiltering && !filteredChats.length && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 text-center text-sm text-slate-400">
          No contacts match that search.
        </div>
      )}

      {filteredChats.map((chat) => {
        const unread = isConversationUnread(chat, authUser?._id, conversationSeenAt);
        const storedUnread = getStoredUnreadCount(chat, conversationUnreadCounts);
        const unreadCount = storedUnread > 0 ? storedUnread : unread ? 1 : 0;

        return (
          <div
            key={chat._id}
            className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
            onClick={() => setSelectedUser(chat)}
          >
            <div className="flex items-center gap-3">
              <div
                className={`avatar ${
                  chat.isGroup ? "" : onlineUsers.includes(chat._id) ? "online" : "offline"
                }`}
              >
                <div className="size-12 rounded-full">
                  <img
                    src={chat.profilePic || "/avatar.png"}
                    alt={chat.fullName}
                    className="cursor-zoom-in"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage({
                        src: chat.profilePic || "/avatar.png",
                        name: chat.fullName,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="relative inline-flex group">
                    <h4 className="text-slate-200 font-medium truncate">{chat.fullName}</h4>
                    <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-lg opacity-0 group-hover:opacity-100">
                      {chat.fullName}
                    </span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="min-w-5 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-950 text-center shadow-sm">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs truncate ${
                    unread ? "text-emerald-300 font-semibold" : "text-slate-400"
                  }`}
                >
                  {buildChatPreview(chat, authUser)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewImage(null)}
        >
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img
                src={previewImage.src}
                alt={previewImage.name}
                className="w-56 h-56 rounded-full object-cover border-4 border-white shadow-2xl"
              />
            </div>
            <p className="text-sm font-semibold text-white">{previewImage.name}</p>
            <button
              type="button"
              className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
              onClick={() => setPreviewImage(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export default ChatsList;