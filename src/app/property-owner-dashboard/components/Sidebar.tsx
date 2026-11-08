"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Settings,
  BarChart,
  PlusCircle,
  Receipt,
  UserCog,
  PlugZap,
  Landmark,
  Gift,
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
  const router = useRouter();
  const { isOpen, close } = useSidebar();
  const { userId, role, tier } = useAuth();
  const perm = usePermissions();
  const [name, setName] = useState("User");
  const [teamRole, setTeamRole] = useState("Team Member");
  const [mounted, setMounted] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(true);
  const [financeTab, setFinanceTab] = useState<string | null>(null);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);

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
    if (typeof window === "undefined") return;

    const syncFinanceTab = () => {
      const nextTab = new URLSearchParams(window.location.search).get("tab");
      setFinanceTab((prev) => (prev === nextTab ? prev : nextTab));
    };

    syncFinanceTab();
  });

  const isOwner = role === "propertyOwner";
  const isDue = !!dueStatus?.isDue;
  const restrictedKeys = new Set(["dashboard", "finance"]);
  const isFreeTier = tier === "free";
  const propertiesPath = "/property-owner-dashboard/properties";
  const propertiesReportPath = "/property-owner-dashboard/properties-report";
  const listPropertiesPath = "/property-owner-dashboard/list-properties";
  const tenantsPath = "/property-owner-dashboard/tenants";
  const usersPath = "/property-owner-dashboard/users";
  const reportsPath = "/property-owner-dashboard/reports";
  const paymentsPath = "/property-owner-dashboard/payments";
  const expensesPath = "/property-owner-dashboard/expenses";
  const integrationsPath = "/property-owner-dashboard/integrations";
  const tenantInvoicesPath = "/property-owner-dashboard/invoices";
  const referralsPath = "/property-owner-dashboard/referrals";
  const settingsPath = "/property-owner-dashboard/settings";
  const billingInvoicingPath = "/property-owner-dashboard/settings/billing";
  const billingAccessPath = "/account/billing";

  const propertiesActive = pathname === propertiesPath || pathname.startsWith(`${propertiesPath}/`);
  const propertyReportActive = pathname === propertiesReportPath || pathname.startsWith(`${propertiesReportPath}/`);
  const listPropertyActive = pathname === listPropertiesPath || pathname.startsWith(`${listPropertiesPath}/`);
  const propertyManagementActive =
    propertiesActive ||
    propertyReportActive ||
    listPropertyActive ||
    pathname === tenantsPath ||
    pathname.startsWith(`${tenantsPath}/`) ||
    pathname === usersPath ||
    pathname.startsWith(`${usersPath}/`);
  const financeSectionActive =
    pathname === reportsPath ||
    pathname.startsWith(`${reportsPath}/`) ||
    pathname === paymentsPath ||
    pathname.startsWith(`${paymentsPath}/`) ||
    pathname === expensesPath ||
    pathname.startsWith(`${expensesPath}/`) ||
    pathname === tenantInvoicesPath ||
    pathname.startsWith(`${tenantInvoicesPath}/`);
  const invoicesActive = pathname === reportsPath && (financeTab === "invoices" || isDue);
  const reportsActive = pathname === reportsPath && !invoicesActive;
  const paymentsActive = pathname === paymentsPath || pathname.startsWith(`${paymentsPath}/`);
  const expensesActive = pathname === expensesPath || pathname.startsWith(`${expensesPath}/`);
  const accountSectionActive = [integrationsPath, referralsPath, settingsPath, billingInvoicingPath, billingAccessPath].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const allLinks: NavItem[] = [
    { key: "dashboard", href: "/property-owner-dashboard", label: "Overview", icon: <LayoutDashboard size={20} />, requiredPermission: "dashboard:view" },
    {
      key: "properties",
      label: "Property Management",
      icon: <Building2 size={20} />,
      children: [
        { key: "properties", href: propertiesPath, label: "Properties", icon: <Building2 size={18} />, requiredPermission: "properties:view" },
        { key: "list-properties", href: listPropertiesPath, label: "List Properties", icon: <PlusCircle size={18} />, requiredPermission: "properties:view" },
        { key: "properties-report", href: propertiesReportPath, label: "Properties Report", icon: <BarChart size={18} />, requiredPermission: "properties:view" },
        { key: "tenants", href: tenantsPath, label: "Tenants", icon: <Users size={20} />, requiredPermission: "tenants:view" },
        { key: "users", href: usersPath, label: "Users", icon: <UserCog size={20} />, requiredPermission: "users:view" },
      ],
    },
    {
      key: "finance",
      label: "Financial Management",
      icon: <Landmark size={20} />,
      children: [
        { key: "reports", href: "/property-owner-dashboard/reports", label: "Reports", icon: <BarChart size={18} />, requiredPermission: "reports:view" },
        { key: "invoices", href: "/property-owner-dashboard/reports?tab=invoices", label: "Invoices", icon: <Receipt size={18} />, requiredPermission: "reports:view" },
        { key: "tenant-invoices", href: tenantInvoicesPath, label: "Tenant Invoices", icon: <Receipt size={18} />, requiredPermission: "reports:view" },
        { key: "payments", href: paymentsPath, label: "Payments", icon: <CreditCard size={18} />, requiredPermission: "payments:view" },
        { key: "expenses", href: expensesPath, label: "Expenses", icon: <Receipt size={18} />, requiredPermission: "expenses:view" },
      ],
    },
    {
      key: "account",
      label: "Account & Services",
      icon: <Settings size={20} />,
      children: [
        { key: "integrations", href: integrationsPath, label: "Integrations", icon: <PlugZap size={20} />, requiredPermission: "integrations:view" },
        { key: "referrals", href: referralsPath, label: "Referrals", icon: <Gift size={20} />, requiredPermission: "dashboard:view" },
        { key: "billing-settings", href: billingInvoicingPath, label: "Billing & Invoicing", icon: <Receipt size={20} />, requiredPermission: "settings:edit" },
        { key: "billing", href: billingAccessPath, label: "Billing & Access", icon: <CreditCard size={20} />, requiredPermission: "settings:view" },
        { key: "settings", href: settingsPath, label: "Settings", icon: <Settings size={20} />, requiredPermission: "settings:view" },
      ],
    },
  ];

  const canAccessLink = (link: NavLink) => perm.hasPermission(link.requiredPermission ?? "");
  const visibleLinks: NavItem[] = mounted
    ? allLinks.reduce<NavItem[]>((acc, item) => {
        if ("children" in item) {
          const filteredChildren = item.children.filter((child) => {
            if (!canAccessLink(child)) return false;
            if (item.key === "finance") {
              return !isDue || child.key === "reports" || child.key === "invoices";
            }
            return true;
          });

          if (filteredChildren.length > 0) {
            acc.push({ ...item, children: filteredChildren });
          }
          return acc;
        }

        if (canAccessLink(item)) {
          acc.push(item);
        }
        return acc;
      }, [])
    : [];

  const navLinks = isDue ? visibleLinks.filter((link) => restrictedKeys.has(link.key)) : visibleLinks;
  const isChildLinkActive = (child: NavLink) => {
    switch (child.key) {
      case "reports":
        return reportsActive;
      case "invoices":
        return invoicesActive;
      case "payments":
        return paymentsActive;
      case "expenses":
        return expensesActive;
      case "properties":
        return propertiesActive;
      case "properties-report":
        return propertyReportActive;
      case "list-properties":
        return listPropertyActive;
      case "tenant-invoices":
        return pathname === tenantInvoicesPath || pathname.startsWith(`${tenantInvoicesPath}/`);
      case "settings":
        return pathname === settingsPath || (pathname.startsWith(`${settingsPath}/`) && !pathname.startsWith(`${billingInvoicingPath}/`));
      default:
        return pathname === child.href || pathname.startsWith(`${child.href}/`);
    }
  };

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
        className={`sorana-sidebar fixed left-0 top-16 bottom-0 z-40 w-[82vw] max-w-[18rem] md:w-[15.5rem] bg-card backdrop-blur-xl border-r border-border transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:inset-y-0 flex flex-col`}
      >
        <div className="flex h-full flex-col">
          <div className="sorana-sidebar-header border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent px-5 sm:px-6 py-5 sm:py-6">
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

          <nav className="sorana-sidebar-nav flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-5 space-y-1.5">
            {navLinks.map((item) => {
              if ("children" in item) {
                const isFinanceGroup = item.key === "finance";
                const isPropertiesGroup = item.key === "properties";
                const groupActive = isFinanceGroup
                  ? financeSectionActive
                  : isPropertiesGroup
                    ? propertyManagementActive
                    : accountSectionActive;
                const groupExpanded = isFinanceGroup
                  ? financeOpen || financeSectionActive
                  : isPropertiesGroup
                    ? propertiesOpen || propertyManagementActive
                    : accountOpen || accountSectionActive;
                const submenuId = isFinanceGroup
                  ? "owner-finance-submenu"
                  : isPropertiesGroup
                    ? "owner-properties-submenu"
                    : "owner-account-submenu";
                const visibleChildren = item.children;

                return (
                  <div
                    key={item.key}
                    className={`rounded-xl ${
                      groupActive ? "bg-primary/10 ring-1 ring-primary/20" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isFinanceGroup) {
                          setFinanceOpen((prev) => !prev);
                        } else if (isPropertiesGroup) {
                          setPropertiesOpen((prev) => !prev);
                        } else {
                          setAccountOpen((prev) => !prev);
                        }
                      }}
                      data-tour={`owner-nav-${item.key}`}
                      className={`group flex w-full items-center gap-3 sm:gap-4 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
                        groupActive
                          ? "text-primary"
                          : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                      }`}
                      aria-expanded={groupExpanded}
                      aria-controls={submenuId}
                    >
                      <span className={`relative ${groupActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`}>
                        {item.icon}
                      </span>
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      {groupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div
                      id={submenuId}
                      className={`grid overflow-hidden transition-all duration-200 ${groupExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    >
                      <div className="min-h-0 overflow-hidden pl-4 pr-2 pb-2">
                        {visibleChildren.map((child) => {
                          const isChildActive = isChildLinkActive(child);

                          return (
                            <Link
                              key={child.key}
                              href={child.href}
                              onClick={close}
                              data-tour={
                                child.key === "properties"
                                  ? undefined
                                  : child.key === "list-properties"
                                    ? "owner-nav-list-property"
                                    : `owner-nav-${child.key}`
                              }
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
                  </span>
                  <span className="truncate flex-1 flex items-center gap-2">
                    <span className="truncate">{label}</span>
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

          <div className="sorana-sidebar-footer mt-auto border-t border-border px-6 py-4 footer-fade">
            <div className="text-center space-y-1">
              <div className="flex justify-center pb-3 md:hidden">
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
                © {new Date().getFullYear()} My Accurate Rent
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
          className="sorana-sidebar-overlay fixed inset-x-0 bottom-0 top-16 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}
    </>
  );
}





