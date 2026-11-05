"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Health = {
  generatedToday: number;
  pendingDrafts: number;
  issued: number;
  partiallyPaid: number;
  overdue: number;
  paid: number;
  failedDeliveries: number;
  failedAutomaticGenerations: number;
  recentFailures: Array<{ tenantName: string; propertyName: string; period: string; error: string; updatedAt: string }>;
};

const cards: Array<[keyof Omit<Health, "recentFailures">, string]> = [
  ["generatedToday", "Generated today"], ["pendingDrafts", "Pending drafts"], ["issued", "Unpaid invoices"],
  ["partiallyPaid", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"],
  ["failedDeliveries", "Failed deliveries today"], ["failedAutomaticGenerations", "Failed generations"],
];

export default function AdminTenantInvoicesPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/tenant-invoices/health", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load tenant invoice health");
      setHealth(data.health);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load tenant invoice health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing operations</p><h1 className="mt-1 text-2xl font-semibold">Tenant invoice health</h1><p className="mt-1 text-sm text-muted-foreground">Generation, balances, and delivery failures across all properties.</p></div>
      <div className="flex gap-2"><Link href="/admin/payments/reconciliation" className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Review reconciliation</Link><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>Refresh</button></div>
    </header>
    {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle size={17}/>{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([key, label]) => <div key={key} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{loading ? "—" : Number(health?.[key] || 0).toLocaleString("en-KE")}</p></div>)}
    </section>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Automatic generation failures</h2><p className="mt-1 text-sm text-muted-foreground">Actionable errors recorded by the scheduled invoice job.</p></div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : !health?.recentFailures.length ? <p className="p-6 text-sm text-muted-foreground">No unresolved generation failures.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Tenant", "Property", "Period", "Reason", "Last attempt"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{health.recentFailures.map((failure, index) => <tr key={`${failure.tenantName}-${failure.period}-${index}`} className="border-t border-border"><td className="px-4 py-3">{failure.tenantName}</td><td className="px-4 py-3">{failure.propertyName}</td><td className="px-4 py-3">{failure.period || "—"}</td><td className="max-w-lg px-4 py-3 text-destructive">{failure.error}</td><td className="px-4 py-3">{new Date(failure.updatedAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
