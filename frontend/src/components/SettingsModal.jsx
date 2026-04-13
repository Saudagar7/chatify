import { useEffect, useMemo, useState } from "react";
import { ShieldIcon, UsersIcon, SearchIcon, XIcon, CheckIcon, Clock3Icon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
  }
  return value.toString?.() || "";
};

const extractExceptionIds = (values = []) => {
  const seen = new Set();
  const ids = [];
  values.forEach((entry) => {
    const id = normalizeId(entry);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  return ids;
};

const PRIVACY_OPTIONS = [
  {
    value: "everyone",
    title: "Everyone",
    description: "All Chatify users can view your profile photo.",
  },
  {
    value: "contacts",
    title: "My contacts",
    description: "Only people you've chatted with or share a group with can view it.",
  },
  {
    value: "contactsExcept",
    title: "My contacts except...",
    description: "Show it to contacts but hide it from selected people.",
  },
  {
    value: "nobody",
    title: "Nobody",
    description: "Completely hide your profile photo.",
  },
];

const LAST_SEEN_OPTIONS = [
  {
    value: "everyone",
    title: "Everyone",
    description: "All Chatify users can see your last seen time.",
  },
  {
    value: "contacts",
    title: "My contacts",
    description: "Only people you've chatted with or share a group with can see it.",
  },
  {
    value: "contactsExcept",
    title: "My contacts except...",
    description: "Show last seen to contacts, except selected people.",
  },
  {
    value: "nobody",
    title: "Nobody",
    description: "Hide your last seen from everyone.",
  },
];

function SettingsModal({ isOpen, onClose }) {
  const { authUser, updatePrivacySettings } = useAuthStore();
  const { allContacts, getAllContacts } = useChatStore();
  const [profilePhoto, setProfilePhoto] = useState("everyone");
  const [exceptionIds, setExceptionIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSeen, setLastSeen] = useState("everyone");
  const [lastSeenExceptionIds, setLastSeenExceptionIds] = useState([]);
  const [lastSeenSearchQuery, setLastSeenSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const canEditExceptions = profilePhoto === "contactsExcept";
  const canEditLastSeenExceptions = lastSeen === "contactsExcept";

  useEffect(() => {
    if (!isOpen) return;
    const currentSetting = authUser?.privacySettings?.profilePhoto || "everyone";
    const currentExceptions = extractExceptionIds(
      authUser?.privacySettings?.profilePhotoExceptions || []
    );
    const currentLastSeen = authUser?.privacySettings?.lastSeen || "everyone";
    const currentLastSeenExceptions = extractExceptionIds(
      authUser?.privacySettings?.lastSeenExceptions || []
    );
    setProfilePhoto(currentSetting);
    setExceptionIds(currentExceptions);
    setSearchQuery("");
    setLastSeen(currentLastSeen);
    setLastSeenExceptionIds(currentLastSeenExceptions);
    setLastSeenSearchQuery("");
  }, [isOpen, authUser]);

  useEffect(() => {
    if (isOpen && !allContacts.length) {
      getAllContacts();
    }
  }, [isOpen, allContacts.length, getAllContacts]);

  const filteredContacts = useMemo(() => {
    if (!Array.isArray(allContacts)) return [];
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return allContacts;
    return allContacts.filter((contact) => {
      const fullName = contact.fullName?.toLowerCase() || "";
      const email = contact.email?.toLowerCase() || "";
      return fullName.includes(trimmed) || email.includes(trimmed);
    });
  }, [allContacts, searchQuery]);

  const selectedContacts = useMemo(() => {
    const exceptionSet = new Set(exceptionIds);
    return (allContacts || []).filter((contact) => exceptionSet.has(normalizeId(contact._id)));
  }, [allContacts, exceptionIds]);

  const filteredLastSeenContacts = useMemo(() => {
    if (!Array.isArray(allContacts)) return [];
    const trimmed = lastSeenSearchQuery.trim().toLowerCase();
    if (!trimmed) return allContacts;
    return allContacts.filter((contact) => {
      const fullName = contact.fullName?.toLowerCase() || "";
      const email = contact.email?.toLowerCase() || "";
      return fullName.includes(trimmed) || email.includes(trimmed);
    });
  }, [allContacts, lastSeenSearchQuery]);

  const selectedLastSeenContacts = useMemo(() => {
    const exceptionSet = new Set(lastSeenExceptionIds);
    return (allContacts || []).filter((contact) => exceptionSet.has(normalizeId(contact._id)));
  }, [allContacts, lastSeenExceptionIds]);

  const toggleException = (contactId) => {
    const id = normalizeId(contactId);
    if (!id) return;
    setExceptionIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleLastSeenException = (contactId) => {
    const id = normalizeId(contactId);
    if (!id) return;
    setLastSeenExceptionIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const success = await updatePrivacySettings({
      profilePhoto,
      profilePhotoExceptions: exceptionIds,
      lastSeen,
      lastSeenExceptions: lastSeenExceptionIds,
    });
    setIsSaving(false);
    if (success) {
      onClose?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/70 p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] rounded-2xl border border-slate-800/80 bg-slate-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Privacy</p>
            <h2 className="text-xl font-semibold text-white">Privacy settings</h2>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="rounded-full border border-slate-700/70 p-2 text-slate-400 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section className="space-y-4">
              {PRIVACY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    profilePhoto === option.value
                      ? "border-cyan-500/60 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="profilePhotoPrivacy"
                    value={option.value}
                    checked={profilePhoto === option.value}
                    onChange={() => setProfilePhoto(option.value)}
                    className="mt-1.5 h-4 w-4 accent-cyan-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{option.title}</p>
                    <p className="text-xs text-slate-400">{option.description}</p>
                  </div>
                </label>
              ))}

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-start gap-3 text-sm text-slate-300">
                <ShieldIcon className="mt-1 size-4 text-cyan-300" />
                <p>
                  Privacy updates apply instantly across chats and contact lists. People you hide will
                  see the default avatar instead of your uploaded profile photo.
                </p>
              </div>
            </section>

            <section
              className={`rounded-2xl border p-4 ${
                canEditExceptions
                  ? "border-cyan-500/50 bg-cyan-500/5"
                  : "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <UsersIcon className="size-4 text-cyan-300" /> My contacts except...
                  </p>
                  <p className="text-xs text-slate-400">
                    {canEditExceptions
                      ? "Select contacts who should never see your profile photo."
                      : "Switch to 'My contacts except...' above to manage the hidden list."}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {exceptionIds.length} selected
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {selectedContacts.length ? (
                    selectedContacts.map((contact) => (
                      <span
                        key={contact._id}
                        className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100"
                      >
                        {contact.fullName}
                        {canEditExceptions && (
                          <button
                            type="button"
                            className="text-[11px] font-bold text-cyan-200"
                            onClick={() => toggleException(contact._id)}
                          >
                            x
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No exceptions selected yet.</p>
                  )}
                </div>

                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={!canEditExceptions}
                    placeholder="Search contacts"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/80">
                  {filteredContacts.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">No contacts found.</p>
                  ) : (
                    filteredContacts.map((contact) => {
                      const id = normalizeId(contact._id);
                      const isSelected = exceptionIds.includes(id);
                      return (
                        <label
                          key={contact._id}
                          className={`flex items-center gap-3 p-3 text-sm ${
                            isSelected ? "bg-cyan-500/5" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={isSelected}
                            onChange={() => toggleException(id)}
                            disabled={!canEditExceptions}
                          />
                          <img
                            src={contact.profilePic || "/avatar.png"}
                            alt={contact.fullName}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-slate-100">{contact.fullName}</p>
                            <p className="truncate text-xs text-slate-500">{contact.email}</p>
                          </div>
                          {isSelected && <CheckIcon className="size-4 text-cyan-300" />}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Last seen</p>
                <h3 className="text-sm font-semibold text-slate-100">
                  Who can see when you were online
                </h3>
              </div>

              {LAST_SEEN_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    lastSeen === option.value
                      ? "border-cyan-500/60 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="lastSeenPrivacy"
                    value={option.value}
                    checked={lastSeen === option.value}
                    onChange={() => setLastSeen(option.value)}
                    className="mt-1.5 h-4 w-4 accent-cyan-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{option.title}</p>
                    <p className="text-xs text-slate-400">{option.description}</p>
                  </div>
                </label>
              ))}

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-start gap-3 text-sm text-slate-300">
                <Clock3Icon className="mt-1 size-4 text-cyan-300" />
                <p>
                  If you hide your last seen, you also cannot see other people's last seen.
                  Online status still appears for active users.
                </p>
              </div>
            </section>

            <section
              className={`rounded-2xl border p-4 ${
                canEditLastSeenExceptions
                  ? "border-cyan-500/50 bg-cyan-500/5"
                  : "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <UsersIcon className="size-4 text-cyan-300" /> Last seen exceptions
                  </p>
                  <p className="text-xs text-slate-400">
                    {canEditLastSeenExceptions
                      ? "Choose contacts who should not see your last seen time."
                      : "Switch to 'My contacts except...' above to manage this list."}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {lastSeenExceptionIds.length} selected
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {selectedLastSeenContacts.length ? (
                    selectedLastSeenContacts.map((contact) => (
                      <span
                        key={contact._id}
                        className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100"
                      >
                        {contact.fullName}
                        {canEditLastSeenExceptions && (
                          <button
                            type="button"
                            className="text-[11px] font-bold text-cyan-200"
                            onClick={() => toggleLastSeenException(contact._id)}
                          >
                            x
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No exceptions selected yet.</p>
                  )}
                </div>

                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                  <input
                    type="text"
                    value={lastSeenSearchQuery}
                    onChange={(e) => setLastSeenSearchQuery(e.target.value)}
                    disabled={!canEditLastSeenExceptions}
                    placeholder="Search contacts"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/80">
                  {filteredLastSeenContacts.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">No contacts found.</p>
                  ) : (
                    filteredLastSeenContacts.map((contact) => {
                      const id = normalizeId(contact._id);
                      const isSelected = lastSeenExceptionIds.includes(id);
                      return (
                        <label
                          key={contact._id}
                          className={`flex items-center gap-3 p-3 text-sm ${
                            isSelected ? "bg-cyan-500/5" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={isSelected}
                            onChange={() => toggleLastSeenException(id)}
                            disabled={!canEditLastSeenExceptions}
                          />
                          <img
                            src={contact.profilePic || "/avatar.png"}
                            alt={contact.fullName}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-slate-100">{contact.fullName}</p>
                            <p className="truncate text-xs text-slate-500">{contact.email}</p>
                          </div>
                          {isSelected && <CheckIcon className="size-4 text-cyan-300" />}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 bg-slate-900/80 px-4 sm:px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
