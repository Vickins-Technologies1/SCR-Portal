"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileText, Loader2, RefreshCw, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

type Invoice = { _id: string; invoiceNumber: string; propertyName: string; unitLabel: string; billingPeriod: string; issueDate: string; dueDate: string; total: number; amountPaid: number; balanceDue: number; status: string };
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 });

async function readApiResponse(response: Response, fallback: string) {
  let data: any;
  try { data = await response.json(); }
  catch { throw new Error(response.statusText || fallback); }
  if (!response.ok || !data?.success) throw new Error(data?.message || fallback);
  return data;
}

export default function TenantInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tenant-invoices", { credentials: "include", cache: "no-store" });
      const data = await readApiResponse(response, "Unable to load invoices");
      setInvoices(data.invoices || []);
      setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load invoices";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  const openDetails = async (invoiceId: string) => {
    setDetailLoadingId(invoiceId);
    try {
      const response = await fetch(`/api/tenant-invoices/${invoiceId}`, { credentials: "include", cache: "no-store" });
      const data = await readApiResponse(response, "Unable to load invoice details");
      setDetail(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load invoice details");
    } finally {
      setDetailLoadingId(null);
    }
  };

  const allocations = detail?.invoice?.paymentAllocations || [];
  return <div className="mx-auto max-w-5xl space-y-5">
    <Toaster position="top-right" toastOptions={{ duration: 4200, style: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "16px", boxShadow: "0 12px 36px rgba(0,0,0,.14)" } }} />
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing</p><h1 className="mt-1 text-2xl font-semibold">My invoices</h1><p className="mt-1 text-sm text-muted-foreground">Invoices issued for your tenancy will appear here.</p></header>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><FileText size={18} className="text-primary"/>Invoice history</h2><button onClick={() => void loadInvoices()} disabled={loading} aria-label="Refresh invoices" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-60">{loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}</button></div>
      {loading ? <div role="status" aria-label="Loading invoices" className="space-y-3 p-6"><div className="h-4 w-40 animate-pulse rounded bg-muted"/>{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-lg bg-muted/70"/>)}<span className="sr-only">Loading invoices…</span></div> : loadError ? <div role="alert" className="p-10 text-center"><AlertTriangle className="mx-auto text-destructive" size={28}/><p className="mt-3 font-medium">Invoices could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{loadError}</p><button onClick={() => void loadInvoices()} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try again</button></div> : invoices.length === 0 ? <div className="p-12 text-center"><FileText className="mx-auto text-muted-foreground" size={30}/><p className="mt-3 font-medium">No issued invoices</p><p className="mt-1 text-sm text-muted-foreground">Your property manager has not issued an invoice yet.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Invoice", "Property / Unit", "Period", "Issued", "Due", "Total", "Paid", "Balance", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice._id} className="border-t border-border"><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td className="px-4 py-3">{invoice.propertyName} · {invoice.unitLabel}</td><td className="px-4 py-3">{invoice.billingPeriod.startsWith("MANUAL-") ? "Manual" : invoice.billingPeriod}</td><td className="px-4 py-3">{new Date(invoice.issueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{money.format(invoice.total)}</td><td className="px-4 py-3">{money.format(invoice.amountPaid || 0)}</td><td className="px-4 py-3">{money.format(invoice.balanceDue || 0)}</td><td className="px-4 py-3 capitalize">{invoice.status.replace("_", " ")}</td><td className="px-4 py-3"><div className="flex"><button onClick={() => void openDetails(invoice._id)} disabled={detailLoadingId === invoice._id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60">{detailLoadingId === invoice._id ? <Loader2 size={13} className="animate-spin"/> : null}Details</button><a href={`/api/tenant-invoices/${invoice._id}/pdf`} aria-label={`Download ${invoice.invoiceNumber}`} className="inline-flex rounded-lg p-2 hover:bg-muted"><Download size={16}/></a></div></td></tr>)}</tbody></table></div>}
    </section>
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section role="dialog" aria-modal="true" aria-labelledby="tenant-invoice-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="tenant-invoice-detail-title" className="text-lg font-semibold">{detail.invoice.invoiceNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{detail.invoice.propertyName} · {detail.invoice.unitLabel}</p></div><button onClick={() => setDetail(null)} aria-label="Close invoice details" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-5 space-y-2">{(detail.invoice.displayItems || detail.invoice.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.description}</span><span>{money.format(item.amount / 100)}</span></div>)}<div className="flex justify-between pt-2 text-sm"><span>Total</span><strong>{money.format(detail.invoice.total)}</strong></div><div className="flex justify-between text-sm"><span>Paid allocations</span><span>{money.format(detail.invoice.amountPaid)}</span></div><div className="flex justify-between text-sm"><span>Outstanding</span><strong>{money.format(detail.invoice.balanceDue)}</strong></div></div><section className="mt-5 rounded-xl bg-muted/40 p-4"><h3 className="text-sm font-semibold">Payment instructions</h3><p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{detail.paymentInstructions}</p><p className="mt-2 text-xs text-muted-foreground">Use invoice number {detail.invoice.invoiceNumber} as your payment reference where required.</p></section><h3 className="mt-6 font-semibold">Payments credited to this invoice</h3>{allocations.length ? <ul className="mt-2 space-y-2">{allocations.map((allocation: any, index: number) => <li key={`${allocation.paymentId}-${allocation.category}-${index}`} className="rounded-xl border border-border p-3 text-xs"><div className="flex justify-between"><span>{allocation.reference || `Payment ${allocation.paymentId.slice(-8)}`}</span><span>{new Date(allocation.occurredAt).toLocaleDateString("en-KE")}</span></div><p className="mt-1 text-muted-foreground">{allocation.category} · {money.format(Number(allocation.amountMinor || 0) / 100)}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No posted payments are allocated to this invoice.</p>}<div className="mt-5 flex justify-end gap-2"><a href={`/api/tenant-invoices/${detail.invoice._id}/pdf`} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm"><Download size={15}/>Download PDF</a><a href="/tenant-dashboard/payments" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Go to payments</a></div></section></div>}
  </div>;
}