"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Menu, X, Sparkles, Shield } from "lucide-react";
import Cookies from "js-cookie";
import { useEffect, useState } from "react";
import { useSidebar } from "./SidebarContext";
import NavbarDateTime from "@/components/NavbarDateTime";

export default function Navbar() {
  const router = useRouter();
  const { isOpen, toggle } = useSidebar();
  const [isAdminImpersonating, setIsAdminImpersonating] = useState(false);
  const [impersonatedOwnerName, setImpersonatedOwnerName] = useState("");
  const [isReverting, setIsReverting] = useState(false);

  useEffect(() => {
    const isImpersonating = Cookies.get("adminImpersonating") === "true";
    setIsAdminImpersonating(isImpersonating);
    if (isImpersonating) {
      setImpersonatedOwnerName(Cookies.get("adminImpersonatingOwnerName") || "Owner");
    }
  }, []);

  const handleRevertImpersonation = async () => {
    if (isReverting) return;
    setIsReverting(true);
    try {
      const res = await fetch("/api/admin/revert-impersonation", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        Cookies.remove("adminOriginalUserId", { path: "/" });
        Cookies.remove("adminOriginalRole", { path: "/" });
        Cookies.remove("adminImpersonating", { path: "/" });
        Cookies.remove("adminImpersonatingOwnerId", { path: "/" });
        Cookies.remove("adminImpersonatingOwnerName", { path: "/" });
        router.push("/admin/users");
      }
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <header
      data-tour="owner-navbar"
      className="fixed top-0 left-0 right-0 z-40 h-16 w-full max-w-[100vw] border-b border-border bg-card backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-72"
    >
      {/* md:pl-72 = exact width of sidebar (w-72) */}
      <div className="flex h-full w-full min-w-0 items-center gap-3 px-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Image
              src="/logo.png"
              alt="Sorana Property Managers Logo"
              width={200}
              height={80}
              className="h-8 w-auto max-w-[120px] sm:h-9 sm:max-w-[140px] lg:h-10 lg:max-w-none rounded-md object-contain drop-shadow-sm"
              priority
            />
            <NavbarDateTime />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {isAdminImpersonating && (
            <button
              onClick={handleRevertImpersonation}
              disabled={isReverting}
              className="group flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3.5 sm:text-sm font-medium text-red-400 transition-all hover:border-red-500/40 hover:bg-red-500/15 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:ring-offset-0 active:scale-95 disabled:opacity-60"
              title="Return to admin"
            >
              <Shield size={16} className="transition-transform group-hover:rotate-6 sm:size-[18px]" />
              <span className="hidden sm:inline">Admin: {impersonatedOwnerName}</span>
              <span className="sm:hidden">Return</span>
            </button>
          )}
            <button
              onClick={() => window.dispatchEvent(new Event("start-owner-tour"))}
              className="group flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3.5 sm:text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 active:scale-95"
              title="Start tour"
            >
              <Sparkles size={16} className="transition-transform group-hover:rotate-6 sm:size-[18px]" />
              <span className="hidden sm:inline">Tour</span>
            </button>
            <button
              onClick={toggle}
              aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
              aria-expanded={isOpen}
              title="Menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95 lg:hidden"
            >
              {isOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
      </div>
    </header>
  );
}



