"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CreditCard,
  Settings,
  LogOut,
  Wrench,
  DoorOpen,
} from "lucide-react";
import Cookies from "js-cookie";
import Image from "next/image";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

const useAuth = () => {
  if (typeof window === "undefined") return { userId: null, role: null };
  const userId = Cookies.get("userId") || null;
  const role = Cookies.get("role") || null;
  return { userId, role };
};

interface UserResponse {
  success: boolean;
  user?: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt: string;
    userId: string;
    propertyId?: string;
    unitType?: string;
    price?: number;
    deposit?: number;
    houseNumber?: string;
    ownerId?: string;
  };
  message?: string;
}

export default function TenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { userId, role } = useAuth();
  const [name, setName] = useState<string>("Tenant");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const links = [
    { href: "/tenant-dashboard", label: "Overview", icon: <LayoutDashboard size={18} /> },
    { href: "/tenant-dashboard/payments", label: "Payments", icon: <CreditCard size={18} /> },
    { href: "/tenant-dashboard/maintenance", label: "Maintenance", icon: <Wrench size={18} /> },
    { href: "/tenant-dashboard/vacate", label: "Vacate Notice", icon: <DoorOpen size={18} /> },
    { href: "/tenant-dashboard/settings", label: "Settings", icon: <Settings size={18} /> },
  ];

  useEffect(() => {
    if (!userId || role !== "tenant") {
      setIsLoading(false);
      return;
    }

    const fetchUserName = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`,
          { credentials: "include" }
        );
        const data: UserResponse = await response.json();
        if (data.success && data.user?.name) setName(data.user.name);
      } catch {
        setError("Connection error");
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchUserName, 300);
    return () => clearTimeout(timer);
  }, [userId, role]);

  const handleLogout = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    window.location.href = "/tenant-login";
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <PublicThemeWrapper>
    <div className="min-h-[100svh] flex flex-col bg-background text-foreground overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <header className="fixed top-0 left-0 right-0 z-20 h-16 w-full max-w-[100vw] border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)]">
        <div className="flex h-full w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6 lg:pl-[18rem] lg:pr-8">
          {/* Left side – logo + mobile toggle */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-gray-200 bg-white/90 text-gray-700 shadow-sm transition hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#42c775]/30"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle menu"
              title="Menu"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Right side – logo image + user info + logout */}
          <div className="flex items-center gap-5 sm:gap-7">
            <button
              onClick={handleLogout}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-gray-300 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-gray-700 transition-all hover:border-[#42c775]/70 hover:text-[#42c775] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#42c775]/30 focus:ring-offset-1 active:scale-95"
            >
              <LogOut size={16} className="transition-transform group-hover:rotate-6" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 w-72 bg-white border-r border-gray-200/70 shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:inset-y-0`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/40 bg-gradient-to-b from-[#42c775]/10 to-transparent">
            <div className="flex justify-center mb-5">
              <Image
                src="/logo.png"
                alt="Smart Choice Logo"
                width={172}
                height={72}
                className="drop-shadow-md"
                priority
              />
            </div>

            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Tenant Portal</p>
              <p className="mt-1.5 text-lg font-semibold text-gray-900">
                {isLoading ? "…" : error ? "Welcome" : name}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
            {links.map(({ href, label, icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 text-xs sm:text-sm font-medium transition-all duration-200
                    ${isActive
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
          </nav>

          <div className="mt-auto border-t border-white/40 px-6 py-4 bg-gradient-to-t from-white/70 to-transparent">
            <p className="text-center text-[10px] text-gray-400/70 font-light tracking-wide">
              © {new Date().getFullYear()} Sorana Property Managers Limited
            </p>
            <p className="text-center text-[9px] text-gray-400/60 mt-1">
              Built by{" "}
              <a
                href="https://vickins-technologies.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors underline underline-offset-2 decoration-gray-300/40 hover:decoration-primary/50"
              >
                Vickins Technologies
              </a>
            </p>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 pt-16 lg:ml-72 p-5 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {isSidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
    </PublicThemeWrapper>
  );
}
