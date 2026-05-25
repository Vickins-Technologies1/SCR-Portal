"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  LayoutDashboard,
  Home,
  Calendar,
  ClipboardList,
  MessagesSquare,
  Wrench,
  CreditCard,
  BarChart,
  Plug,
  Settings,
  UserCog,
} from "lucide-react";
import Cookies from "js-cookie";
import { useSidebar } from "./SidebarContext";
import type { AirbnbConversation } from "@/types/airbnb";
import ThemeToggle from "@/components/theme/ThemeToggle";

const useAuth = () => {
  if (typeof window === "undefined") {
    return { userId: null, role: null, ownerId: null, tier: null, permissions: [] as string[] };
  }
  return {
    userId: Cookies.get("userId") ?? null,
    role: Cookies.get("role") ?? null,
    ownerId: Cookies.get("ownerId") ?? Cookies.get("userId") ?? null,
    tier: Cookies.get("tier") ?? null,
    permissions: Cookies.get("permissions")
      ? JSON.parse(Cookies.get("permissions")!)
      : [],
  };
};

type NavLink = {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  requiredPermission?: string;
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, close } = useSidebar();
  const { userId, role, tier } = useAuth();
  const perm = usePermissions();
  const [name, setName] = useState("User");
  const [teamRole, setTeamRole] = useState("Team Member");
  const [mounted, setMounted] = useState(false);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userId || !["propertyOwner", "teamMember"].includes(role ?? "")) return;
    let cancelled = false;

    const fetchDueStatus = async () => {
      try {
        const res = await fetch("/api/owner-dues", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data.success) {
          setDueStatus(data);
        }
      } catch {
        // ignore
      }
    };

    fetchDueStatus();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  useEffect(() => {
    if (!userId || !perm.hasPermission("notifications:view")) return;
    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/airbnb/messages", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data.success) {
          const totalUnread = (data.conversations as AirbnbConversation[] | undefined)?.reduce(
            (sum, convo) => sum + (convo.unread || 0),
            0
          );
          setUnreadMessages(Number(totalUnread || 0));
        }
      } catch {
        // ignore
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, perm]);

  const isOwner = role === "propertyOwner";
  const isDue = !!dueStatus?.isDue;
  const restrictedKeys = new Set(["dashboard", "reports"]);
  const isFreeTier = tier === "free";

  const allLinks: NavLink[] = [
    { key: "dashboard", href: "/airbnb-dashboard", label: "Overview", icon: <LayoutDashboard size={20} />, requiredPermission: "dashboard:view" },
    { key: "listings", href: "/airbnb-dashboard/listings", label: "Listings", icon: <Home size={20} />, requiredPermission: "properties:view" },
    { key: "calendar", href: "/airbnb-dashboard/calendar", label: "Calendar", icon: <Calendar size={20} />, requiredPermission: "properties:view" },
    { key: "bookings", href: "/airbnb-dashboard/bookings", label: "Bookings", icon: <ClipboardList size={20} />, requiredPermission: "tenants:view" },
    { key: "inbox", href: "/airbnb-dashboard/inbox", label: "Inbox", icon: <MessagesSquare size={20} />, requiredPermission: "notifications:view" },
    { key: "operations", href: "/airbnb-dashboard/operations", label: "Operations", icon: <Wrench size={20} />, requiredPermission: "expenses:view" },
    { key: "payments", href: "/airbnb-dashboard/payments", label: "Payments", icon: <CreditCard size={20} />, requiredPermission: "payments:view" },
    { key: "reports", href: "/airbnb-dashboard/reports", label: "Reports", icon: <BarChart size={20} />, requiredPermission: "reports:view" },
    { key: "integrations", href: "/airbnb-dashboard/integrations", label: "Integrations", icon: <Plug size={20} />, requiredPermission: "settings:view" },
    { key: "users", href: "/airbnb-dashboard/users", label: "Users", icon: <UserCog size={20} />, requiredPermission: "users:view" },
    { key: "settings", href: "/airbnb-dashboard/settings", label: "Settings", icon: <Settings size={20} />, requiredPermission: "settings:view" },
  ];

  const visibleLinks = mounted
    ? allLinks.filter((link) => perm.hasPermission(link.requiredPermission ?? ""))
    : [];

  const navLinks = isDue ? visibleLinks.filter((link) => restrictedKeys.has(link.key)) : visibleLinks;
  useEffect(() => {
    if (!isDue) return;
    const allowed = ["/airbnb-dashboard", "/airbnb-dashboard/reports"];
    const isAllowed = allowed.some((base) => pathname === base || pathname.startsWith(base + "/"));
    if (!isAllowed) {
      router.replace("/airbnb-dashboard");
    }
  }, [isDue, pathname, router]);

  useEffect(() => {
    if (!userId) return;

    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/user?userId=${userId}&role=${role}`, { credentials: "include" });
        const data = await res.json();
        if (data.success && data.user) {
          setName(data.user.name || "User");
          if (role === "teamMember" && data.user.teamRole) {
            setTeamRole(data.user.teamRole);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user info:", err);
      }
    };

    const timer = setTimeout(fetchUser, 300);
    return () => clearTimeout(timer);
  }, [userId, role]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = mounted ? (isOwner ? "Property Owner" : teamRole) : "Account";

  return (
    <>
      <aside
        data-tour="airbnb-sidebar"
        className={`fixed left-0 top-16 bottom-0 z-40 w-[82vw] max-w-[18rem] md:w-72 bg-card backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)] border-r border-border transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:inset-y-0 flex flex-col`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent px-5 sm:px-6 py-5 sm:py-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] text-2xl font-bold text-white shadow-xl ring-4 ring-white/80">
                {initials}
              </div>

              <p className="text-xs tracking-[0.35em] uppercase text-muted-foreground">Welcome back</p>
              <h2 className="mt-1 text-lg sm:text-xl font-semibold text-gradient-primary">
                {name.split(" ")[0]}
              </h2>

              <span className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-primary/10 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                {roleLabel}
              </span>
              {mounted && (
                <span
                  className={`mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${
                    isFreeTier ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"
                  }`}
                >
                  {isFreeTier ? "Free Tier" : "Premium"}
                </span>
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-5 space-y-1.5">
            {navLinks.map(({ key, href, label, icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              const showUnreadBadge = key === "inbox" && unreadMessages > 0;
              return (
                <Link
                  key={key}
                  href={href}
                  onClick={close}
                  data-tour={`airbnb-nav-${key}`}
                  className={`group flex items-center gap-3 sm:gap-4 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  <span className={`relative ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`}>
                    {icon}
                    {showUnreadBadge && (
                      <span
                        className="absolute -top-2 -right-2 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                        aria-label={`${unreadMessages} unread messages`}
                      >
                        {unreadMessages > 99 ? "99+" : unreadMessages}
                      </span>
                    )}
                  </span>
                  <span className="truncate flex-1 flex items-center gap-2">
                    <span className="truncate">{label}</span>
                    {showUnreadBadge && (
                      <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                        {unreadMessages > 99 ? "99+" : unreadMessages}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}

            {navLinks.length === 0 && mounted && !perm.isOwner && (
              <div className="px-6 py-12 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Limited Access</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your account currently has no assigned permissions.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Please contact the property owner to grant access.
                </p>
              </div>
            )}
          </nav>

          <div className="mt-auto border-t border-border px-6 py-4 footer-fade">
            <div className="text-center space-y-1">
              <div className="flex justify-center pb-3">
                <ThemeToggle className="max-w-[260px]" />
              </div>
              {isFreeTier && (
                <div className="flex justify-center pb-2">
                  <Link
                    href={isDue ? "/airbnb-dashboard/reports" : "/upgrade"}
                    className="inline-flex items-center justify-center rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-primary/15 transition"
                  >
                    {isDue ? "Pay invoice" : "Upgrade to Premium"}
                  </Link>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground font-light tracking-wide opacity-80">
                © {new Date().getFullYear()} Sorana Property Managers Limited
              </p>
              <p className="text-[9px] text-muted-foreground font-light opacity-70">
                Developed by{" "}
                <a
                  href="https://www.vickinstechnologies.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200 underline underline-offset-2 decoration-gray-300/50 hover:decoration-primary/60"
                >
                  Vickins Technologies
                </a>
              </p>
            </div>
          </div>
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}
    </>
  );
}
