"use client";

import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

type DesktopBreakpoint = "md" | "lg";

type DashboardNavbarActionsProps = {
  onSignOut: () => void | Promise<void>;
  desktopBreakpoint?: DesktopBreakpoint;
};

export default function DashboardNavbarActions({
  onSignOut,
  desktopBreakpoint = "md",
}: DashboardNavbarActionsProps) {
  const visibilityClass = desktopBreakpoint === "lg" ? "hidden lg:flex" : "hidden md:flex";

  return (
    <div
      className={`${visibilityClass} items-center gap-1 rounded-2xl border border-border/70 bg-background/70 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl`}
      role="group"
      aria-label="Account actions"
    >
      <ThemeToggle
        variant="icon"
        className="h-9 w-9 rounded-xl border-transparent bg-transparent shadow-none hover:bg-primary/10 hover:shadow-none"
      />
      <span className="h-5 w-px bg-border/80" aria-hidden="true" />
      <button
        type="button"
        onClick={onSignOut}
        className="group inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition duration-200 hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut size={15} className="transition-transform group-hover:translate-x-0.5" />
        <span>Sign out</span>
      </button>
    </div>
  );
}
