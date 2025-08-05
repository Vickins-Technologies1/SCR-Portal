"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
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
} from "lucide-react";
import Cookies from "js-cookie";

const useAuth = () => {
  if (typeof window === "undefined") {
    console.log("useAuth: Running server-side, returning null");
    return { userId: null, role: null };
  }
  const userId = Cookies.get("userId") ?? null;
  const role = Cookies.get("role") ?? null;
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
  };
  message?: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { userId, role } = useAuth();
  const [name, setName] = useState<string>("User");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const links = [
    {
      key: "dashboard",
      href: "/property-owner-dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      key: "properties",
      href: "/property-owner-dashboard/properties",
      label: "Properties",
      icon: <Building2 size={18} />,
    },
    {
      key: "tenants",
      href: "/property-owner-dashboard/tenants",
      label: "Tenants",
      icon: <Users size={18} />,
    },
    {
      key: "payments",
      href: "/property-owner-dashboard/payments",
      label: "Payments",
      icon: <CreditCard size={18} />,
    },
    {
      key: "notifications",
      href: "/property-owner-dashboard/notifications",
      label: "Notifications",
      icon: <Bell size={18} />,
    },
    {
      key: "reports",
      href: "/property-owner-dashboard/reports",
      label: "Reports/Invoices",
      icon: <BarChart size={18} />,
    },
    {
      key: "settings",
      href: "/property-owner-dashboard/settings",
      label: "Settings",
      icon: <Settings size={18} />,
    },
    {
      key: "list-property",
      href: "/property-owner-dashboard/list-properties",
      label: "List Property",
      icon: <PlusCircle size={18} />,
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
        const response = await fetch(`/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        const text = await response.text();

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

  return (
    <>
      {/* Toggle Button for mobile/tablet */}
      <button
        className="md:hidden fixed top-4 right-4 z-40 text-[#0a0a23] bg-white p-2 shadow-md"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-screen w-64 bg-white text-[#0a0a23] px-6 py-6 border-r border-gray-200 shadow-md transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:block`}
      >
        <div className="flex items-center justify-center mb-6">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain" />
        </div>

        <h2 className="text-lg font-semibold text-center mb-6 text-gray-700 tracking-tight">
          {isLoading ? "Loading..." : error ? `Error: ${error}` : `Welcome ${name}`}
        </h2>

        <nav className="flex flex-col space-y-2">
          {links.map(({ key, href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={key}
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

      {/* Overlay for mobile/tablet */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
