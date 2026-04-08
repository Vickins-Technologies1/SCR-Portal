"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, RefreshCw, X, Copy } from "lucide-react";
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
  const [settings, setSettings] = useState({
    minNights: 2,
    maxNights: 21,
    advanceNotice: 1,
    prepTime: 1,
  });
  const [icalSettings, setIcalSettings] = useState({
    icalToken: "",
    icalImportUrl: "",
  });
  const [baseUrl, setBaseUrl] = useState("");
  const [icalMessage, setIcalMessage] = useState<string | null>(null);
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

  const fetchCalendar = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/calendar?ownerId=${ownerId}`, { credentials: "include" });
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
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchCalendar();
    }
  }, [hasAccess, fetchCalendar]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!ownerId || !hasAccess) return;
    const fetchSettings = async () => {
      const res = await fetch(`/api/airbnb/settings?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setIcalSettings({
          icalToken: data.settings?.icalToken || "",
          icalImportUrl: data.settings?.icalImportUrl || "",
        });
      }
    };
    fetchSettings();
  }, [ownerId, hasAccess]);

  const icalExportUrl = useMemo(() => {
    if (!baseUrl || !icalSettings.icalToken) return "";
    return `${baseUrl}/api/airbnb/calendar/ical?token=${icalSettings.icalToken}`;
  }, [baseUrl, icalSettings.icalToken]);

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
    if (data.success) {
      await fetchCalendar();
    }
  };

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

  const handleSaveIcal = async () => {
    if (!csrfToken) {
      setIcalMessage("Missing session token. Refresh and retry.");
      return;
    }
    try {
      const res = await fetch("/api/airbnb/calendar/ical", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ icalUrl: icalSettings.icalImportUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save iCal link");
      }
      setIcalMessage("iCal import URL saved.");
    } catch (err) {
      setIcalMessage(err instanceof Error ? err.message : "Failed to save iCal link");
    }
  };

  const handleCopyIcal = async () => {
    if (!icalExportUrl) return;
    try {
      await navigator.clipboard.writeText(icalExportUrl);
      setIcalMessage("iCal export link copied.");
      setTimeout(() => setIcalMessage(null), 2000);
    } catch {
      setIcalMessage("Copy failed. Select the link and copy manually.");
    }
  };

  const handleSaveNight = async () => {
    if (!csrfToken || !selectedNight) return;
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
      setSyncMessage(err instanceof Error ? err.message : "Failed to update night");
    } finally {
      setIsSavingNight(false);
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

          <section className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground">iCal sync</h2>
                <p className="text-[11px] text-muted-foreground">
                  Export availability and import external calendars without impacting long-term leases.
                </p>
              </div>
              <button
                onClick={handleCopyIcal}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <Copy size={14} />
                Copy export
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                  Export link
                </label>
                <input
                  value={icalExportUrl}
                  readOnly
                  className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                  Import link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={icalSettings.icalImportUrl}
                    onChange={(event) =>
                      setIcalSettings((prev) => ({ ...prev, icalImportUrl: event.target.value }))
                    }
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-xs"
                    placeholder="https://calendar.google.com/calendar/ical/..."
                  />
                  <button
                    onClick={handleSaveIcal}
                    className="rounded-xl bg-primary px-3 py-2 text-[11px] font-semibold text-white hover:bg-primary-hover"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
            {icalMessage && (
              <p className="text-[11px] text-muted-foreground">{icalMessage}</p>
            )}
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
            ) : calendarRows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground">
                No calendar data yet. Add a listing to start managing availability.
              </div>
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
                            onClick={() =>
                              setSelectedNight({
                                listingId: row.propertyId,
                                listingName: row.propertyName,
                                date: night.date,
                                status: night.status,
                                rate: night.rate,
                                note: night.note,
                              })
                            }
                            className={`rounded-xl px-2 py-2 text-center text-[10px] font-semibold cursor-pointer transition hover:scale-[1.02] ${statusClass}`}
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

          {selectedNight && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-md overflow-hidden">
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
                <div className="modal-body modal-stagger space-y-4">
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
        </main>
      </div>
    </div>
  );
}
