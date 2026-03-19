// src/app/admin/components/Navbar.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import Cookies from "js-cookie";

export default function Navbar() {
  const router = useRouter();

  const handleSignOut = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    // Add other cookies if needed: permissions, ownerId, etc.
    router.push("/admin/login");
  };

  return (
    <header className="fixed top-0 z-40 h-14 w-full border-b border-gray-100 bg-white/90 backdrop-blur-md shadow-sm md:pl-60 lg:pl-60">
      <div className="flex h-full items-center justify-between px-4 sm:px-5 lg:px-8">
        {/* Left: Logo */}
        <div className="flex items-center">
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={180}
            height={64}
            className="h-10 w-28 sm:h-11 sm:w-32 object-contain drop-shadow-sm rounded-md"
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
