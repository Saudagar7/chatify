import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import ProfileHeader from "../components/ProfileHeader";
import ActiveTabSwitch from "../components/ActiveTabSwitch";
import ChatsList from "../components/ChatsList";
import ContactList from "../components/ContactList";
import GroupsList from "../components/GroupsList";
import UnreadChatsList from "../components/UnreadChatsList";
import ChatContainer from "../components/ChatContainer";
import NoConversationPlaceholder from "../components/NoConversationPlaceholder";
import { useShallow } from "zustand/react/shallow";

function ChatPage() {
  const {
    activeTab,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    setSelectedUser,
  } = useChatStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      selectedUser: state.selectedUser,
      subscribeToMessages: state.subscribeToMessages,
      unsubscribeFromMessages: state.unsubscribeFromMessages,
      setSelectedUser: state.setSelectedUser,
    }))
  );
  const socket = useAuthStore((state) => state.socket);

  const getCompactLayout = () => (typeof window !== "undefined" ? window.innerWidth < 1024 : false);
  const [isCompactLayout, setIsCompactLayout] = useState(getCompactLayout);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(getCompactLayout());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedUser(null);
  }, [setSelectedUser]);

  const shouldShowSidebar = !isCompactLayout || !selectedUser;
  const shouldShowChatPane = !isCompactLayout || Boolean(selectedUser);

  useEffect(() => {
    if (!socket) return;
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [socket, subscribeToMessages, unsubscribeFromMessages]);

  return (
    <div className="chat-layout relative w-full min-h-0">
      <BorderAnimatedContainer className="flex flex-col lg:flex-row w-full">
        {shouldShowSidebar && (
          <div className="w-full lg:w-[360px] theme-panel-left backdrop-blur-sm flex flex-col min-h-0">
            <ProfileHeader />
            <ActiveTabSwitch />

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {activeTab === "chats" && <ChatsList />}
              {activeTab === "unread" && <UnreadChatsList />}
              {activeTab === "contacts" && <ContactList />}
              {activeTab === "groups" && <GroupsList />}
            </div>
          </div>
        )}

        {shouldShowChatPane && (
          <div className="flex-1 flex flex-col min-h-0 theme-panel-right backdrop-blur-sm">
            {selectedUser ? (
              <ChatContainer onBackToList={isCompactLayout ? handleBackToList : undefined} />
            ) : (
              <NoConversationPlaceholder />
            )}
          </div>
        )}
      </BorderAnimatedContainer>
    </div>
  );
}
export default ChatPage;