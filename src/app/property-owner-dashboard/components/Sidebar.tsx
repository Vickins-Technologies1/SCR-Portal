"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
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
} from "lucide-react";
import Cookies from "js-cookie";
import { useSidebar } from "./SidebarContext";

const useAuth = () => {
  if (typeof window === "undefined") {
    return { userId: null, role: null, ownerId: null, permissions: [] as string[] };
  }
  return {
    userId: Cookies.get("userId") ?? null,
    role: Cookies.get("role") ?? null,
    ownerId: Cookies.get("ownerId") ?? Cookies.get("userId") ?? null,
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
  const { userId, role, permissions } = useAuth();
  const perm = usePermissions();
  const [name, setName] = useState("User");
  const [teamRole, setTeamRole] = useState("Team Member");
  const [mounted, setMounted] = useState(false);
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

  const isOwner = role === "propertyOwner";
  const isDue = !!dueStatus?.isDue;
  const restrictedKeys = new Set(["dashboard", "reports"]);

  const allLinks: NavLink[] = [
    { key: "dashboard", href: "/property-owner-dashboard", label: "Overview", icon: <LayoutDashboard size={20} />, requiredPermission: "dashboard:view" },
    { key: "properties", href: "/property-owner-dashboard/properties", label: "Properties", icon: <Building2 size={20} />, requiredPermission: "properties:view" },
    { key: "tenants", href: "/property-owner-dashboard/tenants", label: "Tenants", icon: <Users size={20} />, requiredPermission: "tenants:view" },
    { key: "users", href: "/property-owner-dashboard/users", label: "Users", icon: <UserCog size={20} />, requiredPermission: "users:view" },
    { key: "payments", href: "/property-owner-dashboard/payments", label: "Payments", icon: <CreditCard size={20} />, requiredPermission: "payments:view" },
    { key: "expenses", href: "/property-owner-dashboard/expenses", label: "Expenses", icon: <Receipt size={20} />, requiredPermission: "expenses:view" },
    { key: "notifications", href: "/property-owner-dashboard/notifications", label: "Notifications", icon: <Bell size={20} />, requiredPermission: "notifications:view" },
    { key: "reports", href: "/property-owner-dashboard/reports", label: "Reports & Invoices", icon: <BarChart size={20} />, requiredPermission: "reports:view" },
    { key: "settings", href: "/property-owner-dashboard/settings", label: "Settings", icon: <Settings size={20} />, requiredPermission: "settings:view" },
    { key: "list-property", href: "/property-owner-dashboard/list-properties", label: "List Property", icon: <PlusCircle size={20} />, requiredPermission: "properties:list_new" },
  ];

  const visibleLinks = mounted
    ? allLinks.filter((link) => perm.hasPermission(link.requiredPermission ?? ""))
    : [];

  const navLinks = isDue ? visibleLinks.filter((link) => restrictedKeys.has(link.key)) : visibleLinks;
  useEffect(() => {
    if (!isDue) return;
    const allowed = ["/property-owner-dashboard", "/property-owner-dashboard/reports"];
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

  return (
    <>
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 w-72 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] border-r border-gray-200/70 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:inset-y-0 flex flex-col`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/40 bg-gradient-to-b from-[#42c775]/10 to-transparent px-6 py-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#42c775] to-[#34b46d] text-2xl font-bold text-white shadow-xl ring-4 ring-white/80">
                {initials}
              </div>

              <p className="text-xs tracking-widest uppercase text-gray-500">Welcome back</p>
              <h2 className="mt-1 text-lg sm:text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {name.split(" ")[0]}
              </h2>

              <span className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#42c775]/10 text-[#42c775]">
                <span className="h-2 w-2 rounded-full bg-[#42c775] animate-pulse"></span>
                {roleLabel}
              </span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
            {navLinks.map(({ key, href, label, icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={key}
                  href={href}
                  onClick={close}
                  className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#42c775]/10 text-[#42c775] shadow-sm ring-1 ring-[#42c775]/20"
                      : "text-gray-600 hover:bg-[#42c775]/5 hover:text-[#42c775]"
                  }`}
                >
                  <span className={isActive ? "text-[#42c775]" : "text-gray-500 group-hover:text-[#42c775]"}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}

            {navLinks.length === 0 && mounted && !perm.isOwner && (
              <div className="px-6 py-12 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-800">Limited Access</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Your account currently has no assigned permissions.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Please contact the property owner to grant access.
                </p>
              </div>
            )}
          </nav>

          <div className="mt-auto border-t border-white/40 px-6 py-4 bg-gradient-to-t from-white/70 to-transparent">
            <div className="text-center space-y-1">
              <p className="text-[10px] text-gray-400/80 font-light tracking-wide">
                © {new Date().getFullYear()} Sorana Property Managers Limited
              </p>
              <p className="text-[9px] text-gray-400/60 font-light">
                Developed by{" "}
                <a
                  href="https://vickins-technologies.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400/80 hover:text-[#42c775] transition-colors duration-200 underline underline-offset-2 decoration-gray-300/50 hover:decoration-[#42c775]/60"
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













