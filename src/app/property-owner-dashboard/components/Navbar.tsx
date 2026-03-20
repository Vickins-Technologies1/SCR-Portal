"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Menu, X } from "lucide-react";
import { useSidebar } from "./SidebarContext";

export default function Navbar() {
  const router = useRouter();
  const { isOpen, toggle } = useSidebar();

  const handleSignOut = () => {
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    router.push("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 w-full max-w-[100vw] border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-72">
      {/* md:pl-72 = exact width of sidebar (w-72) */}
      <div className="flex h-full w-full min-w-0 items-center justify-between gap-3 px-3 sm:px-6 lg:px-10">
        
        {/* Left: Logo + Title */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            onClick={toggle}
            aria-label="Toggle sidebar"
            title="Menu"
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-gray-200 bg-white/90 text-gray-700 shadow-sm transition hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#42c775]/30"
          >
            {isOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={200}
            height={80}
            className="md:hidden h-8 w-auto max-w-[120px] rounded-md object-contain drop-shadow-sm"
            priority
          />
        </div>

      {/* Right: Logout Button – responsive */}
        <button
          onClick={handleSignOut}
          className="group flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3.5 sm:text-sm font-medium text-gray-700 transition-all hover:border-[#42c775]/70 hover:text-[#42c775] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#42c775]/30 focus:ring-offset-1 active:scale-95"
          title="Sign out" // tooltip on mobile
        >
          <LogOut size={16} className="transition-transform group-hover:rotate-6 sm:size-[18px]" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}



