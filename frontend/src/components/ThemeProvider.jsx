import { useEffect, useRef } from "react";
import { useThemeStore } from "../store/useThemeStore";

const applyThemeMode = (root, mode) => {
  root.dataset.themeMode = mode;
  root.classList.toggle("theme-light", mode === "light");
  root.classList.toggle("theme-dark", mode === "dark");
};

const getRevealRadius = (x, y) => {
  const maxX = Math.max(x, window.innerWidth - x);
  const maxY = Math.max(y, window.innerHeight - y);
  return Math.hypot(maxX, maxY);
};

function ThemeProvider({ children }) {
  const mode = useThemeStore((state) => state.mode);
  const hydrateMode = useThemeStore((state) => state.hydrateMode);
  const transitionOrigin = useThemeStore((state) => state.transitionOrigin);
  const clearTransitionOrigin = useThemeStore((state) => state.clearTransitionOrigin);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    hydrateMode();
  }, [hydrateMode]);

  useEffect(() => {
    const root = document.documentElement;
    const supportsViewTransition = typeof document.startViewTransition === "function";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!hasMountedRef.current) {
      applyThemeMode(root, mode);
      hasMountedRef.current = true;
      clearTransitionOrigin();
      return;
    }

    if (!supportsViewTransition || prefersReducedMotion) {
      applyThemeMode(root, mode);
      clearTransitionOrigin();
      return;
    }

    const fallbackOrigin = {
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    };

    const origin = transitionOrigin ?? fallbackOrigin;
    const radius = getRevealRadius(origin.x, origin.y);

    root.style.setProperty("--theme-transition-x", `${origin.x}px`);
    root.style.setProperty("--theme-transition-y", `${origin.y}px`);
    root.style.setProperty("--theme-transition-radius", `${Math.ceil(radius)}px`);
    root.classList.add("theme-mode-animating");

    const transition = document.startViewTransition(() => {
      applyThemeMode(root, mode);
    });

    transition.finished.finally(() => {
      root.classList.remove("theme-mode-animating");
      clearTransitionOrigin();
    });
  }, [mode, transitionOrigin, clearTransitionOrigin]);

  return children;
}

export default ThemeProvider;
