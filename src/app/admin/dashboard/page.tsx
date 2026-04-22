// app/admin/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  CreditCard,
  FileText,
  Shield,
  Info,
  AlertCircle,
  RefreshCw,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarCheck,
  MessageCircle,
  Wallet,
  Plug,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PendingApprovals from "../components/PendingApprovals";
import { cn } from "@/lib/cn";

interface Counts {
  propertyOwners: number;
  tenants: number;
  properties: number;
  payments: number;
  invoices: number;
  admins: number;
}

interface PaymentSummary {
  totalCollected: number;
  totalPaidInvoices: number;
  totalUnpaidInvoices: number;
  totalInvoices: number;
  pendingInvoicesCount: number;
}

interface AirbnbOverviewTotals {
  listings: number;
  bookings: number;
  messages: number;
  payouts: number;
  integrations: number;
  owners: number;
}

interface AirbnbOverviewAlerts {
  pendingPayouts: number;
  unreadMessages: number;
  upcomingBookings: number;
}

interface AirbnbRecentBooking {
  _id: string;
  listingName: string;
  guestName: string;
  ownerEmail: string;
  checkIn: string;
  checkOut: string;
  total: number;
  status: string;
}

interface AirbnbOverviewResponse {
  totals: AirbnbOverviewTotals;
  alerts: AirbnbOverviewAlerts;
  recentBookings: AirbnbRecentBooking[];
}

export default function AdminDashboard() {
  const router = useRouter();

  const [counts, setCounts] = useState<Counts>({
    propertyOwners: 0,
    tenants: 0,
    properties: 0,
    payments: 0,
    invoices: 0,
    admins: 0,
  });

  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({
    totalCollected: 0,
    totalPaidInvoices: 0,
    totalUnpaidInvoices: 0,
    totalInvoices: 0,
    pendingInvoicesCount: 0,
  });

  const [airbnbOverview, setAirbnbOverview] = useState<AirbnbOverviewResponse | null>(null);
  const [isAirbnbLoading, setIsAirbnbLoading] = useState(false);
  const [airbnbError, setAirbnbError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Session check ───────────────────────────────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Fetch dashboard data ────────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const [ownersRes, tenantsRes, propsRes, paymentsRes, invoicesRes, adminsRes] = await Promise.all([
        fetch("/api/admin/property-owners", { credentials: "include" }),
        fetch("/api/admin/tenants", { credentials: "include" }),
        fetch("/api/admin/properties", { credentials: "include" }),
        fetch("/api/admin/payments", { credentials: "include" }),
        fetch("/api/admin/invoices", { credentials: "include" }),
        fetch("/api/admin", { credentials: "include" }),
      ]);

      const responses = [ownersRes, tenantsRes, propsRes, paymentsRes, invoicesRes, adminsRes];
      for (const res of responses) {
        if (res.status === 401 || res.status === 403) {
          router.replace("/admin/login?session=expired");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      const [owners, tenants, properties, payments, invoices, admins] = await Promise.all(
        responses.map((r) => r.json())
      );

      setCounts({
        propertyOwners: owners?.count ?? owners?.propertyOwners?.length ?? 0,
        tenants: tenants?.count ?? tenants?.tenants?.length ?? 0,
        properties: properties?.count ?? properties?.properties?.length ?? 0,
        payments: payments?.count ?? 0,
        invoices: invoices?.count ?? 0,
        admins: admins?.count ?? 0,
      });

      setPaymentSummary({
        totalCollected: payments?.totalCollected ?? 0,
        totalPaidInvoices: invoices?.totalPaid ?? 0,
        totalUnpaidInvoices: invoices?.totalUnpaid ?? 0,
        totalInvoices: invoices?.count ?? 0,
        pendingInvoicesCount: invoices?.pendingCount ?? 0,
      });
    } catch (err: any) {
      console.error("Dashboard fetch failed:", err);
      setError(
        err.message?.includes("Session expired")
          ? "Your session has expired. Please log in again."
          : "Failed to load dashboard data. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  const fetchAirbnbOverview = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsAirbnbLoading(true);
    setAirbnbError(null);

    try {
      const res = await fetch("/api/admin/airbnb/overview", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to load Airbnb overview");
      }

      setAirbnbOverview(data.overview || null);
    } catch (err: any) {
      setAirbnbError(err.message || "Failed to load Airbnb overview.");
    } finally {
      setIsAirbnbLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchDashboardData();
      fetchAirbnbOverview();
    }
  }, [status, fetchDashboardData, fetchAirbnbOverview]);

  // ── Combined cards (original + payments/invoices) ──────────────────────────
  const allCards = [
    // New payment & invoice focused cards
    {
      title: "Total Collected",
      value: `KSh ${paymentSummary.totalCollected.toLocaleString()}`,
      icon: DollarSign,
      explanation: "Total amount from successful payments received system-wide.",
    },
    {
      title: "Paid Invoices",
      value: `KSh ${paymentSummary.totalPaidInvoices.toLocaleString()}`,
      icon: CheckCircle2,
      explanation: "Total amount from invoices marked as paid or completed.",
    },
    {
      title: "Unpaid Invoices",
      value: `KSh ${paymentSummary.totalUnpaidInvoices.toLocaleString()}`,
      icon: AlertTriangle,
      explanation: "Total outstanding amount from pending/unpaid invoices.",
    },
    {
      title: "Pending Count",
      value: paymentSummary.pendingInvoicesCount.toLocaleString(),
      icon: Clock,
      explanation: "Number of invoices still awaiting payment.",
    },
    // Original stats
    {
      title: "Property Owners",
      value: counts.propertyOwners.toLocaleString(),
      icon: Users,
      explanation: "Total number of registered property owners in the system.",
    },
    {
      title: "Tenants",
      value: counts.tenants.toLocaleString(),
      icon: Users,
      explanation: "Total active tenants across all properties.",
    },
    {
      title: "Properties",
      value: counts.properties.toLocaleString(),
      icon: Building2,
      explanation: "Total number of properties listed and managed.",
    },
    {
      title: "Payments",
      value: counts.payments.toLocaleString(),
      icon: CreditCard,
      explanation: "Total payment transactions processed to date.",
    },
    {
      title: "Invoices",
      value: counts.invoices.toLocaleString(),
      icon: FileText,
      explanation: "Total invoices generated and sent.",
    },
    {
      title: "Admins",
      value: counts.admins.toLocaleString(),
      icon: Shield,
      explanation: "Total admin accounts with management privileges.",
    },
  ];

  const airbnbStats = React.useMemo(() => {
    if (!airbnbOverview) return [];
    return [
      { label: "Listings", value: airbnbOverview.totals.listings, icon: Building2 },
      { label: "Bookings", value: airbnbOverview.totals.bookings, icon: CalendarCheck },
      { label: "Messages", value: airbnbOverview.totals.messages, icon: MessageCircle },
      { label: "Payouts", value: airbnbOverview.totals.payouts, icon: Wallet },
      { label: "Integrations", value: airbnbOverview.totals.integrations, icon: Plug },
      { label: "Owners", value: airbnbOverview.totals.owners, icon: Users },
    ];
  }, [airbnbOverview]);

  const airbnbHasActivity = React.useMemo(() => {
    if (!airbnbOverview) return false;
    const totals = airbnbOverview.totals;
    const alerts = airbnbOverview.alerts;
    return Boolean(
      totals.listings ||
        totals.bookings ||
        totals.messages ||
        totals.payouts ||
        totals.integrations ||
        totals.owners ||
        alerts.pendingPayouts ||
        alerts.unreadMessages ||
        alerts.upcomingBookings ||
        airbnbOverview.recentBookings.length
    );
  }, [airbnbOverview]);

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Overview</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Monitor rentals activity, approvals, billing, and short-term stays.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs sm:text-sm">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchDashboardData();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={14} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="surface-card rounded-2xl h-28 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Single unified grid – original + new cards together */}
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
                {allCards.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.45 }}
                    className="group relative surface-card rounded-2xl p-4 sm:p-5 transition-all duration-300 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-[0.3em]">
                        {item.title}
                      </p>
                      <div className="relative group/info">
                        <Info
                          className="text-primary/70 hover:text-primary transition-colors cursor-help"
                          size={14}
                        />
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover/info:block z-50 pointer-events-none">
                          <div className="bg-foreground text-primary-foreground text-xs rounded-lg py-2 px-3 min-w-[200px] leading-relaxed shadow-xl">
                            {item.explanation}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <p className="text-xl sm:text-2xl font-semibold text-foreground">
                        {item.value}
                      </p>
                      <div className="p-2.5 sm:p-3 rounded-lg bg-primary/10">
                        <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Pending Approvals */}
              <div className="mt-6">
                <PendingApprovals />
              </div>
            </>
          )}

          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Airbnb Overview</p>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">Short-Term Rentals</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Monitor global Airbnb activity, alerts, and recent bookings.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {airbnbError && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs sm:text-sm">{airbnbError}</p>
                <button
                  onClick={() => {
                    setAirbnbError(null);
                    fetchAirbnbOverview();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={14} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isAirbnbLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl h-24 animate-pulse" />
              ))}
            </div>
          ) : airbnbOverview ? (
            airbnbHasActivity ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {airbnbStats.map((stat) => (
                    <div key={stat.label} className="surface-card rounded-2xl p-4 sm:p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                          {stat.label}
                        </p>
                        <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <stat.icon className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-foreground mt-2">
                        {stat.value.toLocaleString("en-US")}
                      </p>
                    </div>
                  ))}
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="surface-card rounded-2xl p-4">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                      Upcoming bookings (14 days)
                    </p>
                    <p className="text-xl font-semibold text-foreground mt-2">
                      {airbnbOverview.alerts.upcomingBookings.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div className="surface-card rounded-2xl p-4">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                      Unread messages
                    </p>
                    <p className="text-xl font-semibold text-foreground mt-2">
                      {airbnbOverview.alerts.unreadMessages.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div className="surface-card rounded-2xl p-4">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                      Pending payouts
                    </p>
                    <p className="text-xl font-semibold text-foreground mt-2">
                      {airbnbOverview.alerts.pendingPayouts.toLocaleString("en-US")}
                    </p>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="table-shell table-compact"
                >
                  <div className="px-4 pt-4">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">Recent bookings</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Latest reservations across all Airbnb owners.
                    </p>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listing</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guest</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Owner</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-In</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-Out</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total (KES)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {airbnbOverview.recentBookings.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                              No bookings available yet.
                            </td>
                          </tr>
                        ) : (
                          airbnbOverview.recentBookings.map((booking) => (
                            <tr key={booking._id} className="hover:bg-primary/5 transition-colors">
                              <td className="px-4 py-3 text-xs font-medium text-foreground">{booking.listingName}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{booking.guestName}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{booking.ownerEmail || "—"}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(booking.checkIn).toLocaleDateString("en-KE")}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(booking.checkOut).toLocaleDateString("en-KE")}
                              </td>
                              <td className="px-4 py-3 text-xs font-semibold text-primary">
                                Ksh {Math.round(booking.total || 0).toLocaleString("en-KE")}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                                    booking.status === "confirmed"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : booking.status === "pending"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {booking.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </>
            ) : (
              <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
                No Airbnb activity yet.
              </div>
            )
          ) : (
            <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
              No Airbnb data available yet.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
