"use client";

import { useEffect, useRef, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";
type ThemeToggleVariant = "full" | "icon";

type ThemeToggleProps = {
  className?: string;
  variant?: ThemeToggleVariant;
  global?: boolean;
};

const STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "sorana-theme-change";

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(preference = readPreference()): Theme {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeColor(theme: Theme) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#000000" : "#f6f8f7";
}

function setTheme(preference: ThemePreference, origin: HTMLElement | null) {
  const root = document.documentElement;
  if (root.dataset.themeTransitioning === "true") return false;

  const nextTheme = resolveTheme(preference);
  const currentTheme = root.dataset.theme === "dark" ? "dark" : "light";

  const commit = () => {
    root.dataset.themePreference = preference;
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    updateThemeColor(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // The current page still gets the selected theme when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  if (currentTheme === nextTheme) {
    commit();
    return true;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startViewTransition = (document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  }).startViewTransition;

  if (!reducedMotion && startViewTransition) {
    const rect = origin?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const radius = Math.ceil(Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y),
    ));

    root.style.setProperty("--theme-origin-x", `${x}px`);
    root.style.setProperty("--theme-origin-y", `${y}px`);
    root.style.setProperty("--theme-reveal-radius", `${radius}px`);
    root.dataset.themeTransitioning = "true";

    const cleanup = () => {
      root.style.removeProperty("--theme-origin-x");
      root.style.removeProperty("--theme-origin-y");
      root.style.removeProperty("--theme-reveal-radius");
      delete root.dataset.themeTransitioning;
    };

    let transition: ReturnType<NonNullable<typeof startViewTransition>>;
    try {
      transition = startViewTransition.call(document, commit);
    } catch {
      cleanup();
      commit();
      return true;
    }

    void transition.finished.then(cleanup, cleanup);
    return true;
  }

  commit();
  return true;
}

export default function ThemeToggle({ className = "", variant = "full", global = false }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => {
      const nextPreference = readPreference();
      setPreference(nextPreference);
      setResolvedTheme(resolveTheme(nextPreference));
    };
    sync();

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const next = readPreference();
        setPreference(next);
        const root = document.documentElement;
        const theme = resolveTheme(next);
        setResolvedTheme(theme);
        root.dataset.themePreference = next;
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        updateThemeColor(theme);
      }
    };
    const onSystemChange = () => {
      if (readPreference() === "system") {
        const theme = resolveTheme("system");
        setResolvedTheme(theme);
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        updateThemeColor(theme);
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      }
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    media.addEventListener("change", onSystemChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light Mode", Icon: Sun },
    { value: "dark", label: "Dark Mode", Icon: Moon },
    { value: "system", label: "System", Icon: Laptop },
  ];
  const selected = options.find((option) => option.value === preference) ?? options[2];
  const baseClassName =
    "group inline-flex items-center gap-2 rounded-xl border border-border bg-card text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div ref={containerRef} className="theme-toggle relative inline-flex" data-theme-nav-control={global ? undefined : ""}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => containerRef.current?.querySelector<HTMLButtonElement>("[role='menuitemradio']")?.focus());
          }
        }}
        className={`${baseClassName} ${variant === "icon" ? "h-10 w-10 justify-center rounded-full p-0" : "w-full justify-between px-3 py-2"} ${className}`}
        aria-label={`Theme: ${selected.label}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${selected.label}`}
      >
        <span className="inline-flex items-center gap-2">
          <selected.Icon className="h-4 w-4" aria-hidden="true" />
          {variant === "full" && <span>Theme</span>}
        </span>
        {variant === "full" && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground opacity-80">
            {selected.label}
          </span>
        )}
        <span className="sr-only">Current appearance: {resolvedTheme}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Choose color theme"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-[110] mt-2 min-w-44 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1.5 text-foreground shadow-xl"
        >
          {options.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              onClick={() => {
                if (!setTheme(value, triggerRef.current)) return;
                setPreference(value);
                setResolvedTheme(resolveTheme(value));
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-foreground transition hover:bg-muted focus:bg-muted focus:outline-none"
            >
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {preference === value && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
