"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { SidebarProvider } from "./components/SidebarContext";

export default function PropertyOwnerDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <PublicThemeWrapper>
      <SidebarProvider>
        <div className="relative min-h-screen bg-background text-foreground text-[13px] sm:text-sm overflow-x-hidden">
          <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
          <div className="relative z-10">{children}</div>
        </div>
      </SidebarProvider>
    </PublicThemeWrapper>
  );
}




