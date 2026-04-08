"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, TrendingUp, CalendarClock, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbPricingRule } from "@/types/airbnb";

export default function AirbnbPricingPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("reports:view");
  const [rules, setRules] = useState<AirbnbPricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({
    demandBased: true,
    competitorAware: true,
    lastMinuteDiscount: false,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions] = useState<string[]>([]);

  const fetchRules = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/pricing?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setRules(data.rules || []);
      if (data.settings) {
        setSettings({
          demandBased: data.settings.demandBased ?? true,
          competitorAware: data.settings.competitorAware ?? true,
          lastMinuteDiscount: data.settings.lastMinuteDiscount ?? false,
        });
      }
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchRules();
    }
  }, [hasAccess, fetchRules]);

  const updateSettings = async (nextSettings: typeof settings) => {
    if (!csrfToken) return;
    try {
      await fetch("/api/airbnb/pricing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ action: "updateSettings", settings: nextSettings }),
      });
    } catch {
      // ignore
    }
  };

  const handleApplySmartRates = async () => {
    if (!csrfToken) {
      setMessage("Missing session token. Refresh and try again.");
      return;
    }
    setIsApplying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/airbnb/pricing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ action: "applySmartRates" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to apply smart rates");
      }
      setMessage(data.message || "Smart rates applied.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to apply smart rates");
    } finally {
      setIsApplying(false);
    }
  };

  const handleToggleRule = async (ruleId: string, active: boolean) => {
    if (!csrfToken) {
      setMessage("Missing session token. Refresh and try again.");
      return;
    }
    try {
      const res = await fetch("/api/airbnb/pricing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ action: "toggleRule", ruleId, active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update rule");
      }
      setRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, active } : rule)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update rule");
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
            title="Pricing & Revenue"
            subtitle="Dynamic pricing rules, seasonal adjustments, and demand-based recommendations."
            icon={Sparkles}
            actions={
              <button
                onClick={handleApplySmartRates}
                disabled={isApplying}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold disabled:opacity-60"
              >
                <TrendingUp size={16} />
                {isApplying ? "Applying..." : "Apply smart rates"}
              </button>
            }
          />

          {message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              {message}
            </div>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Dynamic pricing engine</h2>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Demand-based adjustments</p>
                  <p className="text-[11px] text-muted-foreground">Boost rates when occupancy rises above 80%.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.demandBased}
                  onChange={(event) => {
                    const next = { ...settings, demandBased: event.target.checked };
                    setSettings(next);
                    updateSettings(next);
                  }}
                  className="h-5 w-5 accent-primary"
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Competitor awareness</p>
                  <p className="text-[11px] text-muted-foreground">Monitor similar listings in Nairobi & Mombasa.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.competitorAware}
                  onChange={(event) => {
                    const next = { ...settings, competitorAware: event.target.checked };
                    setSettings(next);
                    updateSettings(next);
                  }}
                  className="h-5 w-5 accent-primary"
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Last-minute discounts</p>
                  <p className="text-[11px] text-muted-foreground">Apply auto discounts 3 days before check-in.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lastMinuteDiscount}
                  onChange={(event) => {
                    const next = { ...settings, lastMinuteDiscount: event.target.checked };
                    setSettings(next);
                    updateSettings(next);
                  }}
                  className="h-5 w-5 accent-primary"
                />
              </div>
            </div>

            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Smart pricing calendar</h2>
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Upcoming demand signals</p>
                {suggestions.length === 0 ? (
                  <p>No demand signals available yet.</p>
                ) : (
                  suggestions.map((signal) => <p key={signal}>• {signal}</p>)
                )}
              </div>
              <button
                onClick={() => setShowSuggestions(true)}
                disabled={suggestions.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                <CalendarClock size={14} />
                Review rate suggestions
              </button>
            </div>
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Pricing rules</h2>
            <div className="space-y-3">
              {isLoading ? (
                <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              ) : (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-2xl border border-border bg-white/70 px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{rule.name}</p>
                      <p className="text-[11px] text-muted-foreground">{rule.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-foreground">{rule.adjustment}</p>
                      <span
                        className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          rule.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {rule.active ? "Active" : "Paused"}
                      </span>
                      <div className="mt-2">
                        <button
                          onClick={() => handleToggleRule(rule.id, !rule.active)}
                          className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          {rule.active ? "Pause" : "Activate"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {showSuggestions && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-lg overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Rate suggestions</h2>
                    <p className="text-[11px] text-muted-foreground">Apply the latest demand signals.</p>
                  </div>
                  <button onClick={() => setShowSuggestions(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-3 text-xs text-muted-foreground">
                  {suggestions.length === 0 ? (
                    <p>No rate suggestions available yet.</p>
                  ) : (
                    suggestions.map((signal) => <p key={signal}>• {signal}</p>)
                  )}
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={() => setShowSuggestions(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                    <button
                      onClick={async () => {
                        await handleApplySmartRates();
                        setShowSuggestions(false);
                      }}
                      disabled={suggestions.length === 0}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      Apply suggestions
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
