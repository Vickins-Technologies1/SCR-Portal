"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  DoorClosed,
  DoorOpen,
  MessageCircle,
  TrendingUp,
  BarChart3,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import { useAirbnbAccess } from "./components/useAirbnbAccess";
import type { AirbnbOverview } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbDashboard() {
  const router = useRouter();
  const { hasAccess, ownerId } = useAirbnbAccess("dashboard:view");
  const [overview, setOverview] = useState<AirbnbOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airbnb/overview?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to load overview");
      }
      setOverview(data.overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setIsLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchOverview();
    }
  }, [hasAccess, fetchOverview]);

  const stats = useMemo(() => {
    if (!overview) return [];
    return [
      {
        label: "Today's Check-ins",
        value: overview.stats.todayCheckIns,
        icon: DoorOpen,
        accent: "text-emerald-600",
        bg: "bg-emerald-100/60",
      },
      {
        label: "Today's Check-outs",
        value: overview.stats.todayCheckOuts,
        icon: DoorClosed,
        accent: "text-amber-600",
        bg: "bg-amber-100/70",
      },
      {
        label: "Upcoming Bookings",
        value: overview.stats.upcomingBookings,
        icon: CalendarCheck,
        accent: "text-blue-600",
        bg: "bg-blue-100/70",
      },
      {
        label: "Unread Messages",
        value: overview.stats.unreadMessages,
        icon: MessageCircle,
        accent: "text-purple-600",
        bg: "bg-purple-100/70",
      },
      {
        label: "Monthly Revenue",
        value: formatKes(overview.stats.monthlyRevenue),
        icon: TrendingUp,
        accent: "text-primary",
        bg: "bg-primary/10",
      },
      {
        label: "Occupancy",
        value: `${overview.stats.occupancyRate}%`,
        icon: BarChart3,
        accent: "text-slate-700",
        bg: "bg-slate-100",
      },
      {
        label: "ADR",
        value: formatKes(overview.stats.adr),
        icon: Sparkles,
        accent: "text-indigo-600",
        bg: "bg-indigo-100/70",
      },
      {
        label: "RevPAR",
        value: formatKes(overview.stats.revpar),
        icon: TrendingUp,
        accent: "text-emerald-700",
        bg: "bg-emerald-100/60",
      },
    ];
  }, [overview]);

  if (hasAccess === false) {
    return (
      <div className="min-h-[100svh] bg-background text-foreground">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[70vh] text-center"
          >
            <ShieldCheck className="h-16 w-16 text-amber-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Access Restricted</h2>
            <p className="text-lg text-gray-600 max-w-md mb-8">
              Your team member account does not have permission to view the Airbnb dashboard.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-8 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition"
            >
              Back to Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <Sidebar />

      <div className="relative md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="relative max-w-7xl mx-auto space-y-8">
          <section className="glass-panel rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
            <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[#1e3a8a]/10 blur-2xl" />
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Airbnb Command Center
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-display text-foreground">
                  Short-Term Rental Overview
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                  Track bookings, revenue, and compliance across your Kenyan short-term rentals in one view.
                </p>
                {overview && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                      {overview.stats.upcomingBookings} upcoming stays
                    </span>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                      Occupancy {overview.stats.occupancyRate}%
                    </span>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/70 text-amber-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                      {overview.stats.unreadMessages} unread messages
                    </span>
                  </div>
                )}
              </div>

              {overview && (
                <div className="bg-white/70 border border-white/50 rounded-2xl px-4 py-3 shadow-sm backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Monthly revenue</p>
                  <p className="text-lg sm:text-xl font-semibold text-foreground mt-1">
                    {formatKes(overview.stats.monthlyRevenue)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    ADR {formatKes(overview.stats.adr)} • RevPAR {formatKes(overview.stats.revpar)}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {overview.stats.todayCheckIns} check-ins today
                  </div>
                </div>
              )}
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-50 text-red-800 rounded-xl border border-red-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse">
                  <div className="space-y-3">
                    <div className="h-3.5 bg-gray-200 rounded-lg w-24" />
                    <div className="h-8 bg-gray-300 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">Today at a glance</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {stats.map((stat, index) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="surface-card rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                          {stat.label}
                        </p>
                        <div className={`h-9 w-9 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                          <stat.icon className={`h-4 w-4 ${stat.accent}`} />
                        </div>
                      </div>
                      <p className="text-base sm:text-lg font-semibold text-foreground mt-1">{stat.value}</p>
                    </motion.div>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
                <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm sm:text-base font-semibold text-foreground">Mini calendar</h2>
                    <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Next 7 nights</span>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {overview?.calendarPreview.map((day) => {
                      const date = new Date(day.date);
                      const label = date.toLocaleDateString("en-US", { weekday: "short" });
                      const dateLabel = date.getDate();
                      const statusStyles =
                        day.status === "booked"
                          ? "bg-primary/15 text-primary"
                          : day.status === "blocked"
                            ? "bg-amber-100/70 text-amber-700"
                            : "bg-emerald-100/60 text-emerald-700";
                      return (
                        <div
                          key={day.date}
                          className={`rounded-2xl px-3 py-3 text-center text-[11px] font-semibold ${statusStyles}`}
                        >
                          <p className="uppercase tracking-[0.2em] text-[9px] text-muted-foreground">{label}</p>
                          <p className="text-base text-foreground mt-1">{dateLabel}</p>
                          <p className="text-[10px] mt-1">
                            {day.status === "available" ? formatKes(day.rate) : day.status}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="surface-card rounded-3xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm sm:text-base font-semibold text-foreground">Recent activity</h2>
                    <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Live feed</span>
                  </div>
                  <div className="space-y-3">
                    {overview?.recentActivity.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border bg-white/70 px-4 py-3"
                      >
                        <p className="text-xs font-semibold text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{item.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {new Date(item.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-foreground">Compliance status</h2>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      KTRA, county permits, NEMA, and tax obligations by property.
                    </p>
                  </div>
                  <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Kenya ready</span>
                </div>
                <div className="table-shell table-compact">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>KTRA</th>
                          <th>County Permit</th>
                          <th>NEMA</th>
                          <th>Status</th>
                          <th>Next Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview?.compliance.map((item) => (
                          <tr key={item.propertyId}>
                            <td className="font-semibold">{item.propertyName}</td>
                            <td>{new Date(item.ktraExpiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                            <td>{new Date(item.countyPermitExpiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                            <td>{new Date(item.nemaExpiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                            <td>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                  item.status === "compliant"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : item.status === "due"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="text-muted-foreground">{item.nextAction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
