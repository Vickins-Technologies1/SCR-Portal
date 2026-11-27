"use client";

import ThemeToggle from "@/components/theme/ThemeToggle";

export default function GlobalThemeControl() {
  return (
    <div className="global-theme-control fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[100]">
      <ThemeToggle global variant="icon" className="h-10 w-10 rounded-full shadow-lg" />
    </div>
  );
}
