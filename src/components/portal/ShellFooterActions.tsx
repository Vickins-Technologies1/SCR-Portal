"use client";

import { LogOut } from "lucide-react";

type ShellFooterActionsProps = {
  onSignOut: () => void | Promise<void>;
  signOutLabel?: string;
  mobileBreakpoint?: "md" | "lg";
};

export default function ShellFooterActions({
  onSignOut,
  signOutLabel = "Sign out",
  mobileBreakpoint = "md",
}: ShellFooterActionsProps) {
  const visibilityClass = mobileBreakpoint === "lg" ? "lg:hidden" : "md:hidden";

  return (
    <button
      type="button"
      onClick={onSignOut}
      className={`${visibilityClass} group inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95`}
      title={signOutLabel}
      aria-label={signOutLabel}
    >
      <LogOut size={16} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
