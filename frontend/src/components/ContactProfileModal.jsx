import { XIcon, MailIcon, InfoIcon } from "lucide-react";

function ContactProfileModal({ user, isOpen, onClose }) {
  if (!isOpen || !user || user.isGroup) return null;

  const aboutText = user.about?.trim() || "Available";
  const accountCreated = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Contact info</p>
            <h2 className="text-lg font-semibold text-white">{user.fullName}</h2>
          </div>
          <button
            type="button"
            aria-label="Close profile"
            onClick={onClose}
            className="rounded-full border border-slate-700/70 p-2 text-slate-400 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <img
              src={user.profilePic || "/avatar.png"}
              alt={user.fullName}
              className="h-28 w-28 rounded-full object-cover border border-slate-700"
            />
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3 text-slate-200">
              <InfoIcon className="size-4 text-cyan-300" />
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">About</p>
                <p className="text-sm text-slate-100">{aboutText}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center gap-3 text-slate-200">
              <MailIcon className="size-4 text-cyan-300" />
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Account</p>
                <p className="text-sm text-slate-100">{user.email}</p>
                {accountCreated && (
                  <p className="text-xs text-slate-500">Joined {accountCreated}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContactProfileModal;
