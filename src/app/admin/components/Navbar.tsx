"use client";

import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import NavbarDateTime from "@/components/NavbarDateTime";
import DashboardNavbarActions from "@/components/portal/DashboardNavbarActions";
import ThemeToggle from "@/components/theme/ThemeToggle";

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
      // The client-side cleanup below still signs the user out locally.
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
    <header className="fixed top-0 left-0 right-0 z-40 h-16 w-full max-w-[100vw] border-b border-border bg-card backdrop-blur-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)] md:pl-72">
      <div className="flex h-full w-full min-w-0 items-center gap-3 px-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Image
            src="/brand/my-accurate-rent-logo.png"
            alt="My Accurate Rent logo"
            width={180}
            height={64}
            className="h-9 w-auto max-w-[140px] rounded-md object-contain drop-shadow-sm sm:h-10 sm:max-w-[160px] lg:h-11 lg:max-w-none"
            priority
          />
          <NavbarDateTime />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <DashboardNavbarActions onSignOut={handleSignOut} />
          <ThemeToggle
            variant="icon"
            className="h-10 w-10 rounded-[10px] md:hidden"
          />
          <button
            onClick={onToggleSidebar}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={isSidebarOpen}
            title="Menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border/70 bg-background/85 text-muted-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95 md:hidden"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
