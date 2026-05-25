"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CreditCard,
  Bell,
  Settings,
  Building2,
  Users,
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

export default function BottomTabs({ variant }: { variant: Variant }) {
  const pathname = usePathname();

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

    return [
      { href: "/property-owner-dashboard", label: "Home", match: "exact", Icon: (p) => <LayoutDashboard {...p} /> },
      { href: "/property-owner-dashboard/properties", label: "Props", match: "prefix", Icon: (p) => <Building2 {...p} /> },
      { href: "/property-owner-dashboard/tenants", label: "Tenants", match: "prefix", Icon: (p) => <Users {...p} /> },
      { href: "/property-owner-dashboard/payments", label: "Payments", match: "prefix", Icon: (p) => <CreditCard {...p} /> },
      { href: "/property-owner-dashboard/settings", label: "Settings", match: "prefix", Icon: (p) => <Settings {...p} /> },
    ];
  }, [variant]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div className="mx-auto max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)]">
        <nav className="flex items-stretch justify-between rounded-2xl border border-white/40 bg-white/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(15,23,42,0.22)]">
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
      </div>
    </div>
  );
}
