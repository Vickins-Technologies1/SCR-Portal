"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  CalendarCheck,
  MessageCircle,
  Wallet,
  Plug,
  Users,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { cn } from "@/lib/utils";

interface OverviewTotals {
  listings: number;
  bookings: number;
  messages: number;
  payouts: number;
  integrations: number;
  owners: number;
}

interface OverviewAlerts {
  pendingPayouts: number;
  unreadMessages: number;
  upcomingBookings: number;
}

interface RecentBooking {
  _id: string;
  listingName: string;
  guestName: string;
  ownerEmail: string;
  checkIn: string;
  checkOut: string;
  total: number;
  status: string;
}

interface OverviewResponse {
  totals: OverviewTotals;
  alerts: OverviewAlerts;
  recentBookings: RecentBooking[];
}

export default function AdminAirbnbOverviewPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const fetchOverview = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    setError(null);

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
        throw new Error(data.message || "Failed to load overview");
      }

      setOverview(data.overview || null);
    } catch (err: any) {
      setError(err.message || "Failed to load Airbnb overview.");
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOverview();
    }
  }, [status, fetchOverview]);

  const stats = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Listings", value: overview.totals.listings, icon: Building2 },
      { label: "Bookings", value: overview.totals.bookings, icon: CalendarCheck },
      { label: "Messages", value: overview.totals.messages, icon: MessageCircle },
      { label: "Payouts", value: overview.totals.payouts, icon: Wallet },
      { label: "Integrations", value: overview.totals.integrations, icon: Plug },
      { label: "Owners", value: overview.totals.owners, icon: Users },
    ];
  }, [overview]);

  const hasActivity = useMemo(() => {
    if (!overview) return false;
    const totals = overview.totals;
    const alerts = overview.alerts;
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
        overview.recentBookings.length
    );
  }, [overview]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
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
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Airbnb Overview</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Monitor global short-term rental performance across all owners.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchOverview();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl h-24 animate-pulse" />
              ))}
            </div>
          ) : overview ? (
            hasActivity ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {stats.map((stat) => (
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
                    {overview.alerts.upcomingBookings.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="surface-card rounded-2xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                    Unread messages
                  </p>
                  <p className="text-xl font-semibold text-foreground mt-2">
                    {overview.alerts.unreadMessages.toLocaleString("en-US")}
                  </p>
                </div>
                <div className="surface-card rounded-2xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                    Pending payouts
                  </p>
                  <p className="text-xl font-semibold text-foreground mt-2">
                    {overview.alerts.pendingPayouts.toLocaleString("en-US")}
                  </p>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="table-shell table-compact"
              >
                <div className="px-4 pt-4">
                  <h2 className="text-sm sm:text-base font-semibold text-foreground">Recent bookings</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Latest reservations synced across all Airbnb owners.
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
                      {overview.recentBookings.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                            No bookings available yet.
                          </td>
                        </tr>
                      ) : (
                        overview.recentBookings.map((booking) => (
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
