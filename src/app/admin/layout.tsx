"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PublicThemeWrapper>
      <div className="owner-portal relative min-h-[100svh] bg-background text-foreground overflow-x-hidden">
        <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
        <div className="relative z-10">{children}</div>
      </div>
    </PublicThemeWrapper>
  );
}
