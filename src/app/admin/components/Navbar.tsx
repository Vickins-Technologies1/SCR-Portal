"use client";

import Image from "next/image";
import { Menu, X } from "lucide-react";
import NavbarDateTime from "@/components/NavbarDateTime";

type NavbarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Navbar({ isSidebarOpen, onToggleSidebar }: NavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 w-full max-w-[100vw] border-b border-border bg-card backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-72">
      <div className="flex h-full w-full min-w-0 items-center gap-3 px-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Image
            src="/logo.png"
            alt="Sorana Property Managers Logo"
            width={180}
            height={64}
            className="h-8 w-auto max-w-[120px] rounded-md object-contain drop-shadow-sm sm:h-9 sm:max-w-[140px] lg:h-10 lg:max-w-none"
            priority
          />
          <NavbarDateTime />
        </div>

        <button
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={isSidebarOpen}
          title="Menu"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95 md:hidden"
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </header>
  );
}
