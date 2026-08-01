"use client";

import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

type ShellFooterActionsProps = {
  onSignOut: () => void | Promise<void>;
  signOutLabel?: string;
};

export default function ShellFooterActions({
  onSignOut,
  signOutLabel = "Sign out",
}: ShellFooterActionsProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/75 p-2 shadow-sm backdrop-blur">
      <ThemeToggle variant="icon" />
      <button
        onClick={onSignOut}
        className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95"
        title={signOutLabel}
        aria-label={signOutLabel}
      >
        <LogOut size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
