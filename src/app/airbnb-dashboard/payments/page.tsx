"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbPayout } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";
import { useAccountTier } from "@/hooks/useAccountTier";

export default function AirbnbPaymentsPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("payments:view");
  const { isFree } = useAccountTier();
  const [payouts, setPayouts] = useState<AirbnbPayout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [taxes, setTaxes] = useState<{ tourismLevy: number; vat: number; dst: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();

  const nextStatementDate = (() => {
    const today = new Date();
    const next = new Date(today);
    next.setDate(5);
    if (today.getDate() >= 5) {
      next.setMonth(today.getMonth() + 1);
    }
    return next.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  })();

  const fetchPayouts = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/payments?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setPayouts(data.payouts || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchPayouts();
    }
  }, [hasAccess, fetchPayouts]);

  useEffect(() => {
    if (!ownerId || !hasAccess) return;
    const fetchTaxes = async () => {
      const res = await fetch(`/api/airbnb/reports?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setTaxes({
          tourismLevy: data.taxes?.tourismLevy || 0,
          vat: data.taxes?.vat || 0,
          dst: data.taxes?.dst || 0,
        });
      }
    };
    fetchTaxes();
  }, [ownerId, hasAccess]);

  const handleExportStatement = async () => {
    if (!ownerId) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch(`/api/airbnb/payments/statement?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to generate statement.");
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
      link.download = data.filename || "airbnb-owner-statement.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage("Owner statement downloaded.");
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to export statement.");
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
            title="Payments & Payouts"
            subtitle="Track Airbnb payouts, direct M-Pesa collections, and trust accounting."
            icon={CreditCard}
          />

          {isFree && (
            <section className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Free Tier Notice</p>
                  <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                    Upgrade to unlock automated payment workflows
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                    Premium enables integrations, automation, and deeper operational controls.
                  </p>
                </div>
                <a
                  href="/upgrade"
                  className="shrink-0 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
                >
                  Upgrade
                </a>
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">M-Pesa status</h2>
              <p className="text-[11px] text-muted-foreground">Primary payment rail for Kenyan guests.</p>
              <div className="mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                M-Pesa connection status not available yet.
              </div>
              <button
                onClick={() => router.push("/airbnb-dashboard/settings")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
              >
                Manage M-Pesa settings
              </button>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">Tax auto-calculation</h2>
              <p className="text-[11px] text-muted-foreground">Tourism Levy 2%, VAT, and DST prepared.</p>
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Tourism Levy (2%)</span>
                  <span className="font-semibold text-foreground">
                    {taxes ? formatKes(taxes.tourismLevy) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>VAT estimate</span>
                  <span className="font-semibold text-foreground">
                    {taxes ? formatKes(taxes.vat) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>DST (1.5%)</span>
                  <span className="font-semibold text-foreground">
                    {taxes ? formatKes(taxes.dst) : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">Owner statement</h2>
              <p className="text-[11px] text-muted-foreground">Auto-generated monthly statements in KES.</p>
              <div className="mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                Next statement scheduled: {nextStatementDate}
              </div>
              <button
                onClick={handleExportStatement}
                disabled={isExporting}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
              >
                {isExporting ? "Generating..." : "Export PDF"}
              </button>
            </div>
          </section>

          {exportMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              {exportMessage}
            </div>
          )}

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Payout schedule</h2>
            </div>
            <div className="table-shell table-compact">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-6">
                        Loading payouts...
                      </td>
                    </tr>
                  ) : payouts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-6">
                        No payouts yet.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((payout) => (
                      <tr key={payout.id}>
                          <td className="font-semibold">{payout.propertyName}</td>
                          <td className="table-muted">{payout.period}</td>
                          <td>{formatKes(payout.amount)}</td>
                          <td>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                              payout.status === "paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : payout.status === "processing"
                                  ? "bg-blue-100 text-blue-700"
                                  : payout.status === "failed"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {payout.status}
                          </span>
                          </td>
                          <td>{payout.method}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
