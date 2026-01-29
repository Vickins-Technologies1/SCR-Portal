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
} from "lucide-react";
import Cookies from "js-cookie";
import Image from "next/image";

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
    window.location.href = "/";
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* ─── Navbar ─── */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-xl border-b border-white/30 shadow-sm">
        <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:pl-[18rem] lg:pr-8">
          {/* Left side – logo + mobile toggle */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100/80 text-gray-700 transition-colors"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            
          </div>

          {/* Right side – logo image + user info + logout */}
          <div className="flex items-center gap-5 sm:gap-7">

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#03a678] transition-colors px-3 py-2 rounded-xl hover:bg-slate-100/70"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white/85 backdrop-blur-2xl border-r border-white/30 shadow-2xl transform transition-transform duration-300 ease-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100/80 bg-gradient-to-b from-[#03a678]/5 to-transparent">
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

          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {links.map(({ href, label, icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`group flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive
                      ? "bg-[#03a678]/10 text-[#03a678] shadow-sm ring-1 ring-[#03a678]/20"
                      : "text-gray-700 hover:bg-[#03a678]/5 hover:text-[#03a678]"
                    }`}
                >
                  <span className={isActive ? "text-[#03a678]" : "text-gray-500 group-hover:text-[#03a678]"}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-slate-100/80 px-6 py-4 bg-gradient-to-t from-slate-50/60 to-transparent">
            <p className="text-center text-[10px] text-gray-400/70 font-light tracking-wide">
              © {new Date().getFullYear()} Sorana Property Managers Limited
            </p>
            <p className="text-center text-[9px] text-gray-400/60 mt-1">
              Built by{" "}
              <a
                href="https://vickins-technologies-lv2h.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#03a678] transition-colors underline underline-offset-2 decoration-gray-300/40 hover:decoration-[#03a678]/50"
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}