
"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const router = useRouter();

  const handleSignOut = () => {
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    router.push("/");
  };

  return (
    <header className="sm:ml-64 fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 shadow-sm h-16 flex items-center px-4 sm:px-8">
      <div className="flex justify-between items-center w-full">
        {/* Logo or Title (optional for desktop view) */}
        <div className="hidden sm:block">
          <h1 className="text-lg font-semibold text-[#0a0a23] tracking-wide">
            Smart Choice Rental Management
          </h1>
        </div>

        {/* Right Side Items */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSignOut}
            className="text-sm font-medium bg-[#03a678] text-white px-4 py-1.5 rounded-md shadow-sm hover:bg-[#029c6b] transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}