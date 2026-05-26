"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function resolveTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("sorana-theme-change"));
}

type ThemeToggleVariant = "full" | "icon";

type ThemeToggleProps = {
  className?: string;
  variant?: ThemeToggleVariant;
};

export default function ThemeToggle({ className = "", variant = "full" }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const sync = () => setTheme(resolveTheme());
    sync();

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("sorana-theme-change", sync as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sorana-theme-change", sync as EventListener);
    };
  }, []);

  if (!theme) return null;

  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  const baseClassName =
    "group inline-flex items-center gap-2 rounded-xl border border-border bg-card text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => applyTheme(nextTheme)}
        className={`${baseClassName} h-10 w-10 justify-center rounded-full p-0 ${className}`}
        aria-label={`Switch to ${nextTheme} theme`}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => applyTheme(nextTheme)}
      className={`${baseClassName} w-full justify-between px-3 py-2 ${className}`}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <span className="inline-flex items-center gap-2">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        <span>Theme</span>
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground opacity-80">
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
