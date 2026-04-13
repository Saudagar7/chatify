import { CheckIcon, XIcon } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const CHAT_THEMES = [
  {
    value: "default",
    title: "Default",
    description: "Classic Chatify background",
    swatch: "from-slate-700 to-slate-900",
  },
  {
    value: "ocean",
    title: "Ocean",
    description: "Cool teal gradient",
    swatch: "from-cyan-500 to-blue-600",
  },
  {
    value: "sunset",
    title: "Sunset",
    description: "Warm amber-pink blend",
    swatch: "from-amber-400 to-rose-500",
  },
  {
    value: "forest",
    title: "Forest",
    description: "Soft green atmosphere",
    swatch: "from-emerald-500 to-lime-600",
  },
];

function ThemePickerModal({ isOpen, onClose }) {
  const chatTheme = useThemeStore((state) => state.chatTheme);
  const setChatTheme = useThemeStore((state) => state.setChatTheme);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Appearance</p>
            <h3 className="text-lg font-semibold text-slate-100">Chat theme</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700/70 p-2 text-slate-300 hover:text-white"
            aria-label="Close theme picker"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {CHAT_THEMES.map((theme) => {
            const isActive = chatTheme === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                onClick={() => setChatTheme(theme.value)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  isActive
                    ? "border-cyan-500/80 bg-cyan-500/10"
                    : "border-slate-700/70 hover:border-slate-500/80"
                }`}
              >
                <span className={`h-8 w-8 rounded-lg bg-gradient-to-br ${theme.swatch}`} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-100">{theme.title}</span>
                  <span className="block text-xs text-slate-400">{theme.description}</span>
                </span>
                {isActive && <CheckIcon className="h-4 w-4 text-cyan-300" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ThemePickerModal;
