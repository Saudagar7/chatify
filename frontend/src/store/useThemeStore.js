import { create } from "zustand";

const STORAGE_KEY = "chatify-color-mode";
const DEFAULT_MODE = "dark";

const getInitialMode = () => {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : DEFAULT_MODE;
};

export const useThemeStore = create((set, get) => ({
  mode: getInitialMode(),
  transitionOrigin: null,
  toggleMode: (origin) => {
    const nextMode = get().mode === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextMode);
    }
    set({
      mode: nextMode,
      transitionOrigin: origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
        ? { x: origin.x, y: origin.y }
        : null,
    });
  },
  setMode: (mode, origin) => {
    const safeMode = mode === "light" ? "light" : "dark";
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, safeMode);
    }
    set({
      mode: safeMode,
      transitionOrigin: origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
        ? { x: origin.x, y: origin.y }
        : null,
    });
  },
  hydrateMode: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored !== get().mode) {
      set({
        mode: stored === "light" ? "light" : "dark",
        transitionOrigin: null,
      });
    }
  },
  clearTransitionOrigin: () => set({ transitionOrigin: null }),
}));
