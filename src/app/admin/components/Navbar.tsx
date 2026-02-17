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
    <header className="fixed top-0 z-40 h-16 w-full border-b border-gray-100 bg-white/90 backdrop-blur-md shadow-sm md:pl-64 lg:pl-72">
      <div className="flex h-full items-center justify-between px-5 sm:px-6 lg:px-10">
        {/* Left: Logo */}
        <div className="flex items-center">
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={220}
            height={80}
            className="h-14 w-36 sm:h-16 sm:w-40 object-contain drop-shadow-sm rounded-lg"
            priority
          />
        </div>

        {/* Right: Logout */}
        <button
          onClick={handleSignOut}
          className="group flex items-center gap-2.5 rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#03a678]/60 hover:text-[#03a678] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#03a678]/30 active:scale-95"
          title="Sign out"
        >
          <LogOut size={18} className="transition-transform group-hover:rotate-6" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}