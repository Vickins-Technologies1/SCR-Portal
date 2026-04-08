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
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportCsv = () => {
    if (!summary) {
      setExportMessage("No report data available yet.");
      return;
    }

    const rows = [
      ["Metric", "Value"],
      ["Occupancy Rate (%)", summary.occupancyRate.toString()],
      ["Revenue (KES)", summary.revenue.toString()],
      ["ADR (KES)", summary.adr.toString()],
      ["RevPAR (KES)", summary.revpar.toString()],
      ["Cancellation Rate (%)", summary.cancellationRate.toString()],
      ["Review Score", summary.reviewScore.toString()],
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `airbnb-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage("Report exported.");
  };

  const handleExportPdf = async () => {
    if (!ownerId) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch(`/api/airbnb/reports/pdf?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to export PDF");
      }
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename || "airbnb-tax-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage("PDF report downloaded.");
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to export PDF.");
    } finally {
      setIsExporting(false);
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
            title="Reports & Analytics"
            subtitle="Occupancy, revenue, ADR, RevPAR, and owner statements in KES."
            icon={BarChart3}
            actions={
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold"
                >
                  <Download size={16} />
                  Export CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover shadow-sm transition-all text-xs sm:text-sm font-semibold disabled:opacity-60"
                >
                  <Download size={16} />
                  {isExporting ? "Generating..." : "Export PDF"}
                </button>
              </div>
            }
          />

          {exportMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              {exportMessage}
            </div>
          )}

          <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse" />
              ))
            ) : !summary ? (
              <div className="surface-card rounded-2xl p-4 sm:p-5 text-xs text-muted-foreground col-span-full">
                No report data available yet.
              </div>
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
