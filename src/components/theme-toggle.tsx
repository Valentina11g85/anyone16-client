import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";

/** Premium two-state switch: sliding glass knob between light and dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={light ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      title={light ? "Modo oscuro" : "Modo claro"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="theme-switch"
      data-on={light}
    >
      <Sun className="theme-switch-icon theme-switch-sun" aria-hidden />
      <Moon className="theme-switch-icon theme-switch-moon" aria-hidden />
      <span className="theme-switch-knob" aria-hidden />
    </button>
  );
}
