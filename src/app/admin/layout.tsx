"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { useEffect } from "react";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import type { AdminPermission } from "@/lib/admin-permissions";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, isAdminOwner, hasPermission } = useAdminPermissions();
  const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

  useIdleLogout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      fetch("/api/signout", { method: "POST", credentials: "include" }).catch(() => {});
      Cookies.remove("userId", { path: "/" });
      Cookies.remove("role", { path: "/" });
      Cookies.remove("permissions", { path: "/" });
      Cookies.remove("ownerId", { path: "/" });
      Cookies.remove("managementType", { path: "/" });
      Cookies.remove("csrf-token", { path: "/" });
      router.replace("/admin/login");
    },
  });

  useEffect(() => {
    // Allow unauthenticated users to access the login screen.
    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return;

    if (role !== "admin" && role !== "adminTeamMember") {
      router.replace("/admin/login");
      return;
    }

    if (isAdminOwner) return;

    const resolveRequiredPermission = (path: string): AdminPermission | null => {
      if (path === "/admin" || path.startsWith("/admin/dashboard")) return "admin:dashboard:view";
      if (path.startsWith("/admin/properties")) return "admin:properties:view";
      if (path.startsWith("/admin/users")) return "admin:owners:view";
      if (path.startsWith("/admin/team-members")) return "admin:team-members:view";
      if (path.startsWith("/admin/payments")) return "admin:payments:view";
      if (path.startsWith("/admin/invoices")) return "admin:invoices:view";
      if (path.startsWith("/admin/airbnb")) return "admin:airbnb:view";
      if (path.startsWith("/admin/market-place")) return "admin:marketplace:view";
      if (path.startsWith("/admin/reviews")) return "admin:reviews:view";
      if (path.startsWith("/admin/support")) return "admin:support:view";
      if (path.startsWith("/admin/tuma-webhooks") || path.startsWith("/admin/kopokopo-webhooks")) return "admin:webhooks:view";
      return null;
    };

    const required = resolveRequiredPermission(pathname);
    if (required && !hasPermission(required)) {
      // Prefer redirecting to dashboard when possible; otherwise show a generic unauthorized page.
      if (hasPermission("admin:dashboard:view")) {
        router.replace("/admin/dashboard");
      } else {
        router.replace("/unauthorized");
      }
    }
  }, [pathname, router, role, isAdminOwner, hasPermission]);

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
