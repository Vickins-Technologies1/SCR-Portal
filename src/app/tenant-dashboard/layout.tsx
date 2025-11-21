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
    {
      href: "/tenant-dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      href: "/tenant-dashboard/payments",
      label: "Payments",
      icon: <CreditCard size={18} />,
    },
    {
      href: "/tenant-dashboard/maintenance",
      label: "Maintenance",
      icon: <Wrench size={18} />,
    },
    {
      href: "/tenant-dashboard/settings",
      label: "Settings",
      icon: <Settings size={18} />,
    },
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
          `/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`
        );
        const text = await response.text();
        const data: UserResponse = JSON.parse(text);
        if (response.ok && data.success && data.user?.name) {
          setName(data.user.name);
        } else {
          setError(data.message || "Failed to fetch user");
        }
      } catch {
        setError("Failed to fetch user");
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(() => fetchUserName(), 300);
    return () => clearTimeout(debounce);
  }, [userId, role]);

  const handleLogout = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Sleek Professional Navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-gray-700 hover:text-[#03a678] transition-colors p-1.5 rounded-md hover:bg-gray-100"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle Sidebar"
            >
              {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#03a678] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <h1 className="text-lg font-bold text-gray-900 hidden sm:block">
                Smart Choice
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <div className="w-8 h-8 bg-gradient-to-br from-[#03a678] to-emerald-600 rounded-full flex items-center justify-center text-white font-semibold text-xs">
                {isLoading ? "?" : error ? "T" : name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">
                {isLoading ? "Loading..." : error ? "Tenant" : name}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#03a678] transition-colors px-3 py-1.5 rounded-md hover:bg-gray-50"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-30 h-[calc(100vh-4rem)] w-64 bg-white border-r border-gray-200 shadow-lg transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:block`}
      >
        <div className="p-6">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Smart Choice Logo"
              width={64}
              height={64}
              className="object-contain rounded-lg shadow-sm"
            />
          </div>

          <div className="text-center mb-8">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Welcome</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {isLoading ? "Loading..." : error ? "Tenant" : name}
            </p>
          </div>

          <nav className="space-y-1">
            {links.map(({ href, label, icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 group
                  ${
                    isActive
                      ? "bg-[#03a678] text-white shadow-md"
                      : "text-gray-700 hover:bg-[#03a678]/5 hover:text-[#03a678]"
                  }`}
                >
                  <span className={isActive ? "text-white" : "text-gray-500 group-hover:text-[#03a678]"}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pt-16 lg:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-5 text-center text-xs text-gray-500 mt-auto">
        <p>
          <span className="text-[#03a678] font-semibold">Smart Choice Rental Management</span>
          <br className="sm:hidden" />
          {" "}© {new Date().getFullYear()} Created by{" "}
          <a
            href="https://vickins-technologies-lv2h.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#03a678] font-semibold hover:underline"
          >
            Vickins Technologies
          </a>
          . All rights reserved.
        </p>
      </footer>
    </div>
  );
}