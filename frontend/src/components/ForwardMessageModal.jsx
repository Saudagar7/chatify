import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

const formatFileSize = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const buildOption = (entry, type) => {
  if (!entry) return null;
  const id = entry._id || entry.id;
  if (!id) return null;
  const name = entry.fullName || entry.name || entry.email || "Unknown";
  const subtitle =
    type === "group"
      ? `${entry.memberCount ?? entry.members?.length ?? 0} members`
      : entry.email || "Direct chat";
  return {
    key: `${type}:${id}`,
    id,
    type,
    name,
    nameLower: name.toLowerCase(),
    profilePic: entry.profilePic,
    subtitle,
  };
};

function ForwardMessageModal({
  isOpen,
  message,
  sourceType = "direct",
  chats = [],
  groups = [],
  contacts = [],
  onClose,
  onSubmit,
}) {
  const { authUser } = useAuthStore();
  const selfId = authUser?._id;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setSelectedKeys(new Set());
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const options = useMemo(() => {
    const map = new Map();
    const addOption = (entry, type) => {
      const option = buildOption(entry, type);
      if (!option) return;
      if (type === "user" && option.id === selfId) return;
      if (!map.has(option.key)) {
        map.set(option.key, option);
      }
    };

    chats.forEach((chat) => addOption(chat, chat.isGroup ? "group" : "user"));
    groups.forEach((group) => addOption(group, "group"));
    contacts.forEach((contact) => addOption(contact, contact.isGroup ? "group" : "user"));

    return Array.from(map.values());
  }, [chats, groups, contacts, selfId]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    normalizedSearch ? option.nameLower.includes(normalizedSearch) : true
  );

  const toggleSelection = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedKeys.size || !message?._id) return;
    setIsSubmitting(true);
    const selectedTargets = options
      .filter((option) => selectedKeys.has(option.key))
      .map((option) => ({ type: option.type, id: option.id }));
    try {
      await onSubmit?.(selectedTargets);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const hasText = Boolean(message?.text);
  const hasImage = Boolean(message?.image);
  const hasAudio = Boolean(message?.audio);
  const hasFile = Boolean(message?.file);

  const renderPreview = () => (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Forwarding from {sourceType === "group" ? "group chat" : "direct chat"}
        </p>
        {hasText && <p className="text-slate-100">{message.text}</p>}
        <div className="flex flex-wrap gap-2">
          {hasImage && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
              <ImageIcon className="h-3.5 w-3.5" /> Image
            </span>
          )}
          {hasAudio && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <MicIcon className="h-3.5 w-3.5" /> Voice note
            </span>
          )}
          {hasFile && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
              <FileTextIcon className="h-3.5 w-3.5" />
              {message.fileName || "Document"}
              {message.fileSize ? ` · ${formatFileSize(message.fileSize)}` : ""}
            </span>
          )}
          {!hasText && !hasImage && !hasAudio && !hasFile && (
            <span className="text-xs text-slate-400">No preview available</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700/70 bg-slate-900/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/70 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Forward message</h3>
            <p className="text-xs text-slate-400">Select people or groups to resend this message</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600/60 p-2 text-slate-300 hover:text-white"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {renderPreview()}

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Search recipients
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                placeholder="Search chats, contacts, or groups"
              />
              <UsersIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-800/60 bg-slate-900/40 p-2">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const isSelected = selectedKeys.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggleSelection(option.key)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-cyan-500/70 bg-cyan-500/10"
                        : "border-transparent hover:border-cyan-500/40 hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={option.profilePic || "/avatar.png"}
                        alt={option.name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-white">
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-100 truncate">{option.name}</p>
                      <p className="text-xs text-slate-400 truncate">{option.subtitle}</p>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        option.type === "group" ? "text-amber-300" : "text-cyan-300"
                      }`}
                    >
                      {option.type === "group" ? "Group" : "Chat"}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No matching recipients found.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-800/70 px-6 py-4">
          <div className="text-xs text-slate-400">
            {selectedKeys.size ? `${selectedKeys.size} selected` : "Select at least one recipient"}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-600/60 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedKeys.size || isSubmitting}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Forwarding..." : "Forward"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForwardMessageModal;
