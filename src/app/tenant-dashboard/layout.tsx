"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Building2,
  CreditCard,
  Wrench,
  Settings,
  LogOut,
} from "lucide-react";
import Cookies from "js-cookie";

const useAuth = () => {
  if (typeof window === "undefined") {
    console.log("useAuth: Running server-side, returning null");
    return { userId: null, role: null };
  }
  const userId = Cookies.get("userId") || null;
  const role = Cookies.get("role") || null;
  console.log("useAuth: Cookies read:", { userId, role });
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
      href: "/tenant-dashboard/leased-properties",
      label: "Leased Properties",
      icon: <Building2 size={18} />,
    },
    {
      href: "/tenant-dashboard/payments",
      label: "Payments",
      icon: <CreditCard size={18} />,
    },
    {
      href: "/tenant-dashboard/maintenance-requests",
      label: "Maintenance Requests",
      icon: <Wrench size={18} />,
    },
    {
      href: "/tenant-dashboard/settings",
      label: "Settings",
      icon: <Settings size={18} />,
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined" || !userId || role !== "tenant") {
      console.log("useEffect: Skipping user fetch during SSR or unauthorized", { userId, role });
      setIsLoading(false);
      return;
    }

    const fetchUserName = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log("Fetching user from:", `/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`);
        const response = await fetch(`/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        console.log("Response status:", response.status);
        const text = await response.text();
        console.log("Response body:", text);
        if (!response.ok) {
          const data: UserResponse = JSON.parse(text);
          if (response.status === 404) {
            setError(data.message || "User not found. Please check your account details.");
          } else if (response.status === 400) {
            setError(data.message || "Invalid request. Please ensure user ID and role are correct.");
          } else {
            setError(data.message || `HTTP error! Status: ${response.status}`);
          }
        } else {
          const data: UserResponse = JSON.parse(text);
          console.log("fetchUserName response:", data);
          if (data.success && data.user?.name) {
            setName(data.user.name);
          } else {
            setError(data.message || "Failed to fetch user name");
          }
        }
      } catch (err) {
        console.error("Fetch user name error:", err);
        setError("Failed to connect to the server. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    const debounceFetch = setTimeout(() => {
      fetchUserName();
    }, 500);

    return () => clearTimeout(debounceFetch);
  }, [userId, role]);

  const handleLogout = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    window.location.href = "/"; // Redirect to login page
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            className="sm:hidden text-[#0a0a23] p-2"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle Sidebar"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-xl font-semibold text-[#0a0a23]">
            Tenant Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-700">
            {isLoading ? "Loading..." : error ? "Tenant" : name}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-700 hover:text-[#03a678] p-2"
            aria-label="Log out"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-30 h-[calc(100vh-4rem)] w-64 bg-white text-[#0a0a23] px-6 py-6 border-r border-gray-200 shadow-md transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} sm:translate-x-0 sm:block`}
      >
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
        </div>
        <h2 className="text-lg font-semibold text-center mb-6 text-gray-700 tracking-tight">
          {isLoading ? "Loading..." : error ? "Error: Tenant" : `Welcome ${name}`}
        </h2>
        <nav className="flex flex-col space-y-2">
          {links.map(({ href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 rounded-md font-medium transition-colors text-sm ${
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
      <main className="flex-1 p-6 mt-16 sm:ml-64">{children}</main>

      {/* Overlay for Mobile Sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}