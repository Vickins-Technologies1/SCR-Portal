"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbPayout } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbPaymentsPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("payments:view");
  const [payouts, setPayouts] = useState<AirbnbPayout[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">M-Pesa status</h2>
              <p className="text-[11px] text-muted-foreground">Primary payment rail for Kenyan guests.</p>
              <div className="mt-4 rounded-2xl bg-emerald-100/70 px-4 py-3 text-xs font-semibold text-emerald-700">
                Connected • Daraja API live
              </div>
              <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Manage M-Pesa settings
              </button>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">Tax auto-calculation</h2>
              <p className="text-[11px] text-muted-foreground">Tourism Levy 2%, VAT, and DST prepared.</p>
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Tourism Levy (2%)</span>
                  <span className="font-semibold text-foreground">KES 18,560</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>VAT estimate</span>
                  <span className="font-semibold text-foreground">KES 42,900</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>DST (1.5%)</span>
                  <span className="font-semibold text-foreground">KES 13,920</span>
                </div>
              </div>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-2">Owner statement</h2>
              <p className="text-[11px] text-muted-foreground">Auto-generated monthly statements in KES.</p>
              <div className="mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                Next statement scheduled: 5 May, 2026
              </div>
              <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Export PDF
              </button>
            </div>
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Payout schedule</h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary">
                <ShieldCheck size={12} />
                Trust accounting enabled
              </span>
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
