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
  user?: { name: string };
  message?: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { userId, role } = useAuth();
  const [name, setname] = useState<string>("User");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const links = [
    {
      href: "/property-owner-dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      href: "/property-owner-dashboard/properties",
      label: "Properties",
      icon: <Building2 size={18} />,
    },
    {
      href: "/property-owner-dashboard/tenants",
      label: "Tenants",
      icon: <Users size={18} />,
    },
    {
      href: "/property-owner-dashboard/payments",
      label: "Payments",
      icon: <CreditCard size={18} />,
    },
    {
      href: "/property-owner-dashboard/settings",
      label: "Settings",
      icon: <Settings size={18} />,
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined" || !userId || role !== "propertyOwner") {
      console.log("useEffect: Skipping user fetch during SSR or unauthorized", { userId, role });
      setIsLoading(false);
      return;
    }

    const fetchUserName = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/user?userId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data: UserResponse = await response.json();
        console.log("fetchUserName response:", data);
        if (data.success && data.user?.name) {
          setname(data.user.name);
        } else {
          setError(data.message || "Failed to fetch user name");
        }
      } catch (err) {
        console.error("Fetch user name error:", err);
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserName();
  }, [userId, role]);

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        className="sm:hidden fixed top-4 right-4 z-40 text-[#0a0a23] bg-white border border-gray-300 p-2 rounded-md shadow-md"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-screen w-64 bg-white text-[#0a0a23] px-6 py-6 border-r border-gray-200 shadow-md transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} sm:translate-x-0 sm:block`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-center mb-6 text-gray-700 tracking-tight">
          {isLoading ? "Loading..." : error ? "Welcome PropertyOwner" : `Welcome ${name}`}
        </h2>

        {/* Navigation Links */}
        <nav className="flex flex-col space-y-2">
          {links.map(({ href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
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

      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}