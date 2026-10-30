"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

type Invoice = { _id: string; invoiceNumber: string; propertyName: string; unitLabel: string; billingPeriod: string; issueDate: string; dueDate: string; total: number; status: string };
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 });

export default function TenantInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/tenant-invoices", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (data.success) setInvoices(data.invoices || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return <div className="mx-auto max-w-5xl space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing</p><h1 className="mt-1 text-2xl font-semibold">My invoices</h1><p className="mt-1 text-sm text-muted-foreground">Invoices issued for your tenancy will appear here.</p></header>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading invoices…</p> : invoices.length === 0 ? <div className="p-12 text-center"><FileText className="mx-auto text-muted-foreground" size={30}/><p className="mt-3 font-medium">No issued invoices</p><p className="mt-1 text-sm text-muted-foreground">Your property manager has not issued an invoice yet.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Invoice", "Property / Unit", "Period", "Issued", "Due", "Total", "Status"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice._id} className="border-t border-border"><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td className="px-4 py-3">{invoice.propertyName} · {invoice.unitLabel}</td><td className="px-4 py-3">{invoice.billingPeriod}</td><td className="px-4 py-3">{new Date(invoice.issueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{money.format(invoice.total)}</td><td className="px-4 py-3">{invoice.status}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
