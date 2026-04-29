"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbCalendarRow } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

function formatMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toSafeDateKey(date: Date) {
  const safe = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  return safe.toISOString().slice(0, 10);
}

export default function AirbnbCalendarPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("properties:view");
  const [calendarRows, setCalendarRows] = useState<AirbnbCalendarRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [settings, setSettings] = useState({
    minNights: 2,
    maxNights: 21,
    advanceNotice: 1,
    prepTime: 1,
  });
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [selectedNight, setSelectedNight] = useState<{
    listingId: string;
    listingName: string;
    date: string;
    status: "available" | "booked" | "blocked";
    rate: number;
    note?: string;
  } | null>(null);
  const [isSavingNight, setIsSavingNight] = useState(false);
  const [isBulkPricingOpen, setIsBulkPricingOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"monthly" | "weekly">("monthly");
  const [bulkRate, setBulkRate] = useState<number>(0);
  const [bulkNote, setBulkNote] = useState<string>("");
  const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // Monday=0
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const fetchCalendar = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const month = formatMonthKey(activeMonth);
    const res = await fetch(`/api/airbnb/calendar?ownerId=${ownerId}&month=${month}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setCalendarRows(data.calendar || []);
      if (data.settings) {
        setSettings({
          minNights: data.settings.minNights ?? 2,
          maxNights: data.settings.maxNights ?? 21,
          advanceNotice: data.settings.advanceNotice ?? 1,
          prepTime: data.settings.prepTime ?? 1,
        });
      }
    }
    setIsLoading(false);
  }, [ownerId, activeMonth]);

  useEffect(() => {
    if (hasAccess) {
      fetchCalendar();
    }
  }, [hasAccess, fetchCalendar]);

  useEffect(() => {
    if (!calendarRows.length) return;
    if (selectedListingId && calendarRows.some((row) => row.propertyId === selectedListingId)) return;
    setSelectedListingId(calendarRows[0].propertyId);
  }, [calendarRows, selectedListingId]);

  const selectedRow = useMemo(() => {
    if (!calendarRows.length) return null;
    return calendarRows.find((row) => row.propertyId === selectedListingId) || calendarRows[0];
  }, [calendarRows, selectedListingId]);

  const nightsByDateKey = useMemo(() => {
    const map = new Map<
      string,
      { date: string; status: "available" | "booked" | "blocked"; rate: number; note?: string }
    >();
    if (!selectedRow) return map;
    for (const night of selectedRow.nights) {
      const key = String(night.date || "").slice(0, 10);
      if (!key) continue;
      map.set(key, { date: night.date, status: night.status, rate: night.rate, note: night.note });
    }
    return map;
  }, [selectedRow]);

  const monthLabel = useMemo(() => {
    return activeMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [activeMonth]);

  const calendarGridDays = useMemo(() => {
    const firstOfMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday=0
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - startOffset);
    return Array.from({ length: 42 }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [activeMonth]);

  const handleSettingsSave = async () => {
    if (!csrfToken) {
      setSettingsMessage("Missing session token. Refresh and retry.");
      return;
    }
    try {
      const res = await fetch("/api/airbnb/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ type: "settings", ...settings }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save rules");
      }
      setSettingsMessage("Rules updated.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "Failed to save rules");
    }
  };

  const handleSaveNight = async () => {
    if (!csrfToken || !selectedNight) return;
    setNoticeMessage(null);
    setIsSavingNight(true);
    try {
      const res = await fetch("/api/airbnb/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          type: "night",
          listingId: selectedNight.listingId,
          listingName: selectedNight.listingName,
          date: selectedNight.date,
          status: selectedNight.status,
          rate: selectedNight.rate,
          note: selectedNight.note,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update night");
      }
      setSelectedNight(null);
      await fetchCalendar();
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "Failed to update night");
    } finally {
      setIsSavingNight(false);
    }
  };

  const handleSaveBulkPricing = async () => {
    if (!csrfToken || !selectedRow) return;
    setNoticeMessage(null);
    setIsSavingBulk(true);

    try {
      const dates = calendarGridDays
        .filter((day) => day.getMonth() === activeMonth.getMonth())
        .filter((day) => {
          const dateKey = toSafeDateKey(day);
          const existing = nightsByDateKey.get(dateKey);
          if (existing && existing.status !== "available") return false;
          if (bulkMode === "weekly") {
            const weekday = (day.getDay() + 6) % 7; // Monday=0
            return bulkWeekdays.includes(weekday);
          }
          return true;
        })
        .map((day) => toSafeDateKey(day));

      if (!dates.length) {
        setNoticeMessage("No available days matched your selection.");
        return;
      }

      const res = await fetch("/api/airbnb/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          type: "bulk_price",
          listingId: selectedRow.propertyId,
          listingName: selectedRow.propertyName,
          dates,
          rate: bulkRate,
          note: bulkNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update prices");
      }

      setIsBulkPricingOpen(false);
      await fetchCalendar();
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "Failed to update prices");
    } finally {
      setIsSavingBulk(false);
    }
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
            subtitle="Manage nightly availability and pricing rules."
            icon={Calendar}
          />

          {noticeMessage && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
              {noticeMessage}
            </div>
          )}

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Min nights</p>
                <input
                  type="number"
                  value={settings.minNights}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, minNights: Number(event.target.value) }))
                  }
                  onBlur={handleSettingsSave}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Max nights</p>
                <input
                  type="number"
                  value={settings.maxNights}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, maxNights: Number(event.target.value) }))
                  }
                  onBlur={handleSettingsSave}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Advance notice</p>
                <input
                  type="number"
                  value={settings.advanceNotice}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, advanceNotice: Number(event.target.value) }))
                  }
                  onBlur={handleSettingsSave}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Prep time (days)</p>
                <input
                  type="number"
                  value={settings.prepTime}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, prepTime: Number(event.target.value) }))
                  }
                  onBlur={handleSettingsSave}
                  className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {settingsMessage && (
              <p className="mt-3 text-xs text-muted-foreground">{settingsMessage}</p>
            )}
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground">Calendar view</h2>
                <p className="text-[11px] text-muted-foreground">
                  Select a listing, then click a day to update pricing or block dates.
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
            ) : calendarRows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground">
                No calendar data yet. Add a listing to start managing availability.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={selectedListingId}
                      onChange={(event) => setSelectedListingId(event.target.value)}
                      className="w-full sm:w-[320px] rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    >
                      {calendarRows.map((row) => (
                        <option key={row.propertyId} value={row.propertyId}>
                          {row.propertyName}
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-white/70 p-1">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="px-3 text-sm font-semibold text-foreground whitespace-nowrap">{monthLabel}</div>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        aria-label="Next month"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setIsBulkPricingOpen(true)}
                      className="rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[11px] font-semibold text-primary hover:bg-primary/10"
                    >
                      Price change
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setActiveMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                      }}
                      className="rounded-full border border-border bg-white/70 px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    >
                      This month
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-white/60 overflow-hidden">
                  <div className="grid grid-cols-7 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.25em]">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                      <div key={label} className="px-3 py-2 text-center">
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-border">
                    {calendarGridDays.map((day) => {
                      const inMonth = day.getMonth() === activeMonth.getMonth();
                      const dateKey = toSafeDateKey(day);
                      const night = inMonth ? nightsByDateKey.get(dateKey) : undefined;
                      const status = night?.status ?? "available";
                      const statusClass =
                        status === "booked"
                          ? "bg-primary/10 text-primary ring-1 ring-primary/10"
                          : status === "blocked"
                            ? "bg-amber-50/70 text-amber-700 ring-1 ring-amber-200/40"
                            : "bg-emerald-50/70 text-emerald-700 ring-1 ring-emerald-200/40";

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          disabled={!inMonth || !selectedRow}
                          onClick={() => {
                            if (!selectedRow || !inMonth) return;
                            const existing = nightsByDateKey.get(dateKey);
                            setSelectedNight({
                              listingId: selectedRow.propertyId,
                              listingName: selectedRow.propertyName,
                              date:
                                existing?.date ||
                                new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0).toISOString(),
                              status: existing?.status ?? "available",
                              rate: existing?.rate ?? 0,
                              note: existing?.note,
                            });
                          }}
                          className={`group relative min-h-[92px] bg-background px-3 py-2 text-left transition hover:bg-muted/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className={`text-xs font-semibold ${inMonth ? "text-foreground" : "text-muted-foreground"}`}
                            >
                              {day.getDate()}
                            </div>
                            {inMonth ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                                {status === "available" ? "Open" : status}
                              </span>
                            ) : null}
                          </div>
                          {inMonth ? (
                            <div className="mt-2 space-y-1">
                              <div className="text-[11px] font-semibold text-foreground">
                                {status === "available" ? formatKes(night?.rate ?? 0) : "—"}
                              </div>
                              <div className="text-[10px] text-muted-foreground line-clamp-2">
                                {night?.note || "Click to update"}
                              </div>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {selectedNight && (
            <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
              <div className="modal-panel flex w-full max-w-md flex-col overflow-hidden max-h-[calc(100dvh-2rem)] min-h-0">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Update night</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedNight.listingName} • {new Date(selectedNight.date).toLocaleDateString("en-KE")}
                    </p>
                  </div>
                  <button onClick={() => setSelectedNight(null)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger flex-1 min-h-0 space-y-4 overflow-y-auto">
                  <select
                    value={selectedNight.status}
                    onChange={(event) =>
                      setSelectedNight((prev) =>
                        prev ? { ...prev, status: event.target.value as typeof prev.status } : prev
                      )
                    }
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  >
                    <option value="available">Available</option>
                    <option value="blocked">Blocked</option>
                    <option value="booked">Booked</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={selectedNight.rate}
                    onChange={(event) =>
                      setSelectedNight((prev) =>
                        prev ? { ...prev, rate: Number(event.target.value) } : prev
                      )
                    }
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Rate"
                  />
                  <input
                    value={selectedNight.note || ""}
                    onChange={(event) =>
                      setSelectedNight((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                    }
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Note (optional)"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setSelectedNight(null)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNight}
                      disabled={isSavingNight}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSavingNight ? "Saving..." : "Save night"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isBulkPricingOpen && selectedRow && (
            <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
              <div className="modal-panel flex w-full max-w-lg flex-col overflow-hidden max-h-[calc(100dvh-2rem)] min-h-0">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Price change</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedRow.propertyName} • {monthLabel}
                    </p>
                  </div>
                  <button onClick={() => setIsBulkPricingOpen(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>

                <div className="modal-body modal-stagger flex-1 min-h-0 space-y-4 overflow-y-auto">
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-semibold">Mode</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkMode("monthly")}
                        className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                          bulkMode === "monthly"
                            ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                            : "border-border bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">Monthly</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Apply one rate to all open nights this month.</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMode("weekly")}
                        className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                          bulkMode === "weekly"
                            ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                            : "border-border bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">Weekly</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Set a rate for selected weekdays in this month.</p>
                      </button>
                    </div>
                  </div>

                  {bulkMode === "weekly" ? (
                    <div className="rounded-2xl border border-border bg-white/70 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-semibold">
                        Weekdays
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
                          const active = bulkWeekdays.includes(index);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() =>
                                setBulkWeekdays((prev) =>
                                  active ? prev.filter((v) => v !== index) : [...prev, index].sort((a, b) => a - b)
                                )
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border bg-white/70 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Only updates open nights (does not touch booked / blocked days).
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Only updates open nights (does not touch booked / blocked days).
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">New rate</p>
                      <input
                        type="number"
                        min={0}
                        value={bulkRate}
                        onChange={(event) => setBulkRate(Number(event.target.value))}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Rate"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Note (optional)</p>
                      <input
                        value={bulkNote}
                        onChange={(event) => setBulkNote(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="e.g., Peak season"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsBulkPricingOpen(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBulkPricing}
                      disabled={isSavingBulk}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSavingBulk ? "Saving..." : "Apply price change"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
