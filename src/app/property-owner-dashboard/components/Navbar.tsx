"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";

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
            width={250}
            height={100}
            className="h-20 w-40 rounded-lg object-contain drop-shadow-sm"
          />
         
        </div>

      {/* Right: Logout Button – responsive */}
        <button
          onClick={handleSignOut}
          className="group flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#03a678]/70 hover:text-[#03a678] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#03a678]/30 focus:ring-offset-1 active:scale-95"
          title="Sign out" // tooltip on mobile
        >
          <LogOut size={18} className="transition-transform group-hover:rotate-6" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}