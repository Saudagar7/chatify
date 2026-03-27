import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import {
  buildChatPreview,
  isConversationUnread,
  sortByLastMessage,
  getStoredUnreadCount,
} from "../lib/conversationUtils";

function UnreadChatsList() {
  const {
    chats,
    groups,
    conversationSeenAt,
    conversationUnreadCounts,
    isUsersLoading,
    isGroupsLoading,
    getMyChatPartners,
    getMyGroups,
    setSelectedUser,
  } = useChatStore(
    useShallow((state) => ({
      chats: state.chats,
      groups: state.groups,
      conversationSeenAt: state.conversationSeenAt,
      conversationUnreadCounts: state.conversationUnreadCounts,
      isUsersLoading: state.isUsersLoading,
      isGroupsLoading: state.isGroupsLoading,
      getMyChatPartners: state.getMyChatPartners,
      getMyGroups: state.getMyGroups,
      setSelectedUser: state.setSelectedUser,
    }))
  );
  const { onlineUsers, authUser } = useAuthStore();
  const authUserId = authUser?._id || null;
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    if (!chats.length) {
      getMyChatPartners();
    }
    if (!groups.length) {
      getMyGroups();
    }
  }, [chats.length, groups.length, getMyChatPartners, getMyGroups]);

  const unreadConversations = useMemo(() => {
    const directChats = chats.map((chat) => ({ ...chat, isGroup: chat.isGroup ?? false }));
    const combined = sortByLastMessage([...directChats, ...groups]);
    return combined.filter((chat) => isConversationUnread(chat, authUserId, conversationSeenAt));
  }, [chats, groups, conversationSeenAt, authUserId]);

  if (isUsersLoading || isGroupsLoading) return <UsersLoadingSkeleton />;

  if (!unreadConversations.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-800/40 p-6 text-center">
        <p className="text-sm font-medium text-slate-200">You're all caught up</p>
        <p className="text-xs text-slate-400 mt-1">
          New messages from friends and groups will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      {unreadConversations.map((chat) => {
        const storedUnread = getStoredUnreadCount(chat, conversationUnreadCounts);
        const unreadCount = storedUnread > 0 ? storedUnread : 1;

        return (
        <div
          key={chat._id}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 cursor-pointer hover:bg-emerald-500/20 transition-colors"
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
                    setPreviewImage({ src: chat.profilePic || "/avatar.png", name: chat.fullName });
                  }}
                />
              </div>
            </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="relative inline-flex group">
                    <h4 className="text-slate-100 font-semibold truncate">{chat.fullName}</h4>
                    <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-lg opacity-0 group-hover:opacity-100">
                      {chat.fullName}
                    </span>
                  </div>
                  <span className="min-w-5 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-semibold text-emerald-950 text-center shadow-sm">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </div>
                <p className="text-xs text-emerald-200 font-semibold truncate">
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
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="w-56 h-56 rounded-full object-cover border-4 border-white shadow-2xl"
            />
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

export default UnreadChatsList;
