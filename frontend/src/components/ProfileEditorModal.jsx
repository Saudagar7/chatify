import { useEffect, useRef, useState } from "react";
import { CameraIcon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";

const MAX_ABOUT_LENGTH = 160;

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

function ProfileEditorModal({ isOpen, onClose }) {
  const { authUser, updateProfile } = useAuthStore();
  const [fullName, setFullName] = useState("");
  const [about, setAbout] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("/avatar.png");
  const [pendingAvatar, setPendingAvatar] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !authUser) return;
    setFullName(authUser.fullName || "");
    setAbout(authUser.about || "");
    setAvatarPreview(authUser.profilePic || "/avatar.png");
    setPendingAvatar("");
  }, [isOpen, authUser]);

  if (!isOpen || !authUser) return null;

  const handleImageSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      toast.error("Please choose an image under 3 MB");
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setAvatarPreview(base64);
      setPendingAvatar(base64);
    } catch (error) {
      console.error("Image preview failed", error);
      toast.error("Unable to read image");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {};
    const trimmedName = fullName.trim();
    const trimmedAbout = about.trim().slice(0, MAX_ABOUT_LENGTH);

    if (trimmedName && trimmedName !== authUser.fullName) {
      payload.fullName = trimmedName;
    }

    if (trimmedAbout !== (authUser.about || "")) {
      payload.about = trimmedAbout;
    }

    if (pendingAvatar && pendingAvatar !== authUser.profilePic) {
      payload.profilePic = pendingAvatar;
    }

    if (!Object.keys(payload).length) {
      toast("Nothing to update");
      return;
    }

    try {
      setIsSaving(true);
      const success = await updateProfile(payload);
      if (success) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Profile</p>
            <h2 className="text-lg font-semibold text-white">Edit account info</h2>
          </div>
          <button
            type="button"
            aria-label="Close editor"
            onClick={onClose}
            className="rounded-full border border-slate-700/70 p-2 text-slate-400 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={avatarPreview}
                alt="Profile"
                className="h-28 w-28 rounded-full object-cover border border-slate-700"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 rounded-full bg-cyan-500 p-2 text-white shadow-lg hover:bg-cyan-400"
                aria-label="Change profile photo"
              >
                <CameraIcon className="size-4" />
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              Name
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                maxLength={60}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-300">
              About
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                rows={3}
                maxLength={MAX_ABOUT_LENGTH}
                placeholder="Describe yourself"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {about.length}/{MAX_ABOUT_LENGTH}
              </span>
            </label>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Account</p>
              <p className="text-sm text-slate-300">{authUser.email}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-400 disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileEditorModal;
