import { useEffect } from "react";
import { useThemeStore } from "../store/useThemeStore";

function ThemeProvider({ children }) {
  const mode = useThemeStore((state) => state.mode);
  const hydrateMode = useThemeStore((state) => state.hydrateMode);

  useEffect(() => {
    hydrateMode();
  }, [hydrateMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeMode = mode;
    root.classList.toggle("theme-light", mode === "light");
    root.classList.toggle("theme-dark", mode === "dark");
  }, [mode]);

  return children;
}

export default ThemeProvider;
