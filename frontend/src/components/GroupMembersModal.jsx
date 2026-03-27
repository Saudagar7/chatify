import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UserMinusIcon, UserPlusIcon, XIcon } from "lucide-react";

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return value._id;
    if (value.id) return value.id;
  }
  return value.toString?.() || "";
};

function GroupMembersModal({
  isOpen,
  onClose,
  group,
  isAdmin,
  availableContacts = [],
  onAddMembers,
  onRemoveMember,
}) {
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedToAdd([]);
      setRemovingId(null);
    }
  }, [isOpen, group?._id]);

  if (!isOpen || !group) return null;

  const adminId = normalizeId(group.admin);

  const handleAddMembers = async () => {
      if (!selectedToAdd.length) {
        toast.error("Select at least one contact");
        return;
      }
      setIsAdding(true);
      const success = await onAddMembers(selectedToAdd);
      if (success) {
        setSelectedToAdd([]);
      }
      setIsAdding(false);
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingId(memberId);
    await onRemoveMember(memberId);
    setRemovingId(null);
  };

  const isRemovable = (memberId) => normalizeId(memberId) !== adminId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-slate-700/70 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-slate-100">Group members</h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-3">Current members</p>
            <div className="space-y-2">
              {(group.members || []).map((member) => (
                <div
                  key={member._id || member.id}
                  className="flex items-center gap-3 bg-slate-800/60 rounded-xl border border-slate-700/60 px-3 py-2"
                >
                  <img
                    src={member.profilePic || "/avatar.png"}
                    alt={member.fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-100 truncate">{member.fullName}</p>
                    {member.email && (
                      <p className="text-xs text-slate-400 truncate">{member.email}</p>
                    )}
                  </div>
                  {normalizeId(member._id) === adminId && (
                    <span className="text-[11px] text-cyan-300 font-semibold">Admin</span>
                  )}
                  {isAdmin && isRemovable(member._id) && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member._id)}
                      disabled={removingId === member._id}
                      className="text-xs inline-flex items-center gap-1 text-rose-300 hover:text-rose-100 disabled:opacity-50"
                    >
                      <UserMinusIcon className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {group.members?.length === 0 && (
                <p className="text-sm text-slate-500">No members found.</p>
              )}
            </div>
          </section>

          {isAdmin && (
            <section>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-3">Add members</p>
              {availableContacts.length === 0 ? (
                <p className="text-sm text-slate-500">All contacts are already in this group.</p>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700/60 divide-y divide-slate-800/60">
                    {availableContacts.map((contact) => (
                      <label key={contact._id} className="flex items-center gap-3 p-3 text-sm text-slate-100">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={selectedToAdd.includes(contact._id)}
                          onChange={() =>
                            setSelectedToAdd((prev) =>
                              prev.includes(contact._id)
                                ? prev.filter((id) => id !== contact._id)
                                : [...prev, contact._id]
                            )
                          }
                        />
                        <img
                          src={contact.profilePic || "/avatar.png"}
                          alt={contact.fullName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{contact.fullName}</p>
                          {contact.email && (
                            <p className="text-[11px] text-slate-400 truncate">{contact.email}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={handleAddMembers}
                    className="mt-3 inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <UserPlusIcon className="w-4 h-4" />
                    {isAdding ? "Adding..." : "Add selected members"}
                  </button>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default GroupMembersModal;
