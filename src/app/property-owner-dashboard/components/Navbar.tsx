"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Navbar() {
  const router = useRouter();

  const handleSignOut = () => {
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    router.push("/");
  };

  return (
    <header className="fixed top-0 z-40 h-16 w-full border-b border-gray-200 bg-white/90 backdrop-blur-md shadow-sm md:pl-72">
      {/* md:pl-72 = exact width of sidebar (w-72) */}
      <div className="flex h-full items-center justify-between px-6 lg:px-10">
        
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={300}
            height={200}
            className="h-20 w-40 rounded-lg object-contain drop-shadow-sm"
          />
         
        </div>

        {/* Right: Logout Button */}
        <button
          onClick={handleSignOut}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#03a678] to-[#029c6b] px-6 py-2.5 font-medium text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-[#03a678]/30 hover:-translate-y-0.5"
        >
          <span className="relative z-10 flex items-center gap-2">
            <span>Logout</span>
          </span>
          <div className="absolute inset-0 -translate-x-full bg-white/20 transition-transform duration-500 group-hover:translate-x-0" />
        </button>
      </div>
    </header>
  );
}