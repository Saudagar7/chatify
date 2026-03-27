import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "../store/useAuthStore";

function ContactList() {
  const { getAllContacts, allContacts, setSelectedUser, isUsersLoading } = useChatStore();
  const { onlineUsers = [] } = useAuthStore();
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    getAllContacts();
  }, [getAllContacts]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;

  return (
    <>
      {allContacts.map((contact) => (
        <div
          key={contact._id}
          className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
          onClick={() => setSelectedUser(contact)}
        >
          <div className="flex items-center gap-3">
            <div className={`avatar ${onlineUsers.includes(contact._id) ? "online" : "offline"}`}>
              <div className="size-12 rounded-full">
                <img
                  src={contact.profilePic || "/avatar.png"}
                  alt={contact.fullName}
                  className="cursor-zoom-in"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage({ src: contact.profilePic || "/avatar.png", name: contact.fullName });
                  }}
                />
              </div>
            </div>
            <div className="relative inline-flex group">
              <h4 className="text-slate-200 font-medium">{contact.fullName}</h4>
              <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-lg opacity-0 group-hover:opacity-100">
                {contact.fullName}
              </span>
            </div>
          </div>
        </div>
      ))}
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
export default ContactList;