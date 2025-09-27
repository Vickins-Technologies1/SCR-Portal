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
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            className="sm:hidden text-[#0a0a23]"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle Sidebar"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-xl font-semibold text-[#0a0a23]">Tenant Dashboard</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-700">
            {isLoading ? "Loading..." : error ? "Tenant" : name}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-700 hover:text-[#03a678]"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-30 h-[calc(100vh-4rem)] w-64 bg-white text-[#0a0a23] px-6 py-6 border-r border-gray-200 shadow-md transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} sm:translate-x-0 sm:block`}
      >
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain" />
        </div>
        <h2 className="text-center text-gray-700 font-semibold mb-6">
          {isLoading ? "Loading..." : error ? "Error: Tenant" : `Welcome ${name}`}
        </h2>
        <nav className="flex flex-col gap-2">
          {links.map(({ href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 rounded-md font-medium transition text-sm ${
                  isActive
                    ? "bg-[#03a678] text-white shadow"
                    : "text-gray-700 hover:bg-[#03a678]/10 hover:text-[#03a678]"
                }`}
              >
                {icon}
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 mt-16 sm:ml-64 p-6">{children}</main>

      {/* Overlay on mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 shadow-inner py-4 text-center text-sm text-gray-600 mt-auto">
        <span className="text-[#03a678] font-semibold">Smart Choice Rental Management</span>
        <br />
        Created by{" "}
        <a
          href="https://vickins-technologies-lv2h.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#03a678] font-semibold hover:underline"
        >
          Vickins Technologies
        </a>
        . All rights reserved.
      </footer>
    </div>
  );
}