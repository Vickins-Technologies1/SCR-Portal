"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CreditCard,
  Bell,
  Settings,
  LogOut,
  Wrench,
  DoorOpen,
  Sparkles,
  Shield,
  Loader2,
} from "lucide-react";
import Cookies from "js-cookie";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import TourGuide, { TourStep } from "@/components/tour/TourGuide";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import NavbarDateTime from "@/components/NavbarDateTime";
import BottomTabs from "@/components/mobile/BottomTabs";
import ThemeToggle from "@/components/theme/ThemeToggle";

const useAuth = () => {
  if (typeof window === "undefined") return { userId: null, role: null };
  const userId = Cookies.get("userId") || null;
  const role = Cookies.get("role") || null;
  return { userId, role };
};

interface UserResponse {
  success: boolean;
  user?: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    accountType?: string;
    createdAt: string;
    userId: string;
    propertyId?: string;
    unitType?: string;
    price?: number;
    deposit?: number;
    houseNumber?: string;
    ownerId?: string;
  };
  message?: string;
}

export default function TenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { userId, role } = useAuth();
  const [name, setName] = useState<string>("Tenant");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [tenantFeatures, setTenantFeatures] = useState<{ canPay: boolean; canNotifications: boolean } | null>(null);
  const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

  useIdleLogout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      fetch("/api/signout", { method: "POST", credentials: "include" }).catch(() => {});
      Cookies.remove("userId");
      Cookies.remove("role");
      Cookies.remove("permissions");
      Cookies.remove("ownerId");
      Cookies.remove("managementType");
      Cookies.remove("csrf-token");
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      window.location.href = "/tenant-login";
    },
  });

  const links = useMemo(() => {
    const base = [
      { key: "overview", href: "/tenant-dashboard", label: "Overview", icon: <LayoutDashboard size={18} /> },
      { key: "payments", href: "/tenant-dashboard/payments", label: "Payments", icon: <CreditCard size={18} /> },
      { key: "maintenance", href: "/tenant-dashboard/maintenance", label: "Maintenance", icon: <Wrench size={18} /> },
      { key: "notifications", href: "/tenant-dashboard/notifications", label: "Notifications", icon: <Bell size={18} /> },
      { key: "vacate", href: "/tenant-dashboard/vacate", label: "Vacate Notice", icon: <DoorOpen size={18} /> },
      { key: "settings", href: "/tenant-dashboard/settings", label: "Settings", icon: <Settings size={18} /> },
    ];

    if (tenantFeatures?.canNotifications === false) {
      return base.filter((link) => link.key !== "notifications");
    }

    return base;
  }, [tenantFeatures]);

  useEffect(() => {
    const impersonating = Cookies.get("isImpersonating") === "true";
    setIsImpersonating(impersonating);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant/features", { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.success) {
          setTenantFeatures(data.features || null);
        } else {
          setTenantFeatures(null);
        }
      } catch {
        if (!cancelled) setTenantFeatures(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchUserName = async () => {
      setIsLoading(true);
      try {
        if (isImpersonating) {
          const response = await fetch("/api/tenant/profile", { credentials: "include" });
          const data = await response.json();
          if (data.success && data.tenant?.name) {
            setName(data.tenant.name);
          }
        } else if (role === "tenant") {
          const response = await fetch(
            `/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`,
            { credentials: "include" }
          );
          const data: UserResponse = await response.json();
          if (data.success && data.user?.accountType === "airbnb_guest") {
            window.location.href = "/airbnb-tenant-dashboard";
            return;
          }
          if (data.success && data.user?.name) setName(data.user.name);
        }
      } catch {
        setError("Connection error");
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchUserName, 300);
    return () => clearTimeout(timer);
  }, [userId, role, isImpersonating]);

  const handleLogout = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    Cookies.remove("managementType");
    Cookies.remove("impersonatingTenantId", { path: "/" });
    Cookies.remove("isImpersonating", { path: "/" });
    window.location.href = "/tenant-login";
  };

  const handleRevertImpersonation = async () => {
    if (isReverting) return;
    setIsReverting(true);

    try {
      const res = await fetch("/api/revert-impersonation", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        Cookies.remove("impersonatingTenantId", { path: "/" });
        Cookies.remove("isImpersonating", { path: "/" });
        const fallback =
          Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
        router.push(data.redirect || fallback);
      }
    } catch {
      setError("Failed to exit impersonation");
    } finally {
      setIsReverting(false);
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tenantSteps: TourStep[] = [
    {
      title: "Navigation Sidebar",
      body: "Use this menu to switch between your overview, payments, maintenance, and settings.",
      selector: '[data-tour="tenant-sidebar"]',
      placement: "right",
    },
    {
      title: "Overview",
      body: "Your main dashboard with balance, dues, and recent activity.",
      selector: '[data-tour="tenant-nav-overview"]',
      placement: "right",
    },
    {
      title: "Payments",
      body: "Review payment history and make new payments.",
      selector: '[data-tour="tenant-nav-payments"]',
      placement: "right",
    },
    {
      title: "Maintenance",
      body: "Report issues and track maintenance updates.",
      selector: '[data-tour="tenant-nav-maintenance"]',
      placement: "right",
    },
    {
      title: "Vacate Notice",
      body: "Submit your move‑out notice and track approvals.",
      selector: '[data-tour="tenant-nav-vacate"]',
      placement: "right",
    },
    {
      title: "Settings",
      body: "Update your profile details and password.",
      selector: '[data-tour="tenant-nav-settings"]',
      placement: "right",
    },
    {
      title: "Top Bar",
      body: "Access the menu on mobile, restart this tour, or sign out securely.",
      selector: '[data-tour="tenant-navbar"]',
      placement: "bottom",
    },
    {
      title: "Workspace",
      body: "Your selected section appears here with cards, tables, and actions.",
      selector: '[data-tour="tenant-workspace"]',
      placement: "top",
    },
    {
      title: "Make a Payment",
      body: "Initiate rent, deposit, or utility payments directly from your dashboard.",
      selector: '[data-tour="tenant-payments-action"]',
      placement: "bottom",
      paths: ["/tenant-dashboard/payments"],
    },
    {
      title: "Payment History",
      body: "Track payment status and download receipts from this table.",
      selector: '[data-tour="tenant-payments-table"]',
      placement: "top",
      paths: ["/tenant-dashboard/payments"],
    },
    {
      title: "Maintenance Requests",
      body: "Log repair issues and track progress with your property manager.",
      selector: '[data-tour="tenant-maintenance-header"]',
      placement: "bottom",
      paths: ["/tenant-dashboard/maintenance"],
    },
    {
      title: "New Request",
      body: "Submit a new maintenance request in seconds.",
      selector: '[data-tour="tenant-maintenance-action"]',
      placement: "bottom",
      paths: ["/tenant-dashboard/maintenance"],
    },
    {
      title: "Need a refresher?",
      body: "Tap the Tour button in the top bar anytime to replay this guide.",
      placement: "center",
    },
  ];

  return (
    <PublicThemeWrapper>
    <div className="min-h-[100svh] flex flex-col bg-background text-foreground overflow-x-hidden">
      {isImpersonating && (
        <div className="fixed top-0 inset-x-0 z-50 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
              <Shield className="w-5 h-5" />
              <div>
                <p className="font-medium">Impersonating tenant</p>
                <p className="text-xs opacity-90">{name || "Tenant"}</p>
              </div>
            </div>
            <button
              onClick={handleRevertImpersonation}
              disabled={isReverting}
              className="flex items-center gap-2 bg-card text-red-400 px-4 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60 transition"
            >
              {isReverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reverting…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  Exit
                </>
              )}
            </button>
          </div>
        </div>
      )}
      {/* ─── Navbar ─── */}
      <header
        data-tour="tenant-navbar"
        className={`fixed left-0 right-0 z-20 h-16 w-full max-w-[100vw] border-b border-border bg-card backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] ${
          isImpersonating ? "top-10" : "top-0"
        }`}
      >
        <div className="flex h-full w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6 lg:pl-[18rem] lg:pr-8">
          {/* Left side – logo + mobile toggle */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle menu"
              title="Menu"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <img
                src="/logo.png"
                alt="Sorana Property Managers Logo"
                className="h-8 w-auto max-w-[120px] rounded-md object-contain drop-shadow-sm sm:h-9 sm:max-w-[140px]"
              />
              <NavbarDateTime />
            </div>
          </div>

          {/* Right side – actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event("start-tenant-tour"))}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 active:scale-95"
              title="Start tour"
            >
              <Sparkles size={16} className="transition-transform group-hover:rotate-6" />
              <span className="hidden sm:inline">Tour</span>
            </button>
            <button
              onClick={handleLogout}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 active:scale-95"
            >
              <LogOut size={16} className="transition-transform group-hover:rotate-6" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Sidebar ─── */}
      <aside
        data-tour="tenant-sidebar"
        className={`fixed left-0 bottom-0 z-40 w-[82vw] max-w-[18rem] lg:w-72 bg-card border-r border-border backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)] transition-transform duration-300 ease-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:inset-y-0 ${isImpersonating ? "top-[6.5rem]" : "top-16"}`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent">
            <div className="flex justify-center mb-5">
              <img
                src="/logo.png"
                alt="Sorana Property Managers Logo"
                className="h-12 w-auto drop-shadow-md"
              />
            </div>

            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground font-medium">Tenant Portal</p>
              <p className="mt-1.5 text-lg font-semibold text-foreground">
                {isLoading ? "…" : error ? "Welcome" : name}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
            {links.map(({ key, href, label, icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsSidebarOpen(false)}
                  data-tour={`tenant-nav-${key}`}
                  className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 text-xs sm:text-sm font-medium transition-all duration-200
                    ${isActive
                      ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                    }`}
                >
                  <span className={isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}>
                    {icon}
                  </span>
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border px-6 py-4 footer-fade">
            <div className="flex justify-center pb-3">
              <ThemeToggle className="max-w-[260px]" />
            </div>
            <p className="text-center text-[10px] text-muted-foreground font-light tracking-wide opacity-80">
              © {new Date().getFullYear()} Sorana Property Managers Limited
            </p>
            <p className="text-center text-[9px] text-muted-foreground mt-1 opacity-70">
              Built by{" "}
              <a
                href="https://www.vickinstechnologies.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors underline underline-offset-2 decoration-gray-300/40 hover:decoration-primary/50"
              >
                Vickins Technologies
              </a>
            </p>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main
        className={`flex-1 ${isImpersonating ? "pt-[6.5rem]" : "pt-16"} lg:ml-72 p-5 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-8`}
        data-tour="tenant-workspace"
      >
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      <BottomTabs variant="tenant" />

      {isSidebarOpen && (
        <div
          className={`fixed inset-x-0 bottom-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden ${
            isImpersonating ? "top-[6.5rem]" : "top-16"
          }`}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <TourGuide
        steps={tenantSteps}
        storageKey="tenant-tour-v1"
        startEventName="start-tenant-tour"
        currentPath={pathname}
      />
    </div>
    </PublicThemeWrapper>
  );
}
