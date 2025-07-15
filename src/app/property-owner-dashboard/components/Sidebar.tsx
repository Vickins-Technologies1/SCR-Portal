"use client";

import React, { useState } from "react";
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

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

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
          Owner Dashboard
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
