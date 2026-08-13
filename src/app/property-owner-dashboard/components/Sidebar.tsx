"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Settings,
  Bell,
  BarChart,
  PlusCircle,
  Receipt,
  UserCog,
  PlugZap,
  Landmark,
} from "lucide-react";
import Cookies from "js-cookie";
import { useSidebar } from "./SidebarContext";
import ShellFooterActions from "@/components/portal/ShellFooterActions";

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

type NavGroup = {
  key: string;
  label: string;
  icon: React.ReactNode;
  requiredPermission?: string;
  children: NavLink[];
};

type NavItem = NavLink | NavGroup;

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isOpen, close } = useSidebar();
  const { userId, role, tier } = useAuth();
  const perm = usePermissions();
  const [name, setName] = useState("User");
  const [teamRole, setTeamRole] = useState("Team Member");
  const [mounted, setMounted] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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
    if (!userId || !perm.hasPermission("notifications:view") || tier === "free") return;
    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/notifications?unreadCount=1", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data.success) {
          setUnreadNotifications(Number(data.unreadCount || 0));
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
  }, [userId, perm, tier]);

  const isOwner = role === "propertyOwner";
  const isDue = !!dueStatus?.isDue;
  const restrictedKeys = new Set(["dashboard", "finance"]);
  const isFreeTier = tier === "free";
  const propertiesPath = "/property-owner-dashboard/properties";
  const propertiesReportPath = "/property-owner-dashboard/properties-report";
  const reportsPath = "/property-owner-dashboard/reports";
  const paymentsPath = "/property-owner-dashboard/payments";
  const expensesPath = "/property-owner-dashboard/expenses";
  const integrationsPath = "/property-owner-dashboard/integrations";
  const reportTab = searchParams.get("tab");

  const propertiesActive = pathname === propertiesPath || pathname.startsWith(`${propertiesPath}/`);
  const propertyReportActive = pathname === propertiesReportPath || pathname.startsWith(`${propertiesReportPath}/`);
  const propertiesSectionActive = propertiesActive || propertyReportActive;
  const financeSectionActive =
    pathname === reportsPath ||
    pathname.startsWith(`${reportsPath}/`) ||
    pathname === paymentsPath ||
    pathname.startsWith(`${paymentsPath}/`) ||
    pathname === expensesPath ||
    pathname.startsWith(`${expensesPath}/`) ||
    pathname === integrationsPath ||
    pathname.startsWith(`${integrationsPath}/`);
  const invoicesActive = pathname === reportsPath && (reportTab === "invoices" || isDue);
  const reportsActive = pathname === reportsPath && !invoicesActive;
  const paymentsActive = pathname === paymentsPath || pathname.startsWith(`${paymentsPath}/`);
  const expensesActive = pathname === expensesPath || pathname.startsWith(`${expensesPath}/`);
  const integrationsActive = pathname === integrationsPath || pathname.startsWith(`${integrationsPath}/`);

  const allLinks: NavItem[] = [
    { key: "dashboard", href: "/property-owner-dashboard", label: "Overview", icon: <LayoutDashboard size={20} />, requiredPermission: "dashboard:view" },
    { key: "tenants", href: "/property-owner-dashboard/tenants", label: "Tenants", icon: <Users size={20} />, requiredPermission: "tenants:view" },
    { key: "users", href: "/property-owner-dashboard/users", label: "Users", icon: <UserCog size={20} />, requiredPermission: "users:view" },
    { key: "notifications", href: "/property-owner-dashboard/notifications", label: "Notifications", icon: <Bell size={20} />, requiredPermission: "notifications:view" },
    {
      key: "properties",
      label: "Properties",
      icon: <Building2 size={20} />,
      children: [
        { key: "properties", href: propertiesPath, label: "Properties", icon: <Building2 size={18} />, requiredPermission: "properties:view" },
        { key: "properties-report", href: propertiesReportPath, label: "Properties Report", icon: <BarChart size={18} />, requiredPermission: "properties:view" },
        { key: "list-properties", href: propertiesPath, label: "List Properties", icon: <PlusCircle size={18} />, requiredPermission: "properties:view" },
      ],
    },
    {
      key: "finance",
      label: "Finance",
      icon: <Landmark size={20} />,
      children: [
        { key: "reports", href: "/property-owner-dashboard/reports", label: "Reports", icon: <BarChart size={18} />, requiredPermission: "reports:view" },
        { key: "invoices", href: "/property-owner-dashboard/reports?tab=invoices", label: "Invoices", icon: <Receipt size={18} />, requiredPermission: "reports:view" },
        { key: "payments", href: paymentsPath, label: "Payments", icon: <CreditCard size={18} />, requiredPermission: "payments:view" },
        { key: "expenses", href: expensesPath, label: "Expenses", icon: <Receipt size={18} />, requiredPermission: "expenses:view" },
        { key: "integrations", href: integrationsPath, label: "Integrations", icon: <PlugZap size={18} />, requiredPermission: "integrations:view" },
      ],
    },
    { key: "settings", href: "/property-owner-dashboard/settings", label: "Settings", icon: <Settings size={20} />, requiredPermission: "settings:view" },
    { key: "list-property", href: "/property-owner-dashboard/list-properties", label: "List Property", icon: <PlusCircle size={20} />, requiredPermission: "properties:list_new" },
  ];

  const canAccessLink = (link: NavLink) => perm.hasPermission(link.requiredPermission ?? "");
  const visibleLinks = mounted
    ? allLinks.flatMap((item) => {
        if ("children" in item) {
          const filteredChildren = item.children.filter((child) => {
            if (!canAccessLink(child)) return false;
            if (item.key === "finance") {
              return !isDue || child.key === "reports" || child.key === "invoices";
            }
            return true;
          });

          return filteredChildren.length > 0
            ? [{ ...item, children: filteredChildren }]
            : [];
        }

        return canAccessLink(item) ? [item] : [];
      })
    : [];

  const navLinks = isDue ? visibleLinks.filter((link) => restrictedKeys.has(link.key)) : visibleLinks;
  useEffect(() => {
    if (!isDue) return;
    const allowed = ["/property-owner-dashboard", "/property-owner-dashboard/reports", "/property-owner-dashboard/properties-report"];
    const isAllowed = allowed.some((base) => pathname === base || pathname.startsWith(base + "/"));
    if (!isAllowed) {
      router.replace("/property-owner-dashboard");
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

  const roleLabel = mounted
    ? (isOwner ? "Property Owner" : teamRole)
    : "Account";

  const handleSignOut = async () => {
    try {
      await fetch("/api/signout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore; client-side cleanup still logs the user out locally.
    } finally {
      Cookies.remove("userId");
      Cookies.remove("role");
      Cookies.remove("permissions");
      Cookies.remove("ownerId");
      Cookies.remove("managementType");
      Cookies.remove("tier");
      Cookies.remove("csrf-token");
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      localStorage.removeItem("userId");
      localStorage.removeItem("role");
      router.replace("/");
    }
  };

  return (
    <>
      <aside
        data-tour="owner-sidebar"
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
            {navLinks.map((item) => {
              if ("children" in item) {
                const isFinanceExpanded = financeOpen || financeSectionActive;
                const isFinanceActive = financeSectionActive;
                const isPropertiesGroup = item.key === "properties";
                const visibleChildren = item.children;

                return (
                  <div
                    key={item.key}
                    className={`rounded-xl ${
                      item.key === "finance" && isFinanceActive
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : isPropertiesGroup && propertiesSectionActive
                          ? "bg-primary/10 ring-1 ring-primary/20"
                          : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (item.key === "finance") {
                          setFinanceOpen((prev) => !prev);
                        } else {
                          setPropertiesOpen((prev) => !prev);
                        }
                      }}
                      data-tour={`owner-nav-${item.key}`}
                      className={`group flex w-full items-center gap-3 sm:gap-4 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
                        item.key === "finance"
                          ? isFinanceActive
                            ? "text-primary"
                            : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                          : propertiesSectionActive
                            ? "text-primary"
                            : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                      }`}
                      aria-expanded={item.key === "finance" ? isFinanceExpanded : propertiesOpen || propertiesSectionActive}
                      aria-controls={item.key === "finance" ? "owner-finance-submenu" : "owner-properties-submenu"}
                    >
                      <span className={`relative ${
                        item.key === "finance"
                          ? isFinanceActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-primary"
                          : propertiesSectionActive
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-primary"
                      }`}>
                        {item.icon}
                      </span>
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      {item.key === "finance"
                        ? (isFinanceExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
                        : ((propertiesOpen || propertiesSectionActive) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                    </button>
                    <div
                      id={item.key === "finance" ? "owner-finance-submenu" : "owner-properties-submenu"}
                      className={`grid overflow-hidden transition-all duration-200 ${
                        item.key === "finance"
                          ? (isFinanceExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                          : ((propertiesOpen || propertiesSectionActive) ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden pl-4 pr-2 pb-2">
                        {visibleChildren.map((child) => {
                          const isChildActive =
                            child.key === "reports"
                              ? reportsActive
                              : child.key === "invoices"
                                ? invoicesActive
                                : child.key === "payments"
                                  ? paymentsActive
                                  : child.key === "expenses"
                                    ? expensesActive
                                    : child.key === "integrations"
                                      ? integrationsActive
                                      : child.key === "properties"
                                        ? propertiesActive
                                      : child.key === "properties-report"
                                          ? propertyReportActive
                                          : child.key === "list-properties"
                                            ? propertiesActive
                                            : pathname === child.href || pathname.startsWith(child.href + "/");

                          return (
                            <Link
                              key={child.key}
                              href={child.href}
                              onClick={close}
                              className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                                isChildActive
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                              }`}
                            >
                              <span className="shrink-0 text-current/80">{child.icon}</span>
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              const { key, href, label, icon } = item;
              const isActive = pathname === href || pathname.startsWith(href + "/");
              const showUnreadBadge = key === "notifications" && unreadNotifications > 0;

              return (
                <Link
                  key={key}
                  href={href}
                  onClick={close}
                  data-tour={`owner-nav-${key}`}
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
                        aria-label={`${unreadNotifications} unread notifications`}
                      >
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                      </span>
                    )}
                  </span>
                  <span className="truncate flex-1 flex items-center gap-2">
                    <span className="truncate">{label}</span>
                    {showUnreadBadge && (
                      <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
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
                <ShellFooterActions onSignOut={handleSignOut} />
              </div>
              {isFreeTier && (
                <div className="flex justify-center pb-2">
                  <Link
                    href={isDue ? "/property-owner-dashboard/reports" : "/upgrade"}
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













