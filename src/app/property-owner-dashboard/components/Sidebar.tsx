"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Settings,
  Bell,
  BarChart,
  PlusCircle,
  Receipt,
} from "lucide-react";
import Cookies from "js-cookie";

const useAuth = () => {
  if (typeof window === "undefined") return { userId: null, role: null, permissions: [] as string[] };
  return {
    userId: Cookies.get("userId") ?? null,
    role: Cookies.get("role") ?? null,
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
  const [isOpen, setIsOpen] = useState(false);
  const { userId, role, permissions } = useAuth();
  const [name, setName] = useState("User");
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch - only render after client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const isOwner = role === "propertyOwner";

  const allLinks: NavLink[] = [
    { key: "dashboard", href: "/property-owner-dashboard", label: "Overview", icon: <LayoutDashboard size={20} />, requiredPermission: "dashboard:view" },
    { key: "properties", href: "/property-owner-dashboard/properties", label: "Properties", icon: <Building2 size={20} />, requiredPermission: "properties:view" },
    { key: "tenants", href: "/property-owner-dashboard/tenants", label: "Tenants", icon: <Users size={20} />, requiredPermission: "tenants:view" },
    { key: "users", href: "/property-owner-dashboard/users", label: "Users", icon: <Users size={20} />, requiredPermission: "users:view" },
    { key: "payments", href: "/property-owner-dashboard/payments", label: "Payments", icon: <CreditCard size={20} />, requiredPermission: "payments:view" },
    { key: "expenses", href: "/property-owner-dashboard/expenses", label: "Expenses", icon: <Receipt size={20} />, requiredPermission: "expenses:view" },
    { key: "notifications", href: "/property-owner-dashboard/notifications", label: "Notifications", icon: <Bell size={20} />, requiredPermission: "notifications:view" },
    { key: "reports", href: "/property-owner-dashboard/reports", label: "Reports & Invoices", icon: <BarChart size={20} />, requiredPermission: "reports:view" },
    { key: "settings", href: "/property-owner-dashboard/settings", label: "Settings", icon: <Settings size={20} />, requiredPermission: "settings:view" },
    { key: "list-property", href: "/property-owner-dashboard/list-properties", label: "List Property", icon: <PlusCircle size={20} />, requiredPermission: "properties:list_new" },
  ];

  // Only compute filtered links AFTER mount → safe for hydration
  const visibleLinks = mounted
    ? allLinks.filter((link) => {
        if (isOwner) return true;
        return permissions.includes(link.requiredPermission ?? "");
      })
    : []; // empty during SSR → no mismatch

  useEffect(() => {
    if (!userId || role !== "propertyOwner") return;

    const fetchName = async () => {
      try {
        const res = await fetch(`/api/user?userId=${userId}&role=${role}`, { credentials: "include" });
        const data = await res.json();
        if (data.success && data.user?.name) setName(data.user.name);
      } catch (err) {
        console.error("Failed to fetch user name:", err);
      }
    };

    const timer = setTimeout(fetchName, 300);
    return () => clearTimeout(timer);
  }, [userId, role]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Dynamic role label – only render after mount
  const roleLabel = mounted
    ? (isOwner ? "Property Owner" : role ? role.charAt(0).toUpperCase() + role.slice(1) : "Team Member")
    : "Account";

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-4 top-20 z-50 rounded-xl bg-white/80 backdrop-blur-lg p-3 shadow-lg ring-1 ring-gray-200 transition-all hover:shadow-xl md:hidden"
      >
        {isOpen ? <X size={24} className="text-gray-700" /> : <Menu size={24} className="text-gray-700" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white/90 backdrop-blur-xl shadow-2xl border-r border-gray-100 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 flex flex-col`}
      >
        <div className="flex h-full flex-col">
          {/* HEADER SECTION */}
          <div className="border-b border-gray-200/60 bg-gradient-to-b from-[#03a678]/5 to-transparent px-6 py-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#03a678] to-[#027a55] text-2xl font-bold text-white shadow-xl ring-4 ring-white/80">
                {initials}
              </div>

              <p className="text-xs tracking-widest uppercase text-gray-500">Welcome back</p>
              <h2 className="mt-1 text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {name.split(" ")[0]}
              </h2>

              <span className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#03a678]/10 text-[#03a678]">
                <span className="h-2 w-2 rounded-full bg-[#03a678] animate-pulse"></span>
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Navigation Links – only rendered after mount */}
          <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
            {visibleLinks.map(({ key, href, label, icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={key}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#03a678]/10 text-[#03a678] shadow-sm ring-1 ring-[#03a678]/20"
                      : "text-gray-600 hover:bg-[#03a678]/5 hover:text-[#03a678]"
                  }`}
                >
                  <span className={isActive ? "text-[#03a678]" : "text-gray-500 group-hover:text-[#03a678]"}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}

            {visibleLinks.length === 0 && mounted && !isOwner && (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                Your account has limited access.<br />
                Contact the property owner.
              </div>
            )}
          </nav>

          {/* FOOTER */}
          <div className="mt-auto border-t border-gray-200/40 px-6 py-4 bg-gradient-to-t from-gray-50/60 to-transparent">
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
                  className="text-gray-400/80 hover:text-[#03a678] transition-colors duration-200 underline underline-offset-2 decoration-gray-300/50 hover:decoration-[#03a678]/60"
                >
                  Vickins Technologies
                </a>
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE OVERLAY */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}