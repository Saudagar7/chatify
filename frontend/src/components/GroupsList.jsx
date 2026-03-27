import { useEffect, useState } from "react";
import { PlusIcon, UsersIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { getSenderId } from "../lib/conversationUtils";

function GroupsList() {
  const {
    groups,
    isGroupsLoading,
    getMyGroups,
    setSelectedUser,
    createGroup,
    allContacts,
    getAllContacts,
  } = useChatStore();
  const { authUser } = useAuthStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formState, setFormState] = useState({ name: "", description: "" });
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [imagePreview, setImagePreview] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    getMyGroups();
  }, [getMyGroups]);

  useEffect(() => {
    if (isCreateOpen && !allContacts.length) {
      getAllContacts();
    }
  }, [isCreateOpen, allContacts.length, getAllContacts]);

  const buildPreview = (group) => {
    if (!group.lastMessage) {
      const count = group.memberCount ?? group.members?.length ?? 0;
      if (group.description?.trim()) return group.description.trim();
      return `${count} member${count === 1 ? "" : "s"}`;
    }
    const senderId = getSenderId(group.lastMessage);
    const isOwn = authUser?._id && senderId?.toString() === authUser._id;
    const senderName = isOwn ? "You" : group.lastMessage.sender?.fullName || "Someone";
    const content = group.lastMessage.text?.trim()
      ? group.lastMessage.text.trim()
      : group.lastMessage.image
      ? "Shared an image"
      : "Sent an update";
    return `${senderName}: ${content}`;
  };

  const toggleMemberSelection = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormState({ name: "", description: "" });
    setSelectedMembers([]);
    setImagePreview("");
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!formState.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    setIsCreating(true);
    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      memberIds: selectedMembers,
      profilePic: imagePreview,
    };
    const newGroup = await createGroup(payload);
    setIsCreating(false);
    if (newGroup) {
      resetForm();
      setIsCreateOpen(false);
      setSelectedUser(newGroup);
    }
  };

  if (isGroupsLoading) return <UsersLoadingSkeleton />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm uppercase tracking-wide text-slate-400 flex items-center gap-2">
          <UsersIcon className="w-4 h-4" /> Groups
        </h3>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 border border-cyan-500/40 rounded-lg px-3 py-1.5 hover:bg-cyan-500/10"
        >
          <PlusIcon className="w-4 h-4" />
          New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/60 p-6 text-center text-sm text-slate-400">
          No groups yet. Create one to start a shared conversation.
        </div>
      ) : (
        groups.map((group) => (
          <div
            key={group._id}
            className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors mb-3"
            onClick={() => setSelectedUser(group)}
          >
            <div className="flex items-center gap-3">
              <div className="avatar">
                <div className="size-12 rounded-full">
                  <img
                    src={group.profilePic || "/avatar.png"}
                    alt={group.fullName}
                    className="cursor-zoom-in"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage({ src: group.profilePic || "/avatar.png", name: group.fullName });
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-slate-200 font-medium truncate">{group.fullName}</h4>
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {group.memberCount ?? group.members?.length ?? 0} members
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">{buildPreview(group)}</p>
              </div>
            </div>
          </div>
        ))
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700/60 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-slate-100">Create Group</h4>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
                className="text-sm text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Group name
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Weekend plans"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Description (optional)
              <textarea
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white min-h-20"
                placeholder="What is this group about?"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm text-slate-300">
              Group avatar
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-xs text-slate-500">Optional</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="text-xs font-medium text-cyan-300 cursor-pointer">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-white"
                      onClick={() => setImagePreview("")}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-300">Invite members</p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700/60 divide-y divide-slate-800/80">
                {allContacts.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4">No additional contacts available.</p>
                ) : (
                  allContacts.map((contact) => (
                    <label key={contact._id} className="flex items-center gap-3 p-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={selectedMembers.includes(contact._id)}
                        onChange={() => toggleMemberSelection(contact._id)}
                      />
                      <img
                        src={contact.profilePic || "/avatar.png"}
                        alt={contact.fullName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{contact.fullName}</p>
                        <p className="text-[11px] text-slate-400 truncate">{contact.email}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 py-2 rounded-lg text-sm font-semibold text-white hover:from-cyan-600 hover:to-cyan-700 transition disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create group"}
            </button>
          </form>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70"
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

export default GroupsList;
