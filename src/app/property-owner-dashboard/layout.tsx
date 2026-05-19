"use client";

import type { ReactNode } from "react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { SidebarProvider } from "./components/SidebarContext";
import TourGuide, { TourStep } from "@/components/tour/TourGuide";
import { usePathname, useRouter } from "next/navigation";
import SupportWidget from "./components/SupportWidget";
import Cookies from "js-cookie";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import InvoiceRestrictionGate from "./components/InvoiceRestrictionGate";
import BottomTabs from "@/components/mobile/BottomTabs";

export default function PropertyOwnerDashboardLayout({ children }: { children: ReactNode }) {
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
      Cookies.remove("managementType");
      Cookies.remove("csrf-token");
      Cookies.remove("impersonatingTenantId", { path: "/" });
      Cookies.remove("isImpersonating", { path: "/" });
      router.replace("/");
    },
  });
  const steps: TourStep[] = [
    {
      title: "Navigation Sidebar",
      body: "Use this menu to move between properties, tenants, payments, reports, and settings.",
      selector: '[data-tour="owner-sidebar"]',
      placement: "right",
    },
    {
      title: "Overview",
      body: "Your portfolio snapshot: revenue, occupancy, and key alerts at a glance.",
      selector: '[data-tour="owner-nav-dashboard"]',
      placement: "right",
    },
    {
      title: "Properties",
      body: "View and manage properties, unit types, and occupancy details.",
      selector: '[data-tour="owner-nav-properties"]',
      placement: "right",
    },
    {
      title: "Tenants",
      body: "Manage tenants, leases, dues, and tenant actions.",
      selector: '[data-tour="owner-nav-tenants"]',
      placement: "right",
    },
    {
      title: "Users",
      body: "Invite and manage team members with role-based access.",
      selector: '[data-tour="owner-nav-users"]',
      placement: "right",
    },
    {
      title: "Payments",
      body: "Track rent, deposits, utilities, and manual payments.",
      selector: '[data-tour="owner-nav-payments"]',
      placement: "right",
    },
    {
      title: "Integrations",
      body: "Connect payment providers like Tuma and manage API credentials.",
      selector: '[data-tour="owner-nav-integrations"]',
      placement: "right",
    },
    {
      title: "Expenses",
      body: "Log and review operating expenses for each property.",
      selector: '[data-tour="owner-nav-expenses"]',
      placement: "right",
    },
    {
      title: "Notifications",
      body: "Monitor updates, reminders, and action items.",
      selector: '[data-tour="owner-nav-notifications"]',
      placement: "right",
    },
    {
      title: "Reports & Invoices",
      body: "Generate reports, export data, and manage invoices.",
      selector: '[data-tour="owner-nav-reports"]',
      placement: "right",
    },
    {
      title: "Settings",
      body: "Configure account preferences and portal settings.",
      selector: '[data-tour="owner-nav-settings"]',
      placement: "right",
    },
    {
      title: "List Property",
      body: "Create new listings and publish properties to the marketplace.",
      selector: '[data-tour="owner-nav-list-property"]',
      placement: "right",
    },
    {
      title: "Payment Filters",
      body: "Filter payments by tenant, type, status, or unit type to focus on what you need.",
      selector: '[data-tour="owner-payments-filters"]',
      placement: "top",
      paths: ["/property-owner-dashboard/payments"],
    },
    {
      title: "Payments Table",
      body: "All recorded transactions appear here with status and references.",
      selector: '[data-tour="owner-payments-table"]',
      placement: "top",
      paths: ["/property-owner-dashboard/payments"],
    },
    {
      title: "Tenant Filters",
      body: "Search tenants by name, email, property, or unit type.",
      selector: '[data-tour="owner-tenant-filters"]',
      placement: "top",
      paths: ["/property-owner-dashboard/tenants"],
    },
    {
      title: "Tenant Actions",
      body: "Quickly edit, resend welcome notifications, or remove tenants from this column.",
      selector: '[data-tour="owner-tenant-actions"]',
      placement: "top",
      paths: ["/property-owner-dashboard/tenants"],
    },
    {
      title: "Add a Tenant",
      body: "Use this button to onboard a new tenant when your account is up to date.",
      selector: '[data-tour="owner-add-tenant"]',
      placement: "bottom",
      paths: ["/property-owner-dashboard/tenants"],
    },
    {
      title: "Invoice Forecast",
      body: "Estimate next month’s invoice totals and expected income by property.",
      selector: '[data-tour="owner-invoice-estimate"]',
      placement: "bottom",
      paths: ["/property-owner-dashboard/reports"],
    },
    {
      title: "Report Filters",
      body: "Filter reports by property, payment type, and date range.",
      selector: '[data-tour="owner-report-filters"]',
      placement: "top",
      paths: ["/property-owner-dashboard/reports"],
    },
    {
      title: "Invoice Table",
      body: "Review invoice status and pay pending invoices directly from this list.",
      selector: '[data-tour="owner-invoice-table"]',
      placement: "top",
      paths: ["/property-owner-dashboard/reports"],
    },
    {
      title: "Top Bar",
      body: "Access the menu on mobile, restart this tour, or sign out securely.",
      selector: '[data-tour="owner-navbar"]',
      placement: "bottom",
    },
    {
      title: "Workspace",
      body: "This area updates based on the section you select—stats, tables, and actions live here.",
      selector: '[data-tour="owner-workspace"]',
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
        <div className="owner-portal relative min-h-screen bg-background pb-28 text-foreground text-[12px] sm:text-[13px] lg:text-sm overflow-x-hidden md:pb-0">
          <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
          <div className="relative z-10" data-tour="owner-workspace">
            {children}
          </div>
          <SupportWidget />
          <BottomTabs variant="owner" />
          <TourGuide
            steps={steps}
            storageKey="owner-tour-v1"
            startEventName="start-owner-tour"
            currentPath={pathname}
          />
        </div>
      </SidebarProvider>
    </PublicThemeWrapper>
  );
}




