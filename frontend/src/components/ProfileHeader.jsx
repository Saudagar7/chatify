import { useState, useRef } from "react";
import { LogOutIcon, MoonIcon, SunIcon, VolumeOffIcon, Volume2Icon } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useThemeStore } from "../store/useThemeStore";
import ProfileEditorModal from "./ProfileEditorModal";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function ProfileHeader() {
  const { logout, authUser, updateProfile } = useAuthStore();
  const { isSoundEnabled, toggleSound } = useChatStore();
  const { mode, toggleMode } = useThemeStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onloadend = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      await updateProfile({ profilePic: base64Image });
    };
  };

  return (
    <div className="p-6 border-b border-slate-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AVATAR */}
          <div className="avatar online">
            <button
              className="size-14 rounded-full overflow-hidden relative group"
              onClick={() => fileInputRef.current.click()}
            >
              <img
                src={selectedImg || authUser.profilePic || "/avatar.png"}
                alt="User image"
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs">Change</span>
              </div>
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* USERNAME & ONLINE TEXT */}
          <button
            type="button"
            onClick={() => setIsEditorOpen(true)}
            className="text-left"
          >
            <h3 className="text-slate-200 font-medium text-base max-w-[180px] truncate">
              {authUser.fullName}
            </h3>

            <p className="text-slate-400 text-xs">Tap to edit profile</p>
          </button>
        </div>

        {/* BUTTONS */}
        <div className="flex gap-3 items-center">
          {/* THEME TOGGLE */}
          <button
            className="group relative rounded-full border border-slate-600/60 p-2 text-slate-400 hover:text-white hover:border-cyan-400/60 transition-colors"
            onClick={toggleMode}
            aria-label="Toggle color mode"
          >
            {mode === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            <span className="pointer-events-none absolute bottom-full right-0 mb-2 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap">
              {mode === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>

          {/* LOGOUT BTN */}
          <button
            className="group relative rounded-full border border-slate-600/60 p-2 text-slate-400 hover:text-white hover:border-cyan-400/60 transition-colors"
            onClick={logout}
            aria-label="Logout"
          >
            <LogOutIcon className="size-4" />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Logout
            </span>
          </button>

          {/* SOUND TOGGLE BTN */}
          <button
            className={`group relative rounded-full border border-slate-600/60 p-2 transition-colors ${
              isSoundEnabled
                ? "text-cyan-300 hover:border-cyan-400/60"
                : "text-slate-400 hover:text-white hover:border-cyan-400/40"
            }`}
            onClick={() => {
              // play click sound before toggling
              mouseClickSound.currentTime = 0; // reset to start
              mouseClickSound.play().catch((error) => console.log("Audio play failed:", error));
              toggleSound();
            }}
            aria-label="Toggle sound"
          >
            {isSoundEnabled ? (
              <Volume2Icon className="size-4" />
            ) : (
              <VolumeOffIcon className="size-4" />
            )}
          </button>
        </div>
      </div>
      <ProfileEditorModal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
    </div>
  );
}
export default ProfileHeader;
