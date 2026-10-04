/** AnyOne¹⁶ appearance (light / dark). Stored on this device only. */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "anyone-theme";

/** Runs before paint (inlined in the document head) to avoid a flash. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset["theme"]=t==="light"?"light":"dark"}catch(e){}`;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    setThemeState(document.documentElement.dataset["theme"] === "light" ? "light" : "dark");
  }, []);
  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    root.dataset["theme"] = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    window.setTimeout(() => root.classList.remove("theme-fade"), 450);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
