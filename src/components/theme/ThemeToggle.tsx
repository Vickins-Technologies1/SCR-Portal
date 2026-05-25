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

export default function ThemeToggle({ className = "" }: { className?: string }) {
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

  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      className={`group inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground hover:shadow ${className}`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
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
