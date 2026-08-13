"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CreditCard,
  Bell,
  Settings,
  Building2,
  Users,
  BarChart,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

type Variant = "tenant" | "owner" | "airbnb-owner";

type Tab = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  Icon: (props: { className?: string }) => ReactNode;
};

function isActive(pathname: string, tab: Tab) {
  if (tab.match === "exact") return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

export default function BottomTabs({ variant, hidden = false }: { variant: Variant; hidden?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isDue, setIsDue] = useState(false);
  const [isFreeTier, setIsFreeTier] = useState(false);

  const storageKey = `sorana-bottom-tabs-collapsed:${variant}`;

  useEffect(() => {
    try {
      const value = localStorage.getItem(storageKey);
      setCollapsed(value === "1");
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    const updateModalState = () => {
      setModalOpen(
        Boolean(
          document.querySelector(".modal-backdrop, .modal-panel, [role='dialog']")
        )
      );
    };

    updateModalState();

    const observer = new MutationObserver(updateModalState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (variant !== "owner") return;
    try {
      setIsFreeTier(Cookies.get("tier") === "free");
    } catch {
      setIsFreeTier(false);
    }

    let cancelled = false;
    const fetchDueStatus = async () => {
      try {
        const res = await fetch("/api/owner-dues", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) {
          setIsDue(Boolean(data.isDue));
        }
      } catch {
        // ignore
      }
    };

    fetchDueStatus();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const tabs = useMemo<Tab[]>(() => {
    if (variant === "tenant") {
      return [
        { href: "/tenant-dashboard", label: "Home", match: "exact", Icon: (p) => <LayoutDashboard {...p} /> },
        { href: "/tenant-dashboard/payments", label: "Pay", match: "prefix", Icon: (p) => <CreditCard {...p} /> },
        { href: "/tenant-dashboard/notifications", label: "Alerts", match: "prefix", Icon: (p) => <Bell {...p} /> },
        { href: "/tenant-dashboard/settings", label: "Settings", match: "prefix", Icon: (p) => <Settings {...p} /> },
      ];
    }

    if (variant === "airbnb-owner") {
      return [
        { href: "/airbnb-dashboard", label: "Home", match: "exact", Icon: (p) => <LayoutDashboard {...p} /> },
        { href: "/airbnb-dashboard/listings", label: "Listings", match: "prefix", Icon: (p) => <Building2 {...p} /> },
        { href: "/airbnb-dashboard/payments", label: "Payments", match: "prefix", Icon: (p) => <CreditCard {...p} /> },
        { href: "/airbnb-dashboard/users", label: "Team", match: "prefix", Icon: (p) => <Users {...p} /> },
        { href: "/airbnb-dashboard/settings", label: "Settings", match: "prefix", Icon: (p) => <Settings {...p} /> },
      ];
    }

    const showPropertiesReportTab = variant === "owner" && isDue && isFreeTier;

    return [
      { href: "/property-owner-dashboard", label: "Home", match: "exact", Icon: (p) => <LayoutDashboard {...p} /> },
      showPropertiesReportTab
        ? { href: "/property-owner-dashboard/properties-report", label: "Report", match: "prefix", Icon: (p) => <BarChart {...p} /> }
        : { href: "/property-owner-dashboard/properties", label: "Props", match: "prefix", Icon: (p) => <Building2 {...p} /> },
      { href: "/property-owner-dashboard/tenants", label: "Tenants", match: "prefix", Icon: (p) => <Users {...p} /> },
      { href: "/property-owner-dashboard/payments", label: "Payments", match: "prefix", Icon: (p) => <CreditCard {...p} /> },
      { href: "/property-owner-dashboard/settings", label: "Settings", match: "prefix", Icon: (p) => <Settings {...p} /> },
    ];
  }, [variant, isDue, isFreeTier]);

  if (hidden) return null;
  if (modalOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div className="mx-auto max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)]">
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
            aria-label={collapsed ? "Expand bottom navigation" : "Collapse bottom navigation"}
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>

        {!collapsed && (
          <nav className="flex items-stretch justify-between rounded-2xl border border-border bg-card backdrop-blur-xl shadow-[0_10px_40px_rgba(15,23,42,0.22)]">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 transition ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`grid h-9 w-10 place-items-center rounded-xl transition ${
                      active ? "bg-primary/10 ring-1 ring-primary/25" : "bg-transparent"
                    }`}
                  >
                    <tab.Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
