"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { useIdleLogout } from "@/hooks/useIdleLogout";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

  useIdleLogout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      Cookies.remove("userId");
      Cookies.remove("role");
      Cookies.remove("permissions");
      Cookies.remove("ownerId");
      Cookies.remove("csrf-token");
      router.replace("/admin/login");
    },
  });

  return (
    <PublicThemeWrapper>
      <div className="owner-portal relative min-h-[100svh] bg-background text-foreground text-[12px] sm:text-[13px] lg:text-sm overflow-x-hidden">
        <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
        <div className="relative z-10">{children}</div>
      </div>
    </PublicThemeWrapper>
  );
}
