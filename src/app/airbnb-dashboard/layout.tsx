"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { SidebarProvider } from "./components/SidebarContext";
import TourGuide, { TourStep } from "@/components/tour/TourGuide";
import { usePathname, useRouter } from "next/navigation";
import SupportWidget from "../property-owner-dashboard/components/SupportWidget";
import Cookies from "js-cookie";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import InvoiceRestrictionGate from "../property-owner-dashboard/components/InvoiceRestrictionGate";

export default function AirbnbDashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

  useIdleLogout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      Cookies.remove("userId");
      Cookies.remove("role");
      Cookies.remove("permissions");
      Cookies.remove("ownerId");
      Cookies.remove("csrf-token");
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      router.replace("/");
    },
  });

  const steps: TourStep[] = [
    {
      title: "Navigation Sidebar",
      body: "Use this menu to move between listings, calendar, bookings, and operations.",
      selector: '[data-tour="airbnb-sidebar"]',
      placement: "right",
    },
    {
      title: "Overview",
      body: "Your STR command center with KPIs, occupancy, and booking activity at a glance.",
      selector: '[data-tour="airbnb-nav-dashboard"]',
      placement: "right",
    },
    {
      title: "Listings",
      body: "Manage Airbnb-ready listings, photos, and publishing status.",
      selector: '[data-tour="airbnb-nav-listings"]',
      placement: "right",
    },
    {
      title: "Calendar",
      body: "Set availability and seasonal rules for every listing.",
      selector: '[data-tour="airbnb-nav-calendar"]',
      placement: "right",
    },
    {
      title: "Bookings",
      body: "Track reservations, guest details, and booking changes in real time.",
      selector: '[data-tour="airbnb-nav-bookings"]',
      placement: "right",
    },
    {
      title: "Inbox",
      body: "Respond to guests and automate messages from a unified inbox.",
      selector: '[data-tour="airbnb-nav-inbox"]',
      placement: "right",
    },
    {
      title: "Operations",
      body: "Assign cleaning, maintenance, and turnover tasks.",
      selector: '[data-tour="airbnb-nav-operations"]',
      placement: "right",
    },
    {
      title: "Payments",
      body: "Monitor payouts, direct payments, and M-Pesa activity.",
      selector: '[data-tour="airbnb-nav-payments"]',
      placement: "right",
    },
    {
      title: "Reports",
      body: "Export performance analytics and owner statements.",
      selector: '[data-tour="airbnb-nav-reports"]',
      placement: "right",
    },
    {
      title: "Integrations",
      body: "Manage payments, analytics, and guest communication integrations.",
      selector: '[data-tour="airbnb-nav-integrations"]',
      placement: "right",
    },
    {
      title: "Settings",
      body: "Configure your account, team roles, and automation defaults.",
      selector: '[data-tour="airbnb-nav-settings"]',
      placement: "right",
    },
    {
      title: "Top Bar",
      body: "Access the menu on mobile, restart this tour, or sign out securely.",
      selector: '[data-tour="airbnb-navbar"]',
      placement: "bottom",
    },
    {
      title: "Workspace",
      body: "This area updates based on the section you select—stats, tables, and actions live here.",
      selector: '[data-tour="airbnb-workspace"]',
      placement: "top",
    },
    {
      title: "Need a refresher?",
      body: "Tap the Tour button in the top bar anytime to replay this guide.",
      placement: "center",
    },
  ];

  return (
    <PublicThemeWrapper>
      <SidebarProvider>
        <InvoiceRestrictionGate />
        <div className="owner-portal relative min-h-screen bg-background text-foreground text-[12px] sm:text-[13px] lg:text-sm overflow-x-hidden">
          <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
          <div className="relative z-10" data-tour="airbnb-workspace">
            {children}
          </div>
          <SupportWidget />
          <TourGuide
            steps={steps}
            storageKey="airbnb-tour-v1"
            startEventName="start-airbnb-tour"
            currentPath={pathname}
          />
        </div>
      </SidebarProvider>
    </PublicThemeWrapper>
  );
}
