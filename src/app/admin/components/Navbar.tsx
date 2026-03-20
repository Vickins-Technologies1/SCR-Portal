// src/app/admin/components/Navbar.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Menu, X } from "lucide-react";
import Cookies from "js-cookie";

type NavbarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Navbar({ isSidebarOpen, onToggleSidebar }: NavbarProps) {
  const router = useRouter();

  const handleSignOut = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    // Add other cookies if needed: permissions, ownerId, etc.
    router.push("/admin/login");
  };

  return (
    <header className="fixed top-0 z-40 h-14 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-60 lg:pl-60">
      <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-5 lg:px-8">
        {/* Left: Menu + Logo */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title="Menu"
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-gray-200 bg-white/90 text-gray-700 shadow-sm transition hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#03a678]/30"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={180}
            height={64}
            className="h-9 w-auto max-w-[140px] sm:h-10 sm:max-w-[160px] lg:h-11 lg:max-w-none object-contain drop-shadow-sm rounded-md"
            priority
          />
        </div>

        {/* Right: Logout */}
        <button
          onClick={handleSignOut}
          className="group flex items-center gap-2 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-[#03a678]/60 hover:text-[#03a678] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#03a678]/30 active:scale-95"
          title="Sign out"
        >
          <LogOut size={18} className="transition-transform group-hover:rotate-6" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
