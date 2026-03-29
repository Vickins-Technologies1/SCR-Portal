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
  FileText,
  ChevronLeft,
  AlertCircle,
  Settings,
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

  useEffect(() => {
    setMounted(true);
    const adminName = Cookies.get("adminName") || "Admin";
    setName(adminName);
  }, []);

  const initials = name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const firstName = name.split(" ")[0] || "Admin";

  const navLinks: NavLink[] = [
    { key: "dashboard", href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "users", href: "/admin/users", label: "PropertyOwners", icon: <Users size={20} /> },
    { key: "properties", href: "/admin/properties", label: "Properties", icon: <Building2 size={20} /> },
    { key: "payments", href: "/admin/payments", label: "Payments", icon: <CreditCard size={20} /> },
    { key: "invoices", href: "/admin/invoices", label: "Invoices", icon: <FileText size={20} /> },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-14 bottom-0 z-40 flex flex-col bg-card backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.16)] border-r border-border transition-all duration-400 ease-out md:inset-y-0",
          "w-60 md:w-auto",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Profile Header */}
          <div className="relative border-b border-border bg-gradient-to-b from-primary/10 via-white/70 to-transparent px-5 py-6">
        
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-lg font-bold text-white shadow-lg ring-4 ring-primary/15 ring-offset-2 ring-offset-white">
                {initials}
              </div>

              {!isCollapsed && (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Welcome back
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">{firstName}</h2>

                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary shadow-sm animate-pulse" />
                    Admin
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-6">
            <ul className="space-y-1.5">
              {navLinks.map(({ key, href, label, icon }) => (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={onClose}
                  className={cn(
                    "group flex items-center rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200",
                    isCollapsed ? "justify-center" : "gap-4",
                    isActive(href)
                      ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center transition-colors",
                      isActive(href) ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                    )}
                  >
                    {icon}
                  </span>

                  {!isCollapsed && <span>{label}</span>}
                  </Link>
                </li>
              ))}

              {navLinks.length === 0 && mounted && (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <AlertCircle className="mb-5 h-14 w-14 text-amber-500/80" />
                  <h3 className="text-lg font-semibold text-foreground">No Modules Available</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Something went wrong — please refresh or contact support.
                  </p>
                </div>
              )}
            </ul>
          </nav>

          {/* Footer */}
          <div className="mt-auto border-t border-border bg-gradient-to-t from-white/70 to-transparent px-4 py-4 text-center text-[10px] text-muted-foreground">
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
          className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}
