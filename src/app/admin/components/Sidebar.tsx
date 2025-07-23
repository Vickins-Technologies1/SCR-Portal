
"use client";

import React, { useState } from "react";
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
  FileText,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    {
      href: "/admin/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      href: "/admin/users",
      label: "Users",
      icon: <Users size={18} />,
    },
    {
      href: "/admin/properties",
      label: "Properties",
      icon: <Building2 size={18} />,
    },
    {
      href: "/admin/payments",
      label: "Payments",
      icon: <CreditCard size={18} />,
    },
    {
      href: "/admin/invoices",
      label: "Invoices",
      icon: <FileText size={18} />,
    },
  ];

  return (
    <>
      <button
        className="sm:hidden fixed top-4 right-4 z-40 text-[#012a4a] bg-white p-2 shadow-md rounded-lg"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`fixed top-0 left-0 z-30 h-screen w-64 bg-white text-[#012a4a] px-6 py-6 border-r border-gray-200 shadow-md transition-transform duration-300 ease-in-out font-sans
        ${isOpen ? "translate-x-0" : "-translate-x-full"} sm:translate-x-0 sm:block`}
      >
        <div className="flex items-center justify-center mb-6">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain" />
        </div>

        <h2 className="text-lg font-semibold text-center mb-6 text-gray-700 tracking-tight">
          Welcome Admin
        </h2>

        <nav className="flex flex-col space-y-2">
          {links.map(({ href, label, icon }) => {
            const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                  isActive
                    ? "bg-[#012a4a] text-white shadow"
                    : "text-[#012a4a] hover:bg-[#012a4a]/10 hover:text-[#014a7a]"
                }`}
              >
                {icon}
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
