"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbReportSummary } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbReportsPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("reports:view");
  const [summary, setSummary] = useState<AirbnbReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/reports?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setSummary(data.summary);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchSummary();
    }
  }, [hasAccess, fetchSummary]);

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Reports & Analytics"
            subtitle="Occupancy, revenue, ADR, RevPAR, and owner statements in KES."
            icon={BarChart3}
            actions={
              <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold">
                <Download size={16} />
                Export CSV
              </button>
            }
          />

          <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {isLoading || !summary ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse" />
              ))
            ) : (
              <>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Occupancy</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{summary.occupancyRate}%</p>
                </div>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Revenue</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.revenue)}</p>
                </div>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">ADR</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.adr)}</p>
                </div>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">RevPAR</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.revpar)}</p>
                </div>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Cancellation rate</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{summary.cancellationRate}%</p>
                </div>
                <div className="surface-card rounded-2xl p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Review score</p>
                  <p className="text-lg font-semibold text-foreground mt-2">{summary.reviewScore} ★</p>
                </div>
              </>
            )}
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Owner statements</h2>
            <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
              <p>• Export PDF statements for each property.</p>
              <p>• Include tax breakdowns and commission splits.</p>
              <p>• Compatible with KRA and KTRA reporting.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
