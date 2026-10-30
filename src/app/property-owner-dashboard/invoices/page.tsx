"use client";

import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";
import { FileText, RefreshCw, WandSparkles } from "lucide-react";

type Invoice = { _id: string; invoiceNumber: string; tenantName: string; propertyName: string; unitLabel: string; billingPeriod: string; issueDate: string; dueDate: string; total: number; status: string };
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 });

export default function LandlordInvoicesPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant-invoices?period=${encodeURIComponent(period)}`, { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) setInvoices(data.invoices || []);
      else setMessage(data.message || "Unable to load invoices");
    } catch { setMessage("Unable to load invoices"); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void refresh(); }, [refresh]);

  const generate = async () => {
    setWorking(true); setMessage("");
    try {
      const res = await fetch("/api/tenant-invoices", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ billingPeriod: period }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Invoice generation failed");
      setMessage(`Created ${data.created} draft${data.created === 1 ? "" : "s"}; ${data.duplicate} already existed; ${data.skipped} skipped.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invoice generation failed"); }
    finally { setWorking(false); }
  };
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing</p><h1 className="mt-1 text-2xl font-semibold">Tenant invoices</h1><p className="mt-1 text-sm text-muted-foreground">Prepare monthly rent invoice drafts for active tenancies.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="billing-period">Billing period</label><input id="billing-period" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm" /><button onClick={() => void generate()} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"><WandSparkles size={16} />{working ? "Generating…" : "Generate monthly drafts"}</button></div>
    </header>
    {message && <div role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Draft invoices</p><p className="mt-2 text-2xl font-semibold">{invoices.length}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Draft value</p><p className="mt-2 text-2xl font-semibold">{money.format(total)}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Billing period</p><p className="mt-2 text-2xl font-semibold">{period}</p></div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2"><FileText size={18} className="text-primary"/><h2 className="font-semibold">Invoices for {period}</h2></div><button onClick={() => void refresh()} aria-label="Refresh invoices" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><RefreshCw size={16}/></button></div>
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading invoices…</p> : invoices.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto text-muted-foreground" size={28}/><p className="mt-3 font-medium">No draft invoices for this period</p><p className="mt-1 text-sm text-muted-foreground">Generate monthly drafts to review the rent charges for your tenancies.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Invoice", "Tenant", "Property / Unit", "Period", "Issue date", "Due date", "Total", "Status"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice._id} className="border-t border-border"><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td className="px-4 py-3">{invoice.tenantName}</td><td className="px-4 py-3">{invoice.propertyName} · {invoice.unitLabel}</td><td className="px-4 py-3">{invoice.billingPeriod}</td><td className="px-4 py-3">{new Date(invoice.issueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{money.format(invoice.total)}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">Draft</span></td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-xs leading-relaxed text-muted-foreground">Drafts are separate from the rent payment ledger. Generating them does not create a payment or change tenant dues. Invoice sending and payment allocation are not enabled in this workflow yet.</p>
  </div>;
}
