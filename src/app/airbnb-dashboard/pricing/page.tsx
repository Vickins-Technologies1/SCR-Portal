"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, TrendingUp, CalendarClock } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbPricingRule } from "@/types/airbnb";

export default function AirbnbPricingPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("reports:view");
  const [rules, setRules] = useState<AirbnbPricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/pricing?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setRules(data.rules || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchRules();
    }
  }, [hasAccess, fetchRules]);

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
              <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold">
                <TrendingUp size={16} />
                Apply smart rates
              </button>
            }
          />

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Dynamic pricing engine</h2>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Demand-based adjustments</p>
                  <p className="text-[11px] text-muted-foreground">Boost rates when occupancy rises above 80%.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-5 w-5 accent-primary" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Competitor awareness</p>
                  <p className="text-[11px] text-muted-foreground">Monitor similar listings in Nairobi & Mombasa.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-5 w-5 accent-primary" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Last-minute discounts</p>
                  <p className="text-[11px] text-muted-foreground">Apply auto discounts 3 days before check-in.</p>
                </div>
                <input type="checkbox" className="h-5 w-5 accent-primary" />
              </div>
            </div>

            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Smart pricing calendar</h2>
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Upcoming demand signals</p>
                <p>• Easter holiday uplift: +22%</p>
                <p>• Mombasa Jazz Festival: +18% (Apr 22-24)</p>
                <p>• Nairobi summit week: +15%</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
