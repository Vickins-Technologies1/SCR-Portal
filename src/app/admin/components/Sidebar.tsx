"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  AlertTriangle,
  Award,
  Banknote,
  Building2,
  CalendarCheck,
  ChevronDown,
  FileCheck,
  GitCompareArrows,
  Headset,
  House,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Send,
  Star,
  Store,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import type { AdminPermission } from "@/lib/admin-permissions";
import ShellFooterActions from "@/components/portal/ShellFooterActions";

type NavLink = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  requiredPermission?: AdminPermission;
};

type NavSection = {
  key: string;
  title: string;
  links: NavLink[];
};

type AdminSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

const NAV_SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    links: [
      { key: "overview", href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard, requiredPermission: "admin:dashboard:view" },
    ],
  },
  {
    key: "property-operations",
    title: "Property Operations",
    links: [
      { key: "properties", href: "/admin/properties", label: "Properties", icon: Building2, requiredPermission: "admin:properties:view" },
      { key: "users", href: "/admin/users", label: "Property Owners", icon: Users, requiredPermission: "admin:owners:view" },
      { key: "team-members", href: "/admin/team-members", label: "Team Members", icon: UsersRound, requiredPermission: "admin:team-members:view" },
    ],
  },
  {
    key: "financial-management",
    title: "Financial Management",
    links: [
      { key: "payments", href: "/admin/payments", label: "Payments & Invoices", icon: Wallet, requiredPermission: "admin:payments:view" },
      { key: "tenant-invoices", href: "/admin/tenant-invoices", label: "Tenant Invoice Health", icon: FileCheck, requiredPermission: "admin:payments:view" },
      { key: "payment-reconciliation", href: "/admin/payments/reconciliation", label: "Payment Reconciliation", icon: GitCompareArrows, requiredPermission: "admin:payments:view" },
      { key: "lifetime", href: "/admin/lifetime", label: "Lifetime Packages", icon: Award, requiredPermission: "admin:payments:view" },
      { key: "referrals", href: "/admin/referrals", label: "Referrals & Payouts", icon: Users, requiredPermission: "admin:referrals:view" },
    ],
  },
  {
    key: "airbnb-management",
    title: "Airbnb Management",
    links: [
      { key: "airbnb-listings", href: "/admin/airbnb/listings", label: "Airbnb Listings", icon: House, requiredPermission: "admin:airbnb:view" },
      { key: "airbnb-bookings", href: "/admin/airbnb/bookings", label: "Airbnb Bookings", icon: CalendarCheck, requiredPermission: "admin:airbnb:view" },
      { key: "airbnb-messages", href: "/admin/airbnb/messages", label: "Airbnb Messages", icon: MessagesSquare, requiredPermission: "admin:airbnb:view" },
      { key: "airbnb-payouts", href: "/admin/airbnb/payouts", label: "Airbnb Payouts", icon: Banknote, requiredPermission: "admin:airbnb:view" },
    ],
  },
  {
    key: "platform-management",
    title: "Platform Management",
    links: [
      { key: "market-place", href: "/admin/market-place", label: "Marketplace", icon: Store, requiredPermission: "admin:marketplace:view" },
      { key: "integrations", href: "/admin/integrations", label: "Integrations", icon: Plug, requiredPermission: "admin:settings:manage" },
      { key: "reviews", href: "/admin/reviews", label: "Reviews", icon: Star, requiredPermission: "admin:reviews:view" },
    ],
  },
  {
    key: "communication-support",
    title: "Communication & Support",
    links: [
      { key: "support", href: "/admin/support", label: "Support", icon: Headset, requiredPermission: "admin:support:view" },
      { key: "communications", href: "/admin/communications", label: "Owner Communications", icon: Send, requiredPermission: "admin:notifications:send" },
    ],
  },
  {
    key: "system-security",
    title: "System & Security",
    links: [
      { key: "system-errors", href: "/admin/system-errors", label: "System Errors", icon: AlertTriangle, requiredPermission: "admin:dashboard:view" },
    ],
  },
];

const COLLAPSED_WIDTH = "72px";
const EXPANDED_WIDTH = "256px";

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isLinkActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;

  // When a more specific navigation destination matches, highlight only that
  // destination (for example, reconciliation rather than its payments parent).
  return !NAV_SECTIONS.flatMap((section) => section.links).some(
    (link) => link.href !== href && link.href.startsWith(`${href}/`) && matchesPath(pathname, link.href),
  );
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [name, setName] = useState("Admin");
  const [mounted, setMounted] = useState(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_SECTIONS.map((section) => [section.key, true])),
  );
  const { role, isAdminOwner, hasPermission } = useAdminPermissions();

  useEffect(() => {
    setMounted(true);
    setName(Cookies.get("adminName") || "Admin");
    setIsCollapsed(window.localStorage.getItem("adminSidebarCollapsed") === "true");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem("adminSidebarCollapsed", String(isCollapsed));
    document.querySelector<HTMLElement>(".admin-layout")?.style.setProperty(
      "--admin-sidebar-width",
      isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
    );
  }, [isCollapsed, mounted]);

  useEffect(() => {
    const activeSection = NAV_SECTIONS.find((section) =>
      section.links.some((link) => isLinkActive(pathname, link.href)),
    );
    if (activeSection) {
      setExpandedSections((current) => ({ ...current, [activeSection.key]: true }));
    }
  }, [pathname]);

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
        // The navigation remains usable when the unread count is unavailable.
      }
    };

    void fetchUnreadSupport();
    const interval = window.setInterval(fetchUnreadSupport, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const media = window.matchMedia("(max-width: 767px)");

    const syncScrollLock = () => {
      root.style.overflow = media.matches ? "hidden" : previousRootOverflow;
      body.style.overflow = media.matches ? "hidden" : previousBodyOverflow;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    syncScrollLock();
    media.addEventListener("change", syncScrollLock);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      media.removeEventListener("change", syncScrollLock);
      window.removeEventListener("keydown", handleKeyDown);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen, onClose]);

  const initials = name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const firstName = name.split(" ")[0] || "Admin";
  const profileName = isAdminOwner ? firstName : name;
  const profileRole = isAdminOwner
    ? "Admin Owner · Administrator"
    : role === "adminTeamMember"
      ? "Team Member · Administrator"
      : "Administrator";

  const handleSignOut = async () => {
    try {
      await fetch("/api/signout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore network failures; we still clear client-visible state.
    } finally {
      Cookies.remove("userId", { path: "/" });
      Cookies.remove("role", { path: "/" });
      Cookies.remove("permissions", { path: "/" });
      Cookies.remove("ownerId", { path: "/" });
      Cookies.remove("managementType", { path: "/" });
      Cookies.remove("tier", { path: "/" });
      Cookies.remove("adminName", { path: "/" });
      Cookies.remove("csrf-token", { path: "/" });
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      Cookies.remove("adminOriginalUserId", { path: "/" });
      Cookies.remove("adminOriginalRole", { path: "/" });
      Cookies.remove("adminImpersonating", { path: "/" });
      Cookies.remove("adminImpersonatingOwnerId", { path: "/" });
      Cookies.remove("adminImpersonatingOwnerName", { path: "/" });
      localStorage.removeItem("userId");
      localStorage.removeItem("role");
      router.replace("/admin/login");
    }
  };

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) => !link.requiredPermission || hasPermission(link.requiredPermission)),
  })).filter((section) => section.links.length > 0);

  return (
    <>
      <aside
        aria-label="Admin navigation"
        className={cn(
          "sorana-sidebar sorana-admin-sidebar fixed left-0 top-16 bottom-0 z-40 flex flex-col border-r border-border bg-card backdrop-blur-xl md:inset-y-0",
          "w-[82vw] max-w-[18rem] md:w-64",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          "transition-[transform,width,max-width] duration-200 ease-out",
        )}
        data-collapsed={isCollapsed}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="sorana-admin-sidebar-brand flex h-[68px] shrink-0 items-center justify-between border-b border-border px-3">
            <div className={cn("flex min-w-0 items-center gap-2.5", isCollapsed && "gap-1")}>
              <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary", isCollapsed ? "h-7 w-7" : "h-9 w-9")}>
                <Building2 size={19} strokeWidth={1.8} />
              </span>
              {!isCollapsed && (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-5 text-foreground">Accurate Rent</span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Admin console</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsCollapsed((value) => !value)}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:inline-flex",
                isCollapsed && "h-7 w-7",
              )}
            >
              {isCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>

          <nav className="sorana-sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3" aria-label="Admin sections">
            <div className="space-y-3">
              {visibleSections.map((section) => {
                const isExpanded = expandedSections[section.key] ?? true;
                const panelId = `admin-nav-${section.key}`;
                const hasActiveLink = section.links.some((link) => isLinkActive(pathname, link.href));

                return (
                  <section key={section.key} aria-label={section.title}>
                    <button
                      type="button"
                      onClick={() => setExpandedSections((current) => ({ ...current, [section.key]: !isExpanded }))}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${section.title}`}
                      title={isCollapsed ? section.title : undefined}
                      className={cn(
                        "group flex min-h-7 w-full items-center justify-between rounded-md px-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        isCollapsed && "justify-center px-0",
                        hasActiveLink && "text-foreground/80",
                      )}
                    >
                      {!isCollapsed && <span>{section.title}</span>}
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className={cn("shrink-0 transition-transform duration-200", isExpanded ? "rotate-0" : "-rotate-90")}
                      />
                    </button>

                    <div
                      id={panelId}
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                      aria-hidden={!isExpanded}
                      inert={!isExpanded}
                    >
                      <ul className="min-h-0 space-y-0.5 overflow-hidden pt-1">
                        {section.links.map(({ key, href, label, icon: Icon }) => {
                          const active = isLinkActive(pathname, href);
                          const showUnreadBadge = key === "support" && unreadSupportCount > 0;

                          return (
                            <li key={key}>
                              <Link
                                href={href}
                                onClick={onClose}
                                aria-label={label}
                                aria-current={active ? "page" : undefined}
                                title={isCollapsed ? label : undefined}
                                className={cn(
                                  "group relative flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                  isCollapsed && "justify-center px-0",
                                  active
                                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-inset ring-primary/20"
                                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                                )}
                              >
                                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                                  {showUnreadBadge && (
                                    <span
                                      className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-destructive px-1 text-center text-[9px] font-semibold leading-4 text-white"
                                      aria-label={`${unreadSupportCount} unread support messages`}
                                    >
                                      {unreadSupportCount > 99 ? "99+" : unreadSupportCount}
                                    </span>
                                  )}
                                </span>
                                {!isCollapsed && (
                                  <span className="min-w-0 truncate">
                                    {label}
                                    {showUnreadBadge && (
                                      <span className="ml-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive/10 px-1 text-[10px] font-semibold leading-4 text-destructive">
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
                  </section>
                );
              })}

              {visibleSections.length === 0 && mounted && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">No modules are available for this account.</p>
              )}
            </div>
          </nav>

          <div
            className="sorana-admin-profile mx-2.5 flex shrink-0 items-center gap-3 border-t border-border px-1 py-3"
            title={isCollapsed ? `${profileName} · ${profileRole}` : undefined}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground shadow-sm">
              {initials || "A"}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{profileName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{profileRole}</p>
              </div>
            )}
          </div>

          <div className="sorana-sidebar-footer shrink-0 border-t border-border px-3 py-2 text-center text-[10px] text-muted-foreground">
            <div className="mb-2 flex justify-center md:hidden">
              <ShellFooterActions onSignOut={handleSignOut} />
            </div>
            <p>© {new Date().getFullYear()} My Accurate Rent</p>
            {!isCollapsed && (
              <p className="mt-1.5">
                Developed by{" "}
                <a
                  href="https://www.vickinstechnologies.com/"
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

      {isOpen && (
        <div
          className="sorana-sidebar-overlay fixed inset-x-0 bottom-0 top-16 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}
