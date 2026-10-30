"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Cookies from "js-cookie";
import { FileText, RefreshCw, WandSparkles, Plus, Send, Download, X, Pencil, Eye } from "lucide-react";

type Invoice = { _id: string; invoiceNumber: string; tenantName: string; tenantId: string; propertyId: string; propertyName: string; unitLabel: string; billingPeriod: string; billingPeriodLabel?: string; issueDate: string | null; createdAt?: string; dueDate: string; total: number; amountPaid: number; balanceDue: number; status: string };
type Tenant = { _id: string; name: string; propertyId: string; houseNumber?: string; unitType?: string };
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 });

export default function LandlordInvoicesPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [retryableChannels, setRetryableChannels] = useState<Record<string, string[]>>({});
  const [deliveryChannel, setDeliveryChannel] = useState("email");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
  const [adjustingInvoice, setAdjustingInvoice] = useState<Invoice | null>(null);
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState("credit");
  const [adjustmentCategory, setAdjustmentCategory] = useState("rent");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeCategory, setChargeCategory] = useState("other");
  const [extraCharges, setExtraCharges] = useState<Array<{ description: string; quantity: string; amount: string; category: string }>>([]);
  const [dueDate, setDueDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`);
  const [savingManual, setSavingManual] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, page: "1", limit: "1000" });
      if (propertyFilter !== "all") params.set("propertyId", propertyFilter);
      if (tenantFilter !== "all") params.set("tenantId", tenantFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      const res = await fetch(`/api/tenant-invoices?${params}`, { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) { setInvoices(data.invoices || []); setRetryableChannels(data.retryableChannels || {}); }
      else setMessage(data.message || "Unable to load invoices");
    } catch { setMessage("Unable to load invoices"); }
    finally { setLoading(false); }
  }, [period, propertyFilter, tenantFilter, statusFilter, search, dateFrom, dateTo]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!manualOpen) return;
    fetch("/api/tenants?limit=100&page=1", { credentials: "include", cache: "no-store" }).then((res) => res.json()).then((data) => { if (data.success) setTenants(data.tenants || []); }).catch(() => {});
  }, [manualOpen]);

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
  const filteredInvoices = invoices.filter((invoice) => {
    const term = search.trim().toLowerCase();
    const searchMatch = !term || [invoice.invoiceNumber, invoice.tenantName, invoice.propertyName, invoice.unitLabel].some((value) => String(value || "").toLowerCase().includes(term));
    const date = new Date(invoice.issueDate || invoice.createdAt || invoice.dueDate);
    const dateKey = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    return searchMatch && (propertyFilter === "all" || invoice.propertyId === propertyFilter) && (tenantFilter === "all" || invoice.tenantId === tenantFilter) && (statusFilter === "all" || invoice.status === statusFilter) && (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo);
  });
  const act = async (invoice: Invoice, action: "issue" | "cancel" | "resend" | "retry", body: Record<string, unknown> = {}) => {
    setMessage("");
    try {
      const res = await fetch(`/api/tenant-invoices/${invoice._id}`, { method: action === "resend" || action === "retry" ? "POST" : "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action, ...body }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Invoice action failed");
      if (data.delivery?.outcomes && Object.values(data.delivery.outcomes).some((state) => state === "failed")) setMessage(`Invoice issued. Some delivery attempts failed: ${JSON.stringify(data.delivery.outcomes)}`);
      else setMessage(action === "issue" ? "Invoice issued." : action === "cancel" ? "Invoice cancelled." : action === "retry" ? "Failed delivery retried." : "Invoice resent.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invoice action failed"); }
  };
  const createManual = async (event: FormEvent) => {
    event.preventDefault(); setSavingManual(true); setMessage("");
    try {
      const items = [{ description: chargeDescription, quantity: Number(chargeQuantity), unitPrice: Number(chargeAmount), category: chargeCategory }, ...extraCharges.map((item) => ({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.amount), category: item.category }))];
      const selected = tenants.find((tenant) => tenant._id === tenantId);
      if (!editingId && !selected) throw new Error("Select a tenant");
      const res = editingId
        ? await fetch(`/api/tenant-invoices/${editingId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "edit", dueDate: new Date(`${dueDate}T12:00:00`).toISOString(), items }) })
        : await fetch("/api/tenant-invoices", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "manual", tenantId, dueDate: new Date(`${dueDate}T12:00:00`).toISOString(), billingPeriod: period, items }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Unable to create draft");
      setManualOpen(false); setEditingId(null); setChargeDescription(""); setChargeQuantity("1"); setChargeAmount(""); setExtraCharges([]); setMessage(editingId ? "Draft updated." : `Draft created for ${selected!.name}.`); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create draft"); }
    finally { setSavingManual(false); }
  };
  const editDraft = async (invoice: Invoice) => {
    try {
      const [invoiceResponse, tenantResponse] = await Promise.all([
        fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/tenants?limit=100&page=1", { credentials: "include", cache: "no-store" }),
      ]);
      const [invoiceData, tenantData] = await Promise.all([invoiceResponse.json(), tenantResponse.json()]);
      if (!invoiceData.success || !tenantData.success) throw new Error("Unable to load draft details");
      const record = invoiceData.invoice;
      const items = record.items || [];
      setTenants(tenantData.tenants || []); setTenantId(invoice.tenantId); setEditingId(invoice._id);
      setChargeDescription(items[0]?.description || ""); setChargeQuantity(String(items[0]?.quantity || 1)); setChargeAmount(String(Number(items[0]?.unitAmount || 0) / 100)); setChargeCategory(items[0]?.category || "other");
      setExtraCharges(items.slice(1).map((item: any) => ({ description: item.description, quantity: String(item.quantity || 1), amount: String(Number(item.unitAmount || 0) / 100), category: item.category || "other" })));
      setDueDate(String(record.dueDate).slice(0, 10)); setManualOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load draft"); }
  };
  const previewInvoice = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load invoice preview");
      setPreview(data.invoice);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load invoice preview"); }
  };
  const openInvoiceDetails = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load invoice history");
      setInvoiceDetails(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load invoice history"); }
  };
  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjustingInvoice) return;
    setSavingManual(true); setMessage("");
    try {
      const response = await fetch(`/api/tenant-invoices/${adjustingInvoice._id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "adjust", description: adjustmentDescription, reason: adjustmentReason, amount: Number(adjustmentAmount), direction: adjustmentDirection, category: adjustmentCategory }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to adjust invoice");
      setMessage("Invoice adjustment recorded and audit logged."); setAdjustingInvoice(null); setAdjustmentDescription(""); setAdjustmentReason(""); setAdjustmentAmount(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to adjust invoice"); }
    finally { setSavingManual(false); }
  };
  const bulkSendVisible = async () => {
    const targets = filteredInvoices.filter((invoice) => !["draft", "cancelled"].includes(invoice.status));
    if (!targets.length) { setMessage("No issued invoices match these filters."); return; }
    setBulkSending(true); setMessage("");
    let sent = 0, failed = 0;
    try {
      for (const invoice of targets) {
        const res = await fetch(`/api/tenant-invoices/${invoice._id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "resend", channel: deliveryChannel }) });
        const data = await res.json();
        const outcomes = Object.values(data.delivery?.outcomes || {});
        if (res.ok && data.success && outcomes.length > 0 && outcomes.every((state) => state === "sent")) sent++; else failed++;
      }
      setMessage(`Bulk delivery finished: ${sent} sent, ${failed} failed.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bulk email failed"); }
    finally { setBulkSending(false); }
  };
  const issued = filteredInvoices.filter((invoice) => !["draft", "cancelled"].includes(invoice.status));
  const billedTotal = issued.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidTotal = issued.reduce((sum, invoice) => sum + (invoice.amountPaid || 0), 0);
  const outstandingTotal = issued.reduce((sum, invoice) => sum + (invoice.balanceDue ?? invoice.total), 0);
  const overdueCount = issued.filter((invoice) => invoice.status === "overdue").length;
  const partialCount = issued.filter((invoice) => invoice.amountPaid > 0 && invoice.balanceDue > 0).length;
  const unpaidCount = issued.filter((invoice) => invoice.amountPaid <= 0 && invoice.balanceDue > 0).length;
  const paidCount = issued.filter((invoice) => invoice.balanceDue <= 0).length;
  const drafts = filteredInvoices.filter((invoice) => invoice.status === "draft");

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing</p><h1 className="mt-1 text-2xl font-semibold">Tenant invoices</h1><p className="mt-1 text-sm text-muted-foreground">Prepare monthly rent invoice drafts for active tenancies.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="billing-period">Billing period</label><input id="billing-period" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm" /><label className="sr-only" htmlFor="delivery-channel">Delivery channel</label><select id="delivery-channel" value={deliveryChannel} onChange={(event) => setDeliveryChannel(event.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email + SMS</option><option value="app">In-app</option></select><button onClick={() => void bulkSendVisible()} disabled={bulkSending || !issued.length} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-60"><Send size={16}/>{bulkSending ? "Sending…" : `Send visible (${issued.length})`}</button><button onClick={() => setManualOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold"><Plus size={16}/>Manual invoice</button><button onClick={() => void generate()} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"><WandSparkles size={16} />{working ? "Generating…" : "Generate monthly drafts"}</button></div>
    </header>
    {message && <div role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Total invoices</p><p className="mt-2 text-2xl font-semibold">{filteredInvoices.filter((invoice) => invoice.status !== "cancelled").length}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Total invoiced</p><p className="mt-2 text-2xl font-semibold">{money.format(billedTotal)}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Paid</p><p className="mt-2 text-2xl font-semibold">{money.format(paidTotal)}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Paid invoices</p><p className="mt-2 text-2xl font-semibold">{paidCount}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Partially paid</p><p className="mt-2 text-2xl font-semibold">{partialCount}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Unpaid</p><p className="mt-2 text-2xl font-semibold">{unpaidCount}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Overdue</p><p className="mt-2 text-2xl font-semibold">{overdueCount}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Outstanding balance</p><p className="mt-2 text-2xl font-semibold">{money.format(outstandingTotal)}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Drafts</p><p className="mt-2 text-2xl font-semibold">{drafts.length} · {money.format(drafts.reduce((sum, invoice) => sum + invoice.total, 0))}</p></div>
    </div>
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"><label className="text-xs text-muted-foreground">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice, tenant, property, unit" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label><label className="text-xs text-muted-foreground">Property<select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="all">All properties</option>{Array.from(new Map(invoices.map((invoice) => [invoice.propertyId, invoice.propertyName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="text-xs text-muted-foreground">Tenant<select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="all">All tenants</option>{Array.from(new Map(invoices.map((invoice) => [invoice.tenantId, invoice.tenantName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="text-xs text-muted-foreground">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="all">All statuses</option>{["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></label><label className="text-xs text-muted-foreground">Issued from<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label><label className="text-xs text-muted-foreground">Issued to<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"/></label></section>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2"><FileText size={18} className="text-primary"/><h2 className="font-semibold">Invoices for {period} · {filteredInvoices.length}</h2></div><button onClick={() => void refresh()} aria-label="Refresh invoices" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><RefreshCw size={16}/></button></div>
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading invoices…</p> : filteredInvoices.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto text-muted-foreground" size={28}/><p className="mt-3 font-medium">No invoices match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear filters or generate monthly drafts.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Invoice", "Tenant", "Property / Unit", "Period", "Issue date", "Due date", "Total", "Paid", "Balance", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filteredInvoices.map((invoice) => <tr key={invoice._id} className="border-t border-border"><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td className="px-4 py-3">{invoice.tenantName}</td><td className="px-4 py-3">{invoice.propertyName} · {invoice.unitLabel}</td><td className="px-4 py-3">{invoice.billingPeriodLabel || (invoice.billingPeriod.startsWith("MANUAL-") ? "Manual" : invoice.billingPeriod)}</td><td className="px-4 py-3">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-KE") : "—"}</td><td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{money.format(invoice.total)}</td><td className="px-4 py-3">{money.format(invoice.amountPaid || 0)}</td><td className="px-4 py-3">{money.format(invoice.balanceDue ?? invoice.total)}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">{invoice.status.replace("_", " ")}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1">{invoice.status === "draft" ? <><button title="Preview draft" onClick={() => void previewInvoice(invoice)} className="rounded-lg p-2 hover:bg-muted"><Eye size={15}/></button><button title="Edit draft" onClick={() => void editDraft(invoice)} className="rounded-lg p-2 hover:bg-muted"><Pencil size={15}/></button><button title="Approve, issue and send by email" onClick={() => void act(invoice, "issue", { approve: true, send: true, channel: deliveryChannel })} className="rounded-lg p-2 hover:bg-muted"><Send size={15}/></button><button title="Cancel draft" onClick={() => void act(invoice, "cancel")} className="rounded-lg p-2 hover:bg-muted"><X size={15}/></button></> : invoice.status !== "cancelled" && <><a title="Download PDF" href={`/api/tenant-invoices/${invoice._id}/pdf`} className="rounded-lg p-2 hover:bg-muted"><Download size={15}/></a><button title="Invoice details and payment history" onClick={() => void openInvoiceDetails(invoice)} className="rounded-lg p-2 hover:bg-muted"><Eye size={15}/></button><button title="Add audited credit or charge" onClick={() => setAdjustingInvoice(invoice)} className="rounded-lg p-2 hover:bg-muted"><Plus size={15}/></button><button title="Resend by email" onClick={() => void act(invoice, "resend", { channel: deliveryChannel })} className="rounded-lg p-2 hover:bg-muted"><Send size={15}/></button>{(retryableChannels[invoice._id] || []).map((channel) => <button key={channel} title={`Retry failed ${channel} delivery`} onClick={() => void act(invoice, "retry", { channel })} className="rounded-lg px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/10">Retry {channel}</button>)}</>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-xs leading-relaxed text-muted-foreground">Invoices describe existing tenant charges and do not create payment transactions or alter the rent payment ledger. Payment status is derived from posted rent, utility and other allocations.</p>
    {manualOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><form onSubmit={createManual} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{editingId ? "Edit invoice draft" : "Create invoice draft"}</h2><button type="button" onClick={() => { setManualOpen(false); setEditingId(null); }} aria-label="Close"><X size={18}/></button></div>{!editingId && <label className="block text-sm">Tenant<select required value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.name} · {tenant.unitType || tenant.houseNumber || "Unit"}</option>)}</select></label>}<label className="block text-sm">Description<input required maxLength={120} value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Repair charge, service fee, etc."/></label><div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm">Quantity<input required type="number" min="0.01" step="0.01" value={chargeQuantity} onChange={(e) => setChargeQuantity(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label><label className="block text-sm">Category<select value={chargeCategory} onChange={(e) => setChargeCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other / service / repair</option></select></label><label className="block text-sm">Amount (KES)<input required type="number" min="0.01" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div>{extraCharges.map((charge, index) => <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_85px_130px_100px_auto]"><input required maxLength={120} aria-label="Charge description" value={charge.description} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Additional charge"/><input required type="number" min="0.01" step="0.01" aria-label="Charge quantity" value={charge.quantity} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"/><input required type="number" min="0.01" step="0.01" aria-label="Charge amount" value={charge.amount} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"/><select aria-label="Charge category" value={charge.category} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, category: e.target.value } : item))} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other</option></select><button type="button" onClick={() => setExtraCharges(extraCharges.filter((_, i) => i !== index))} aria-label="Remove charge" className="rounded-lg p-2 hover:bg-muted"><X size={16}/></button></div>)}<button type="button" onClick={() => setExtraCharges([...extraCharges, { description: "", quantity: "1", amount: "", category: "other" }])} className="text-sm font-medium text-primary">+ Add another charge</button><label className="block text-sm">Due date<input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => { setManualOpen(false); setEditingId(null); }} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button><button disabled={savingManual} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingManual ? "Saving…" : editingId ? "Update draft" : "Save draft"}</button></div></form></div>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Draft preview</p><h2 className="mt-1 text-lg font-semibold">{preview.tenantName} · {preview.propertyName} · {preview.unitLabel}</h2><p className="mt-1 text-sm text-muted-foreground">{preview.billingPeriodLabel || preview.billingPeriod} · Due {new Date(preview.dueDate).toLocaleDateString("en-KE")}</p></div><button onClick={() => setPreview(null)} aria-label="Close preview" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-5 space-y-2">{(preview.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.description} <span className="text-muted-foreground">× {item.quantity}</span></span><span>{money.format(item.amount / 100)}</span></div>)}<div className="flex justify-between pt-3 text-sm"><span>Total</span><strong>{money.format(preview.total)}</strong></div></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setPreview(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Close</button><button onClick={() => { const target = invoices.find((invoice) => invoice._id === preview._id); setPreview(null); if (target) void act(target, "issue", { approve: true, send: true, channel: deliveryChannel }); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Send size={15}/>Approve, issue & email</button></div></section></div>}
    {adjustingInvoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={submitAdjustment} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Audited adjustment</p><h2 className="mt-1 text-lg font-semibold">{adjustingInvoice.invoiceNumber}</h2></div><button type="button" onClick={() => setAdjustingInvoice(null)} aria-label="Close adjustment" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><label className="block text-sm">Description<input required maxLength={120} value={adjustmentDescription} onChange={(event) => setAdjustmentDescription(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Agreed credit, repair charge, etc."/></label><label className="block text-sm">Reason<input required maxLength={300} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Record the agreement or supporting reason"/></label><div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm">Type<select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="credit">Credit</option><option value="charge">Additional charge</option></select></label><label className="block text-sm">Category<select value={adjustmentCategory} onChange={(event) => setAdjustmentCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other</option></select></label><label className="block text-sm">Amount (KES)<input required type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div><p className="text-xs text-muted-foreground">The issued invoice lines remain unchanged. This adjustment is recorded separately in its audit history.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setAdjustingInvoice(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button><button disabled={savingManual} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingManual ? "Saving…" : "Record adjustment"}</button></div></form></div>}
    {invoiceDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Invoice detail</p><h2 className="mt-1 text-lg font-semibold">{invoiceDetails.invoice.invoiceNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{invoiceDetails.invoice.tenantName} · {invoiceDetails.invoice.propertyName} · {invoiceDetails.invoice.unitLabel}</p></div><button onClick={() => setInvoiceDetails(null)} aria-label="Close invoice details" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-5 space-y-2">{(invoiceDetails.invoice.displayItems || invoiceDetails.invoice.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.description}</span><span>{money.format(Number(item.amount || 0) / 100)}</span></div>)}<div className="flex justify-between pt-2 text-sm"><span>Total</span><strong>{money.format(invoiceDetails.invoice.total)}</strong></div><div className="flex justify-between text-sm"><span>Paid</span><span>{money.format(invoiceDetails.invoice.amountPaid)}</span></div><div className="flex justify-between text-sm"><span>Outstanding</span><strong>{money.format(invoiceDetails.invoice.balanceDue)}</strong></div></div><h3 className="mt-6 font-semibold">Payment allocations</h3>{invoiceDetails.invoice.paymentAllocations?.length ? <ul className="mt-2 space-y-2">{invoiceDetails.invoice.paymentAllocations.map((item: any, index: number) => <li key={`${item.paymentId}-${index}`} className="rounded-xl border border-border p-3 text-xs"><div className="flex justify-between"><span>{item.reference || `Payment ${String(item.paymentId).slice(-8)}`}</span><span>{new Date(item.occurredAt).toLocaleDateString("en-KE")}</span></div><p className="mt-1 text-muted-foreground">{item.category} · {money.format(item.amountMinor / 100)}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No payment has been allocated to this invoice.</p>}<h3 className="mt-6 font-semibold">Audit history</h3>{invoiceDetails.activity?.length ? <ul className="mt-2 space-y-2">{invoiceDetails.activity.map((entry: any, index: number) => <li key={index} className="flex justify-between rounded-lg border border-border p-3 text-xs"><span className="capitalize">{String(entry.event).replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString("en-KE")}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded.</p>}<div className="mt-5 flex justify-end"><button onClick={() => setInvoiceDetails(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Close</button></div></section></div>}
  </div>;
}
