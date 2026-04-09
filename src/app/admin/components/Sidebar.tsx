// src/app/admin/components/Sidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Headphones,
  AlertCircle,
  Home,
  CalendarCheck,
  MessageCircle,
  Wallet,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
};

type AdminSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [name, setName] = useState("Admin");
  const [mounted, setMounted] = useState(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const adminName = Cookies.get("adminName") || "Admin";
    setName(adminName);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchUnreadSupport = async () => {
      try {
        const res = await fetch("/api/support/messages?unreadCount=1", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data.success) {
          setUnreadSupportCount(Number(data.unreadCount || 0));
        }
      } catch {
        // ignore
      }
    };

    fetchUnreadSupport();
    const interval = setInterval(fetchUnreadSupport, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const initials = name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const firstName = name.split(" ")[0] || "Admin";

  const coreLinks: NavLink[] = [
    { key: "dashboard", href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "users", href: "/admin/users", label: "Property Owners", icon: <Users size={20} /> },
    { key: "properties", href: "/admin/properties", label: "Properties", icon: <Building2 size={20} /> },
    { key: "payments", href: "/admin/payments", label: "Payments & Invoices", icon: <CreditCard size={20} /> },
    { key: "support", href: "/admin/support", label: "Support", icon: <Headphones size={20} /> },
  ];

  const airbnbLinks: NavLink[] = [
    { key: "airbnb-overview", href: "/admin/airbnb", label: "Airbnb Overview", icon: <Home size={20} /> },
    { key: "airbnb-listings", href: "/admin/airbnb/listings", label: "Airbnb Listings", icon: <Building2 size={20} /> },
    { key: "airbnb-bookings", href: "/admin/airbnb/bookings", label: "Airbnb Bookings", icon: <CalendarCheck size={20} /> },
    { key: "airbnb-messages", href: "/admin/airbnb/messages", label: "Airbnb Messages", icon: <MessageCircle size={20} /> },
    { key: "airbnb-payouts", href: "/admin/airbnb/payouts", label: "Airbnb Payouts", icon: <Wallet size={20} /> },
    { key: "airbnb-integrations", href: "/admin/airbnb/integrations", label: "Integrations", icon: <Plug size={20} /> },
  ];

  const navSections = [
    {
      title: "Rentals Management",
      links: coreLinks,
      badge: {
        label: "Rentals",
        icon: <Building2 size={10} />,
        className: "bg-slate-100 text-slate-700",
      },
    },
    {
      title: "Airbnb Management",
      links: airbnbLinks,
      badge: {
        label: "Airbnb",
        icon: <Home size={10} />,
        className: "bg-primary/10 text-primary",
      },
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-16 bottom-0 z-40 flex flex-col bg-card backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)] border-r border-border transition-all duration-300 ease-out md:inset-y-0",
          "w-[82vw] max-w-[18rem] md:w-72",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isCollapsed ? "md:w-16" : "md:w-72"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Profile Header */}
          <div className="relative border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent px-5 sm:px-6 py-5 sm:py-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-2xl font-bold text-white shadow-xl ring-4 ring-white/80">
                {initials}
              </div>

              {!isCollapsed && (
                <>
                  <p className="text-xs tracking-[0.35em] uppercase text-muted-foreground">
                    Welcome back
                  </p>
                  <h2 className="mt-1 text-lg sm:text-xl font-semibold text-gradient-primary">
                    {firstName}
                  </h2>

                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Admin
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-5">
            <div className="space-y-5">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  {!isCollapsed && (
                    <div className="px-3 sm:px-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                          {section.title}
                        </p>
                        {section.badge && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                              section.badge.className
                            )}
                          >
                            {section.badge.icon}
                            {section.badge.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {section.links.map(({ key, href, label, icon }) => {
                      const showUnreadBadge = key === "support" && unreadSupportCount > 0;
                      return (
                        <li key={key}>
                          <Link
                            href={href}
                            onClick={onClose}
                            className={cn(
                              "group flex items-center rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-all duration-200",
                              isCollapsed ? "justify-center" : "gap-3 sm:gap-4",
                              isActive(href)
                                ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                                : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                            )}
                          >
                            <span
                              className={cn(
                                "relative flex h-5 w-5 items-center justify-center transition-colors",
                                isActive(href) ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                              )}
                            >
                              {icon}
                              {showUnreadBadge && (
                                <span
                                  className="absolute -top-2 -right-2 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                                  aria-label={`${unreadSupportCount} unread support messages`}
                                >
                                  {unreadSupportCount > 99 ? "99+" : unreadSupportCount}
                                </span>
                              )}
                            </span>

                            {!isCollapsed && (
                              <span className="truncate">
                                {label}
                                {showUnreadBadge && (
                                  <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                                    {unreadSupportCount > 99 ? "99+" : unreadSupportCount}
                                  </span>
                                )}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {navSections.every((section) => section.links.length === 0) && mounted && (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <AlertCircle className="mb-5 h-14 w-14 text-amber-500/80" />
                  <h3 className="text-lg font-semibold text-foreground">No Modules Available</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Something went wrong — please refresh or contact support.
                  </p>
                </div>
              )}
            </div>
          </nav>

          {/* Footer */}
          <div className="mt-auto border-t border-border bg-gradient-to-t from-white/70 to-transparent px-6 py-4 text-center text-[10px] text-muted-foreground">
            <p>© {new Date().getFullYear()} Sorana Property Managers Limited</p>
            {!isCollapsed && (
              <p className="mt-2">
                Developed by{" "}
                <a
                  href="https://vickins-technologies.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-primary"
                >
                  Vickins Technologies
                </a>
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}
