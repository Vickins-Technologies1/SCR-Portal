"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

export default function Navbar() {
  const router = useRouter();

  const handleSignOut = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    router.push("/admin/login");
  };

  return (
    <header className="sm:ml-64 fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 shadow-sm h-16 flex items-center px-4 sm:px-8 font-sans">
      <div className="flex justify-between items-center w-full">
        <div className="hidden sm:block">
          <h1 className="text-lg font-semibold text-[#012a4a] tracking-wide">
            Admin Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSignOut}
            className="text-sm font-medium bg-[#012a4a] text-white px-4 py-1.5 rounded-lg shadow-sm hover:bg-[#014a7a] transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}