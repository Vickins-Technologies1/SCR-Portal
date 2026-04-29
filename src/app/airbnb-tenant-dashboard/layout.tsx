"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  CalendarPlus,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  X,
} from "lucide-react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { useAirbnbTenantBooking } from "@/hooks/useAirbnbTenantBooking";

export default function AirbnbGuestPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const { booking } = useAirbnbTenantBooking();
  const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

  useIdleLogout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      Cookies.remove("userId");
      Cookies.remove("role");
      Cookies.remove("permissions");
      Cookies.remove("ownerId");
      Cookies.remove("managementType");
      Cookies.remove("csrf-token");
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      window.location.href = "/airbnb-tenant-login";
    },
  });

  useEffect(() => {
    const role = Cookies.get("role");
    const userId = Cookies.get("userId");
    const impersonating = Cookies.get("isImpersonating") === "true";
    const canAccessAsTenant = role === "tenant" && Boolean(userId);
    const canAccessAsImpersonator = role === "propertyOwner" && Boolean(userId) && impersonating;
    setIsImpersonating(Boolean(canAccessAsImpersonator));

    if (!canAccessAsTenant && !canAccessAsImpersonator) {
      router.replace("/airbnb-tenant-login");
    }
  }, [router]);

  useEffect(() => {
    if (isImpersonating) return;
    if (!pathname.startsWith("/airbnb-tenant-dashboard")) return;
    if (pathname.startsWith("/airbnb-tenant-dashboard/documents")) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/airbnb-tenant/documents", { credentials: "include" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success) return;
        const docs = Array.isArray(data.documents) ? data.documents : [];
        if (docs.length === 0) {
          router.replace("/airbnb-tenant-dashboard/documents");
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, isImpersonating]);

  const links = useMemo(
    () => [
      { key: "overview", href: "/airbnb-tenant-dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { key: "payments", href: "/airbnb-tenant-dashboard/payments", label: "Payments", icon: <CreditCard size={18} /> },
      { key: "docs", href: "/airbnb-tenant-dashboard/documents", label: "Security Docs", icon: <FileText size={18} /> },
      { key: "extend", href: "/airbnb-tenant-dashboard/extend-stay", label: "Extend Stay", icon: <CalendarPlus size={18} /> },
      { key: "messages", href: "/airbnb-tenant-dashboard/messages", label: "Message Owner", icon: <MessageCircle size={18} /> },
    ],
    []
  );

  const handleLogout = async () => {
    if (isImpersonating) {
      try {
        const res = await fetch("/api/revert-impersonation", { method: "POST", credentials: "include" });
        const json = await res.json();
        if (json?.success) {
          window.location.href = json.redirect || "/airbnb-dashboard";
          return;
        }
      } catch {
        // ignore
      }
    }

    Cookies.remove("userId");
    Cookies.remove("role");
    Cookies.remove("permissions");
    Cookies.remove("ownerId");
    Cookies.remove("managementType");
    Cookies.remove("csrf-token");
    Cookies.remove("impersonatingTenantId", { path: "/" });
    Cookies.remove("isImpersonating", { path: "/" });
    window.location.href = "/airbnb-tenant-login";
  };

  return (
    <PublicThemeWrapper>
      <div className="owner-portal relative min-h-[100svh] bg-background text-foreground overflow-x-hidden">
        <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />

        <header className="fixed top-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-xl border-b border-border">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden rounded-xl border border-border bg-white/70 p-2 text-muted-foreground hover:text-foreground"
                onClick={() => setIsSidebarOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.35em]">
                  Airbnb Guest Portal
                </p>
                <p className="text-sm sm:text-base font-semibold text-foreground">
                  {booking?.listingName || "Your stay"}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-gray-300 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-gray-700 transition-all hover:border-[#42c775]/70 hover:text-[#42c775] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#42c775]/30 focus:ring-offset-1 active:scale-95"
            >
              <LogOut size={16} className="transition-transform group-hover:rotate-6" />
              <span className="hidden sm:inline">{isImpersonating ? "Exit preview" : "Sign out"}</span>
            </button>
          </div>
        </header>

        <aside
          className={`fixed left-0 bottom-0 z-40 w-[82vw] max-w-[18rem] lg:w-72 bg-card border-r border-border backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)] transition-transform duration-300 ease-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:inset-y-0 top-16`}
        >
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent">
              <div className="flex justify-center mb-5">
                <img src="/logo.png" alt="Sorana Property Managers Logo" className="h-12 w-auto drop-shadow-md" />
              </div>

              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground font-medium">
                  Guest Portal
                </p>
                <p className="mt-1.5 text-sm font-semibold text-foreground truncate">
                  {booking?.guestName || "Welcome"}
                </p>
              </div>
            </div>

            <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
              {links.map(({ key, href, label, icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 text-xs sm:text-sm font-medium transition-all duration-200
                      ${isActive ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"}`}
                  >
                    <span className={isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}>
                      {icon}
                    </span>
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-border px-6 py-4 bg-gradient-to-t from-white/70 to-transparent">
              <p className="text-center text-[10px] text-muted-foreground font-light tracking-wide opacity-80">
                © {new Date().getFullYear()} Sorana Property Managers Limited
              </p>
            </div>
          </div>
        </aside>

        <main className="pt-16 lg:ml-72 p-5 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        {isSidebarOpen ? (
          <div
            className="fixed inset-x-0 bottom-0 top-16 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}
      </div>
    </PublicThemeWrapper>
  );
}
