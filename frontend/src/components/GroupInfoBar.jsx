import { useEffect, useMemo, useState } from "react";
import { UsersIcon } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import GroupMembersModal from "./GroupMembersModal";

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return value._id;
    if (value.id) return value.id;
  }
  return value.toString?.() || "";
};

function GroupInfoBar({ group }) {
  const { authUser } = useAuthStore();
  const { allContacts, getAllContacts, addGroupMembers, removeGroupMember } = useChatStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const adminId = normalizeId(group.admin);
  const currentUserId = normalizeId(authUser?._id);
  const isAdmin = currentUserId && adminId === currentUserId;

  useEffect(() => {
    if (isModalOpen && !allContacts.length) {
      getAllContacts();
    }
  }, [isModalOpen, allContacts.length, getAllContacts]);

  const availableContacts = useMemo(() => {
    const memberIdSet = new Set((group.members || []).map((member) => normalizeId(member._id)));
    return allContacts.filter((contact) => !memberIdSet.has(normalizeId(contact._id)));
  }, [allContacts, group.members]);

  const handleAddMembers = async (memberIds) => addGroupMembers(group._id, memberIds);
  const handleRemoveMember = async (memberId) => removeGroupMember(group._id, memberId);

  const visibleMembers = (group.members || []).slice(0, 6);
  const remainingCount = Math.max(0, (group.members?.length || 0) - visibleMembers.length);

  return (
    <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/40 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Admin</p>
          <p className="text-sm text-slate-100">
            {adminId === currentUserId ? "You" : group.admin?.fullName || "Unknown"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="text-xs font-semibold text-cyan-300 border border-cyan-500/40 rounded-lg px-3 py-1.5 hover:bg-cyan-500/10"
        >
          {isAdmin ? "Manage members" : "View members"}
        </button>
      </div>

      {group.description && (
        <p className="text-sm text-slate-300 bg-slate-800/40 border border-slate-700/60 rounded-xl px-3 py-2">
          {group.description}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <UsersIcon className="w-4 h-4 text-cyan-300" />
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {group.memberCount ?? group.members?.length ?? 0} members
        </p>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {visibleMembers.map((member) => (
          <div key={member._id} className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700/70">
              <img src={member.profilePic || "/avatar.png"} alt={member.fullName} className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 max-w-16 truncate">{member.fullName}</p>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700/70 flex items-center justify-center text-xs text-slate-300">
            +{remainingCount}
          </div>
        )}
      </div>

      <GroupMembersModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        group={group}
        isAdmin={isAdmin}
        availableContacts={availableContacts}
        onAddMembers={handleAddMembers}
        onRemoveMember={handleRemoveMember}
      />
    </div>
  );
}

export default GroupInfoBar;
