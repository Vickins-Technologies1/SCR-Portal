"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, RefreshCw } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbCalendarRow } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbCalendarPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("properties:view");
  const [calendarRows, setCalendarRows] = useState<AirbnbCalendarRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/calendar?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setCalendarRows(data.calendar || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchCalendar();
    }
  }, [hasAccess, fetchCalendar]);

  const days = useMemo(() => {
    if (!calendarRows.length) return [];
    return calendarRows[0].nights.map((night) => new Date(night.date));
  }, [calendarRows]);

  const handleSync = async () => {
    if (!csrfToken) {
      setSyncMessage("Missing session token. Refresh and retry.");
      return;
    }
    const res = await fetch("/api/airbnb/sync", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
      credentials: "include",
    });
    const data = await res.json();
    setSyncMessage(data.message || "Sync completed.");
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Calendar & Availability"
            subtitle="Manage nightly availability, pricing rules, and two-way Airbnb sync."
            icon={Calendar}
            actions={
              <button
                onClick={handleSync}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold"
              >
                <RefreshCw size={16} />
                Sync now
              </button>
            }
          />

          {syncMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              {syncMessage}
            </div>
          )}

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Min nights</p>
                <input
                  type="number"
                  defaultValue={2}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Max nights</p>
                <input
                  type="number"
                  defaultValue={21}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Advance notice</p>
                <input
                  type="number"
                  defaultValue={1}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Prep time (days)</p>
                <input
                  type="number"
                  defaultValue={1}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground">Night-by-night view</h2>
                <p className="text-[11px] text-muted-foreground">
                  Click a night to block dates or adjust pricing.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Available
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Booked
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Blocked
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
            ) : (
              <div className="overflow-x-auto">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `220px repeat(${days.length || 14}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em] px-2 py-2">
                    Property
                  </div>
                  {days.map((day) => (
                    <div
                      key={day.toISOString()}
                      className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em] text-center"
                    >
                      {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                    </div>
                  ))}

                  {calendarRows.map((row) => (
                    <div key={row.propertyId} className="contents">
                      <div className="rounded-2xl border border-border bg-white/80 px-3 py-3 text-xs font-semibold text-foreground">
                        {row.propertyName}
                      </div>
                      {row.nights.map((night) => {
                        const statusClass =
                          night.status === "booked"
                            ? "bg-primary/15 text-primary"
                            : night.status === "blocked"
                              ? "bg-amber-100/70 text-amber-700"
                              : "bg-emerald-100/70 text-emerald-700";
                        return (
                          <div
                            key={`${row.propertyId}-${night.date}`}
                            className={`rounded-xl px-2 py-2 text-center text-[10px] font-semibold ${statusClass}`}
                          >
                            {night.status === "available" ? formatKes(night.rate) : night.status}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
