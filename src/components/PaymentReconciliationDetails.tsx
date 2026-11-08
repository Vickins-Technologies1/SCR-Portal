"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";

type DetailRecord = {
  reconciliationId: string;
  tenantId: string;
  tenantName?: string;
  propertyName?: string;
  unit?: string;
  status: string;
  actorId?: string;
  actorRole?: string;
  executedAt?: string;
  createdAt?: string;
  before?: Record<string, number>;
  after?: Record<string, number>;
  proposals?: Array<{
    paymentId: string;
    reference: string | null;
    date: string | null;
    amount: number;
    previousAllocation: Record<string, number> | null;
    proposedAllocation: Record<string, number>;
    walletDebitToPost: number;
    walletAllocation: Record<string, number>;
  }>;
  paymentReferences?: string[];
  issues?: string[];
  failureReason?: string;
  allocationPolicyVersion?: string;
};

const money = (value: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());

export default function PaymentReconciliationDetails({ reconciliationId, backHref }: { reconciliationId: string; backHref: string }) {
  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/payment-reconciliation?reconciliationId=${encodeURIComponent(reconciliationId)}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Reconciliation record not found.");
        if (!cancelled) setRecord(data.reconciliation);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load reconciliation record."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reconciliationId]);

  return <main className="mx-auto max-w-[1100px] space-y-6 py-5">
    <Link href={backHref} className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"><ArrowLeft size={15} /> Back to payment reconciliation</Link>
    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-20 text-sm text-muted-foreground"><LoaderCircle size={18} className="animate-spin" /> Loading audit record…</div> : error || !record ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error || "Reconciliation record not found."}</div> : <>
      <header className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Financial audit trail</p><h1 className="mt-1 text-2xl font-bold">Reconciliation details</h1><p className="mt-2 text-sm text-muted-foreground">{record.tenantName || record.tenantId} · {record.propertyName || "Property"} · {record.unit || "Unit not recorded"}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${record.status === "succeeded" ? "bg-emerald-50 text-emerald-700" : record.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{label(record.status)}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Previous wallet", money(record.before?.walletBalance || 0)],
            ["New wallet", money(record.after?.walletBalance || 0)],
            ["Executed", dateLabel(record.executedAt || record.createdAt)],
            ["Executed by", record.actorRole || "—"],
          ].map(([title, value]) => <div key={title} className="rounded-xl bg-muted/35 p-3"><span className="text-[10px] text-muted-foreground">{title}</span><strong className="mt-1 block text-sm">{value}</strong></div>)}
        </div>
        <p className="mt-4 break-all font-mono text-[10px] text-muted-foreground">Reconciliation ID: {record.reconciliationId}</p>
        {record.failureReason && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Failure: {record.failureReason}</p>}
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-2"><CheckCircle2 className="text-primary" size={18} /><h2 className="font-semibold">Allocation breakdown</h2></div>
        {!record.proposals?.length ? <p className="mt-4 text-sm text-muted-foreground">This operation verified the current balances and did not propose payment allocation changes.</p> : <div className="mt-4 space-y-3">
          {record.proposals.map((proposal) => <article key={proposal.paymentId} className="rounded-xl border border-border/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{proposal.reference || `Payment ${proposal.paymentId.slice(-8)}`}</h3><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(proposal.date)} · Payment ID {proposal.paymentId}</p></div><strong className="text-sm tabular-nums">{money(proposal.amount)}</strong></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-muted/30 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Before allocation</p><div className="space-y-1 text-xs">{Object.entries(proposal.previousAllocation || {}).filter(([, amount]) => Number(amount) !== 0).map(([key, amount]) => <div key={key} className="flex justify-between gap-3"><span>{label(key)}</span><span>{money(Number(amount))}</span></div>)}{!Object.values(proposal.previousAllocation || {}).some((amount) => Number(amount) !== 0) && <span className="text-muted-foreground">No saved allocation snapshot</span>}</div></div>
              <div className="rounded-lg bg-primary/5 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">Recorded payment allocation</p><div className="space-y-1 text-xs">{["deposit", "rent", "utilities", "other", "walletCredit"].map((key) => <div key={key} className="flex justify-between gap-3"><span>{key === "walletCredit" ? "Wallet retained" : label(key)}</span><span>{money(Number(proposal.proposedAllocation?.[key] || 0))}</span></div>)}</div></div>
            </div>
            {proposal.walletDebitToPost > 0 && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>Original wallet credit applied: {money(proposal.walletDebitToPost)}</strong><p className="mt-1">{Object.entries(proposal.walletAllocation || {}).filter(([, amount]) => Number(amount) > 0).map(([key, amount]) => `${label(key)} ${money(Number(amount))}`).join(" · ")}</p></div>}
          </article>)}
        </div>}
        {record.issues?.length ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Analysis notes</strong><ul className="mt-2 list-disc space-y-1 pl-5">{record.issues.map((issue) => <li key={issue}>{label(issue)}</li>)}</ul></div> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span>Allocation policy: {record.allocationPolicyVersion || "existing allocator"}</span><ArrowRight size={13} /><span>Payment references preserved: {record.paymentReferences?.join(", ") || "None"}</span></div>
      </section>
    </>}
  </main>;
}
