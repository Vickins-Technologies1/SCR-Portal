// src/app/admin/components/Navbar.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Menu, X } from "lucide-react";
import Cookies from "js-cookie";
import NavbarDateTime from "@/components/NavbarDateTime";

type NavbarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Navbar({ isSidebarOpen, onToggleSidebar }: NavbarProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await fetch("/api/signout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore network failures; we still clear client-visible state.
    } finally {
      Cookies.remove("userId", { path: "/" });
      Cookies.remove("role", { path: "/" });
      Cookies.remove("permissions", { path: "/" });
      Cookies.remove("ownerId", { path: "/" });
      Cookies.remove("managementType", { path: "/" });
      Cookies.remove("tier", { path: "/" });
      Cookies.remove("adminName", { path: "/" });
      Cookies.remove("csrf-token", { path: "/" });
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      Cookies.remove("adminOriginalUserId", { path: "/" });
      Cookies.remove("adminOriginalRole", { path: "/" });
      Cookies.remove("adminImpersonating", { path: "/" });
      Cookies.remove("adminImpersonatingOwnerId", { path: "/" });
      Cookies.remove("adminImpersonatingOwnerName", { path: "/" });
      localStorage.removeItem("userId");
      localStorage.removeItem("role");
      router.replace("/admin/login");
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 w-full max-w-[100vw] border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-72">
      <div className="flex h-full w-full min-w-0 items-center justify-between gap-3 px-3 sm:px-6 lg:px-10">
        {/* Left: Menu + Logo */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title="Menu"
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-white/90 text-muted-foreground shadow-sm transition hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Image
              src="/logo.png"
              alt="Sorana Property Managers Logo"
              width={180}
              height={64}
              className="h-8 w-auto max-w-[120px] sm:h-9 sm:max-w-[140px] lg:h-10 lg:max-w-none object-contain drop-shadow-sm rounded-md"
              priority
            />
            <NavbarDateTime />
          </div>
        </div>

        {/* Right: Logout */}
        <button
          onClick={handleSignOut}
          className="group flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3.5 sm:text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 active:scale-95"
          title="Sign out"
        >
          <LogOut size={18} className="transition-transform group-hover:rotate-6" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
