"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Cookies from "js-cookie";
import { FileText, RefreshCw, WandSparkles, Plus, Send, Download, X, Pencil, Eye, Loader2, AlertTriangle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

type Invoice = { _id: string; invoiceNumber: string; tenantName: string; tenantId: string; propertyId: string; propertyName: string; unitLabel: string; billingPeriod: string; billingPeriodLabel?: string; issueDate: string | null; createdAt?: string; dueDate: string; total: number; amountPaid: number; balanceDue: number; status: string };
type Tenant = { _id: string; name: string; propertyId: string; houseNumber?: string; unitType?: string };
const money = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 });

async function readApiResponse(response: Response, fallback: string) {
  let data: any;
  try { data = await response.json(); }
  catch { throw new Error(response.statusText || fallback); }
  if (!response.ok || !data?.success) throw new Error(data?.message || fallback);
  return data;
}

type Confirmation =
  | { kind: "action"; invoice: Invoice; action: "issue" | "cancel" | "resend" | "retry"; body?: Record<string, unknown> }
  | { kind: "bulk"; count: number };

export default function LandlordInvoicesPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [retryableChannels, setRetryableChannels] = useState<Record<string, string[]>>({});
  const [deliveryChannel, setDeliveryChannel] = useState("email");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [duesPreview, setDuesPreview] = useState<any>(null);
  const [duesPreviewLoading, setDuesPreviewLoading] = useState(false);
  const [generationAnalysis, setGenerationAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
  const [adjustingInvoice, setAdjustingInvoice] = useState<Invoice | null>(null);
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState("credit");
  const [adjustmentCategory, setAdjustmentCategory] = useState("rent");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
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
      const data = await readApiResponse(res, "Unable to load invoices");
      setInvoices(data.invoices || []); setRetryableChannels(data.retryableChannels || {}); setLoadError("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to load invoices";
      setLoadError(text); toast.error(text);
    }
    finally { setLoading(false); }
  }, [period, propertyFilter, tenantFilter, statusFilter, search, dateFrom, dateTo]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!manualOpen) return;
    setTenantsLoading(true);
    fetch("/api/tenants?limit=100&page=1", { credentials: "include", cache: "no-store" })
      .then(async (res) => readApiResponse(res, "Unable to load tenants"))
      .then((data) => setTenants(data.tenants || []))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load tenants"))
      .finally(() => setTenantsLoading(false));
  }, [manualOpen]);

  const generate = async () => {
    setWorking(true);
    try {
      const res = await fetch("/api/tenant-invoices", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ billingPeriod: period }) });
      const data = await readApiResponse(res, "Invoice generation failed");
      toast.success(`Created ${data.created} draft${data.created === 1 ? "" : "s"}; ${data.duplicate} already existed; ${data.skipped} skipped.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Invoice generation failed"); }
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
    const operationId = `${invoice._id}:${action}`;
    setPendingAction(operationId);
    try {
      const res = await fetch(`/api/tenant-invoices/${invoice._id}`, { method: action === "resend" || action === "retry" ? "POST" : "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action, ...body }) });
      const data = await readApiResponse(res, "Invoice action failed");
      if (data.delivery?.outcomes && Object.values(data.delivery.outcomes).some((state) => state === "failed")) toast.error(`Invoice ${action === "issue" ? "issued" : "updated"}, but some delivery attempts failed.`);
      else toast.success(action === "issue" ? "Invoice issued and sent." : action === "cancel" ? "Invoice cancelled." : action === "retry" ? "Failed delivery retried." : "Invoice resent.");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Invoice action failed"); }
    finally { setPendingAction(null); }
  };
  const createManual = async (event: FormEvent) => {
    event.preventDefault(); setSavingManual(true);
    try {
      const items = [{ description: chargeDescription, quantity: Number(chargeQuantity), unitPrice: Number(chargeAmount), category: chargeCategory }, ...extraCharges.map((item) => ({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.amount), category: item.category }))];
      const selected = tenants.find((tenant) => tenant._id === tenantId);
      if (!editingId && !selected) throw new Error("Select a tenant");
      const res = editingId
        ? await fetch(`/api/tenant-invoices/${editingId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "edit", dueDate: new Date(`${dueDate}T12:00:00`).toISOString(), items }) })
        : await fetch("/api/tenant-invoices", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "manual", tenantId, dueDate: new Date(`${dueDate}T12:00:00`).toISOString(), billingPeriod: period, items }) });
      await readApiResponse(res, "Unable to create draft");
      setManualOpen(false); setEditingId(null); setChargeDescription(""); setChargeQuantity("1"); setChargeAmount(""); setExtraCharges([]); toast.success(editingId ? "Draft updated." : `Draft created for ${selected!.name}.`); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create draft"); }
    finally { setSavingManual(false); }
  };
  const editDraft = async (invoice: Invoice) => {
    setLoadingInvoiceId(invoice._id);
    try {
      const [invoiceResponse, tenantResponse] = await Promise.all([
        fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/tenants?limit=100&page=1", { credentials: "include", cache: "no-store" }),
      ]);
      const [invoiceData, tenantData] = await Promise.all([readApiResponse(invoiceResponse, "Unable to load draft details"), readApiResponse(tenantResponse, "Unable to load tenants")]);
      const record = invoiceData.invoice;
      const items = record.items || [];
      setTenants(tenantData.tenants || []); setTenantId(invoice.tenantId); setEditingId(invoice._id);
      setChargeDescription(items[0]?.description || ""); setChargeQuantity(String(items[0]?.quantity || 1)); setChargeAmount(String(Number(items[0]?.unitAmount || 0) / 100)); setChargeCategory(items[0]?.category || "other");
      setExtraCharges(items.slice(1).map((item: any) => ({ description: item.description, quantity: String(item.quantity || 1), amount: String(Number(item.unitAmount || 0) / 100), category: item.category || "other" })));
      setDueDate(String(record.dueDate).slice(0, 10)); setManualOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load draft"); }
    finally { setLoadingInvoiceId(null); }
  };
  const previewInvoice = async (invoice: Invoice) => {
    setLoadingInvoiceId(invoice._id);
    try {
      const response = await fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" });
      const data = await readApiResponse(response, "Unable to load invoice preview");
      setPreview(data.invoice);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load invoice preview"); }
    finally { setLoadingInvoiceId(null); }
  };
  const previewTenantDues = async () => {
    const selectedTenantId = tenantFilter !== "all" ? tenantFilter : tenantId;
    if (!selectedTenantId) { toast.error("Select a tenant using the tenant filter or manual invoice form"); return; }
    setDuesPreviewLoading(true);
    try {
      const response = await fetch("/api/tenant-invoices/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ tenantId: selectedTenantId }) });
      const data = await readApiResponse(response, "Unable to calculate tenant dues");
      setDuesPreview(data.preview);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to calculate tenant dues"); }
    finally { setDuesPreviewLoading(false); }
  };
  const analyzeGeneration = async () => {
    setAnalysisLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (propertyFilter !== "all") params.set("propertyId", propertyFilter);
      if (tenantFilter !== "all") params.set("tenantId", tenantFilter);
      const response = await fetch(`/api/tenant-invoices/analysis?${params}`, { credentials: "include", cache: "no-store" });
      const data = await readApiResponse(response, "Unable to analyze tenant dues");
      setGenerationAnalysis(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to analyze tenant dues"); }
    finally { setAnalysisLoading(false); }
  };
  const createDuesDraft = async () => {
    if (!duesPreview) return;
    setDuesPreviewLoading(true);
    try {
      const response = await fetch("/api/tenant-invoices", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "dues", tenantId: duesPreview.tenant.id, billingPeriod: period }) });
      await readApiResponse(response, "Unable to create dues draft");
      setDuesPreview(null); setManualOpen(false); toast.success("Dues draft created. Review it before issuing."); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create dues draft"); }
    finally { setDuesPreviewLoading(false); }
  };
  const openInvoiceDetails = async (invoice: Invoice) => {
    setLoadingInvoiceId(invoice._id);
    try {
      const response = await fetch(`/api/tenant-invoices/${invoice._id}`, { credentials: "include", cache: "no-store" });
      const data = await readApiResponse(response, "Unable to load invoice history");
      setInvoiceDetails(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load invoice history"); }
    finally { setLoadingInvoiceId(null); }
  };
  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjustingInvoice) return;
    setSavingManual(true);
    try {
      const response = await fetch(`/api/tenant-invoices/${adjustingInvoice._id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "adjust", description: adjustmentDescription, reason: adjustmentReason, amount: Number(adjustmentAmount), direction: adjustmentDirection, category: adjustmentCategory }) });
      await readApiResponse(response, "Unable to adjust invoice");
      toast.success("Invoice adjustment recorded and audit logged."); setAdjustingInvoice(null); setAdjustmentDescription(""); setAdjustmentReason(""); setAdjustmentAmount(""); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to adjust invoice"); }
    finally { setSavingManual(false); }
  };
  const bulkSendVisible = async () => {
    const targets = filteredInvoices.filter((invoice) => !["draft", "cancelled", "voided", "superseded"].includes(invoice.status));
    if (!targets.length) { toast.error("No issued invoices match these filters."); return; }
    setBulkSending(true);
    let sent = 0, failed = 0;
    try {
      for (const invoice of targets) {
        try {
          const res = await fetch(`/api/tenant-invoices/${invoice._id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify({ action: "resend", channel: deliveryChannel }) });
          const data = await readApiResponse(res, "Delivery failed");
          const outcomes = Object.values(data.delivery?.outcomes || {});
          if (outcomes.length > 0 && outcomes.every((state) => state === "sent")) sent++; else failed++;
        } catch { failed++; }
      }
      if (failed) toast.error(`Bulk delivery finished: ${sent} sent, ${failed} failed.`);
      else toast.success(`Bulk delivery complete: ${sent} invoices sent.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Bulk delivery failed"); }
    finally { setBulkSending(false); }
  };
  const requestAction = (invoice: Invoice, action: "issue" | "cancel" | "resend" | "retry", body: Record<string, unknown> = {}) => setConfirmation({ kind: "action", invoice, action, body });
  const confirmAction = () => {
    if (!confirmation) return;
    const selected = confirmation;
    setConfirmation(null);
    if (selected.kind === "bulk") void bulkSendVisible();
    else void act(selected.invoice, selected.action, selected.body);
  };
  const issued = filteredInvoices.filter((invoice) => !["draft", "cancelled", "voided", "superseded"].includes(invoice.status));
  const billedTotal = issued.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidTotal = issued.reduce((sum, invoice) => sum + (invoice.amountPaid || 0), 0);
  const outstandingTotal = issued.reduce((sum, invoice) => sum + (invoice.balanceDue ?? invoice.total), 0);
  const overdueCount = issued.filter((invoice) => invoice.status === "overdue").length;
  const partialCount = issued.filter((invoice) => invoice.amountPaid > 0 && invoice.balanceDue > 0).length;
  const unpaidCount = issued.filter((invoice) => invoice.amountPaid <= 0 && invoice.balanceDue > 0).length;
  const paidCount = issued.filter((invoice) => invoice.balanceDue <= 0).length;
  const drafts = filteredInvoices.filter((invoice) => invoice.status === "draft");

  return <div className="min-h-[100svh] bg-background text-foreground">
    <Toaster position="top-right" toastOptions={{ duration: 4200, style: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "16px", boxShadow: "0 12px 36px rgba(0,0,0,.14)" } }} />
    <Navbar />
    <Sidebar />
    <div className="md:ml-72 pt-16 pb-16 px-4 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Billing</p><h1 className="mt-1 text-2xl font-semibold">Tenant invoices</h1><p className="mt-1 text-sm text-muted-foreground">Prepare monthly rent invoice drafts for active tenancies.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="billing-period">Billing period</label><input id="billing-period" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm" /><label className="sr-only" htmlFor="delivery-channel">Delivery channel</label><select id="delivery-channel" value={deliveryChannel} onChange={(event) => setDeliveryChannel(event.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email + SMS</option><option value="app">In-app</option></select><button onClick={() => setConfirmation({ kind: "bulk", count: issued.length })} disabled={bulkSending || !issued.length} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-60"><Send size={16}/>{bulkSending ? <><Loader2 size={15} className="animate-spin"/>Sending…</> : `Send visible (${issued.length})`}</button><button onClick={() => setManualOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold"><Plus size={16}/>Manual invoice</button><button onClick={() => void generate()} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{working ? <Loader2 size={16} className="animate-spin"/> : <WandSparkles size={16} />}{working ? "Generating drafts…" : "Generate monthly drafts"}</button></div>
    </header>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"><p className="text-sm text-muted-foreground">Analyze tenant eligibility and preview actual overdue balances before creating drafts.</p><button onClick={() => void analyzeGeneration()} disabled={analysisLoading} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50">{analysisLoading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}Analyze generation</button><button onClick={() => void previewTenantDues()} disabled={tenantFilter === "all" || duesPreviewLoading} className="inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary disabled:opacity-50">{duesPreviewLoading ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15}/>}Preview filtered tenant</button></div>
    {generationAnalysis && <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Generation analysis · {generationAnalysis.billingPeriod}</h2><p className="text-xs text-muted-foreground">Dues are recalculated from posted financial records.</p></div><button onClick={() => setGenerationAnalysis(null)} className="rounded-lg p-2 hover:bg-muted" aria-label="Close analysis"><X size={16}/></button></div><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[["Eligible",generationAnalysis.totals.eligible],["Up to date",generationAnalysis.totals.upToDate],["Valid invoices",generationAnalysis.totals.withValidInvoices],["Inactive",generationAnalysis.totals.inactive],["Overdue rent",generationAnalysis.totals.overdueRent],["Unpaid utilities",generationAnalysis.totals.utilities]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div><div className="max-h-72 overflow-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted/70"><tr><th className="p-2 text-left">Tenant</th><th className="p-2 text-left">Property / unit</th><th className="p-2 text-left">Analysis</th><th className="p-2 text-right">Proposed</th></tr></thead><tbody>{generationAnalysis.entries.map((entry:any)=><tr key={entry.tenantId} className="border-t border-border"><td className="p-2">{entry.tenantName}</td><td className="p-2">{entry.propertyName} · {entry.unit}</td><td className="p-2">{String(entry.reason).replaceAll("_"," ")}</td><td className="p-2 text-right">{money.format(Number(entry.dues?.totalMinor||0)/100)}</td></tr>)}</tbody></table></div>{generationAnalysis.obsoleteInvoices.length>0&&<p className="text-xs text-amber-700">{generationAnalysis.obsoleteInvoices.length} historical invoice records are flagged for reconciliation review.</p>}</section>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Total invoices</p><p className="mt-2 text-2xl font-semibold">{filteredInvoices.filter((invoice) => !["cancelled", "voided", "superseded"].includes(invoice.status)).length}</p></div>
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
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2"><FileText size={18} className="text-primary"/><h2 className="font-semibold">Invoices for {period} · {filteredInvoices.length}</h2></div><button onClick={() => void refresh()} disabled={loading} aria-label="Refresh invoices" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-60">{loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}</button></div>
      {loading ? <div role="status" aria-label="Loading invoices" className="space-y-3 p-6"><div className="h-4 w-40 animate-pulse rounded bg-muted"/><div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-lg bg-muted/70"/>)}</div><span className="sr-only">Loading invoices…</span></div> : loadError ? <div role="alert" className="p-10 text-center"><AlertTriangle className="mx-auto text-destructive" size={28}/><p className="mt-3 font-medium">Invoices could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{loadError}</p><button onClick={() => void refresh()} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try again</button></div> : filteredInvoices.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto text-muted-foreground" size={28}/><p className="mt-3 font-medium">No invoices match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear filters or generate monthly drafts.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Invoice", "Tenant", "Property / Unit", "Period", "Issue date", "Due date", "Total", "Paid", "Balance", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filteredInvoices.map((invoice) => { const rowBusy = pendingAction?.startsWith(`${invoice._id}:`); const detailBusy = loadingInvoiceId === invoice._id; return <tr key={invoice._id} className="border-t border-border"><td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td><td className="px-4 py-3">{invoice.tenantName}</td><td className="px-4 py-3">{invoice.propertyName} · {invoice.unitLabel}</td><td className="px-4 py-3">{invoice.billingPeriodLabel || (invoice.billingPeriod.startsWith("MANUAL-") ? "Manual" : invoice.billingPeriod)}</td><td className="px-4 py-3">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-KE") : "—"}</td><td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3">{money.format(invoice.total)}</td><td className="px-4 py-3">{money.format(invoice.amountPaid || 0)}</td><td className="px-4 py-3">{money.format(invoice.balanceDue ?? invoice.total)}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">{invoice.status.replace("_", " ")}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1">{invoice.status === "draft" ? <><button title="Preview draft" aria-label={`Preview ${invoice.invoiceNumber}`} disabled={detailBusy || Boolean(rowBusy)} onClick={() => void previewInvoice(invoice)} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50">{detailBusy ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15}/>}</button><button title="Edit draft" aria-label={`Edit ${invoice.invoiceNumber}`} disabled={detailBusy || Boolean(rowBusy)} onClick={() => void editDraft(invoice)} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50"><Pencil size={15}/></button><button title="Approve, issue and send" aria-label={`Issue ${invoice.invoiceNumber}`} disabled={Boolean(rowBusy)} onClick={() => requestAction(invoice, "issue", { approve: true, send: true, channel: deliveryChannel })} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50">{pendingAction === `${invoice._id}:issue` ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}</button><button title="Cancel draft" aria-label={`Cancel ${invoice.invoiceNumber}`} disabled={Boolean(rowBusy)} onClick={() => requestAction(invoice, "cancel")} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50">{pendingAction === `${invoice._id}:cancel` ? <Loader2 size={15} className="animate-spin"/> : <X size={15}/>}</button></> : invoice.status !== "cancelled" && <><a title="Download PDF" href={`/api/tenant-invoices/${invoice._id}/pdf`} className="rounded-lg p-2 hover:bg-muted"><Download size={15}/></a><button title="Invoice details and payment history" aria-label={`Details for ${invoice.invoiceNumber}`} disabled={detailBusy || Boolean(rowBusy)} onClick={() => void openInvoiceDetails(invoice)} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50">{detailBusy ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15}/>}</button><button title="Add audited credit or charge" onClick={() => setAdjustingInvoice(invoice)} className="rounded-lg p-2 hover:bg-muted"><Plus size={15}/></button><button title="Resend by email" aria-label={`Resend ${invoice.invoiceNumber}`} disabled={Boolean(rowBusy)} onClick={() => requestAction(invoice, "resend", { channel: deliveryChannel })} className="rounded-lg p-2 hover:bg-muted disabled:opacity-50">{pendingAction === `${invoice._id}:resend` ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}</button>{(retryableChannels[invoice._id] || []).map((channel) => <button key={channel} title={`Retry failed ${channel} delivery`} disabled={Boolean(rowBusy)} onClick={() => requestAction(invoice, "retry", { channel })} className="rounded-lg px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/10 disabled:opacity-50">{pendingAction === `${invoice._id}:retry` ? <Loader2 size={13} className="mr-1 inline animate-spin"/> : null}Retry {channel}</button>)}</>}</div></td></tr>; })}</tbody></table></div>}
    </section>
    <p className="text-xs leading-relaxed text-muted-foreground">Invoices describe existing tenant charges and do not create payment transactions or alter the rent payment ledger. Payment status is derived from posted rent, utility and other allocations.</p>
    {manualOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><form onSubmit={createManual} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{editingId ? "Edit invoice draft" : "Create invoice draft"}</h2><button type="button" onClick={() => { setManualOpen(false); setEditingId(null); }} aria-label="Close"><X size={18}/></button></div>{!editingId && <label className="block text-sm">Tenant<select required disabled={tenantsLoading} value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="">{tenantsLoading ? "Loading tenants…" : "Select tenant"}</option>{tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.name} · {tenant.unitType || tenant.houseNumber || "Unit"}</option>)}</select></label>}<label className="block text-sm">Description<input required maxLength={120} value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Repair charge, service fee, etc."/></label><div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm">Quantity<input required type="number" min="0.01" step="0.01" value={chargeQuantity} onChange={(e) => setChargeQuantity(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label><label className="block text-sm">Category<select value={chargeCategory} onChange={(e) => setChargeCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other / service / repair</option></select></label><label className="block text-sm">Amount (KES)<input required type="number" min="0.01" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div>{extraCharges.map((charge, index) => <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_85px_130px_100px_auto]"><input required maxLength={120} aria-label="Charge description" value={charge.description} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Additional charge"/><input required type="number" min="0.01" step="0.01" aria-label="Charge quantity" value={charge.quantity} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"/><input required type="number" min="0.01" step="0.01" aria-label="Charge amount" value={charge.amount} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"/><select aria-label="Charge category" value={charge.category} onChange={(e) => setExtraCharges(extraCharges.map((item, i) => i === index ? { ...item, category: e.target.value } : item))} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other</option></select><button type="button" onClick={() => setExtraCharges(extraCharges.filter((_, i) => i !== index))} aria-label="Remove charge" className="rounded-lg p-2 hover:bg-muted"><X size={16}/></button></div>)}<button type="button" onClick={() => setExtraCharges([...extraCharges, { description: "", quantity: "1", amount: "", category: "other" }])} className="text-sm font-medium text-primary">+ Add another charge</button><label className="block text-sm">Due date<input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => { setManualOpen(false); setEditingId(null); }} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button><button disabled={savingManual} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingManual ? "Saving…" : editingId ? "Update draft" : "Save draft"}</button></div></form></div>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Draft preview</p><h2 className="mt-1 text-lg font-semibold">{preview.tenantName} · {preview.propertyName} · {preview.unitLabel}</h2><p className="mt-1 text-sm text-muted-foreground">{preview.billingPeriodLabel || preview.billingPeriod} · Due {new Date(preview.dueDate).toLocaleDateString("en-KE")}</p></div><button onClick={() => setPreview(null)} aria-label="Close preview" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-5 space-y-2">{(preview.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.description} <span className="text-muted-foreground">× {item.quantity}</span></span><span>{money.format(item.amount / 100)}</span></div>)}<div className="flex justify-between pt-3 text-sm"><span>Total</span><strong>{money.format(preview.total)}</strong></div></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setPreview(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Close</button><button onClick={() => { const target = invoices.find((invoice) => invoice._id === preview._id); setPreview(null); if (target) requestAction(target, "issue", { approve: true, send: true, channel: deliveryChannel }); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Send size={15}/>Approve, issue & email</button></div></section></div>}
    {adjustingInvoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={submitAdjustment} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Audited adjustment</p><h2 className="mt-1 text-lg font-semibold">{adjustingInvoice.invoiceNumber}</h2></div><button type="button" onClick={() => setAdjustingInvoice(null)} aria-label="Close adjustment" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><label className="block text-sm">Description<input required maxLength={120} value={adjustmentDescription} onChange={(event) => setAdjustmentDescription(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Agreed credit, repair charge, etc."/></label><label className="block text-sm">Reason<input required maxLength={300} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="Record the agreement or supporting reason"/></label><div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm">Type<select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="credit">Credit</option><option value="charge">Additional charge</option></select></label><label className="block text-sm">Category<select value={adjustmentCategory} onChange={(event) => setAdjustmentCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"><option value="rent">Rent</option><option value="utilities">Utilities</option><option value="other">Other</option></select></label><label className="block text-sm">Amount (KES)<input required type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div><p className="text-xs text-muted-foreground">The issued invoice lines remain unchanged. This adjustment is recorded separately in its audit history.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setAdjustingInvoice(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button><button disabled={savingManual} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingManual ? "Saving…" : "Record adjustment"}</button></div></form></div>}
    {invoiceDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Invoice detail</p><h2 className="mt-1 text-lg font-semibold">{invoiceDetails.invoice.invoiceNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{invoiceDetails.invoice.tenantName} · {invoiceDetails.invoice.propertyName} · {invoiceDetails.invoice.unitLabel}</p></div><button onClick={() => setInvoiceDetails(null)} aria-label="Close invoice details" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-5 space-y-2">{(invoiceDetails.invoice.displayItems || invoiceDetails.invoice.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.description}</span><span>{money.format(Number(item.amount || 0) / 100)}</span></div>)}<div className="flex justify-between pt-2 text-sm"><span>Total</span><strong>{money.format(invoiceDetails.invoice.total)}</strong></div><div className="flex justify-between text-sm"><span>Paid</span><span>{money.format(invoiceDetails.invoice.amountPaid)}</span></div><div className="flex justify-between text-sm"><span>Outstanding</span><strong>{money.format(invoiceDetails.invoice.balanceDue)}</strong></div></div><h3 className="mt-6 font-semibold">Payment allocations</h3>{invoiceDetails.invoice.paymentAllocations?.length ? <ul className="mt-2 space-y-2">{invoiceDetails.invoice.paymentAllocations.map((item: any, index: number) => <li key={`${item.paymentId}-${index}`} className="rounded-xl border border-border p-3 text-xs"><div className="flex justify-between"><span>{item.reference || `Payment ${String(item.paymentId).slice(-8)}`}</span><span>{new Date(item.occurredAt).toLocaleDateString("en-KE")}</span></div><p className="mt-1 text-muted-foreground">{item.category} · {money.format(item.amountMinor / 100)}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No payment has been allocated to this invoice.</p>}<h3 className="mt-6 font-semibold">Audit history</h3>{invoiceDetails.activity?.length ? <ul className="mt-2 space-y-2">{invoiceDetails.activity.map((entry: any, index: number) => <li key={index} className="flex justify-between rounded-lg border border-border p-3 text-xs"><span className="capitalize">{String(entry.event).replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString("en-KE")}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded.</p>}<div className="mt-5 flex justify-end"><button onClick={() => setInvoiceDetails(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Close</button></div></section></div>}
    {confirmation && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmation(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="invoice-confirm-title" aria-describedby="invoice-confirm-description" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"><AlertTriangle size={21}/></div><h2 id="invoice-confirm-title" className="mt-4 text-lg font-semibold">{confirmation.kind === "bulk" ? "Send these invoices?" : confirmation.action === "issue" ? "Issue and send invoice?" : confirmation.action === "cancel" ? "Cancel this draft?" : confirmation.action === "retry" ? "Retry invoice delivery?" : "Resend this invoice?"}</h2><p id="invoice-confirm-description" className="mt-2 text-sm leading-6 text-muted-foreground">{confirmation.kind === "bulk" ? `This will send ${confirmation.count} visible invoices using ${deliveryChannel === "both" ? "email and SMS" : deliveryChannel}.` : confirmation.action === "issue" ? `This will issue ${confirmation.invoice.invoiceNumber} for ${money.format(confirmation.invoice.total)} and attempt delivery using ${String(confirmation.body?.channel || deliveryChannel)}.` : confirmation.action === "cancel" ? `This will cancel draft ${confirmation.invoice.invoiceNumber}. It will no longer be available to edit or issue.` : `${confirmation.action === "retry" ? "Retry the failed" : "Send"} delivery for ${confirmation.invoice.invoiceNumber} using ${String(confirmation.body?.channel || deliveryChannel)}.`}</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setConfirmation(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">Go back</button><button type="button" onClick={confirmAction} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 ${confirmation.kind === "action" && confirmation.action === "cancel" ? "bg-destructive" : "bg-primary"}`}>{confirmation.kind === "bulk" ? "Send invoices" : confirmation.action === "issue" ? "Issue & send" : confirmation.action === "cancel" ? "Cancel draft" : confirmation.action === "retry" ? "Retry delivery" : "Resend invoice"}</button></div></section></div>}
    {duesPreview && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/55 p-4"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Tenant dues preview</p><h2 className="mt-1 text-lg font-semibold">{duesPreview.tenant.name}</h2><p className="text-sm text-muted-foreground">{duesPreview.property.name} · {duesPreview.property.unit}</p></div><button onClick={() => setDuesPreview(null)} aria-label="Close dues preview" className="rounded-lg p-2 hover:bg-muted"><X size={18}/></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><p className="rounded-lg bg-muted/40 p-3 text-sm">Allocated payments: <strong>{money.format(duesPreview.paymentsAllocatedMinor / 100)}</strong></p><p className="rounded-lg bg-muted/40 p-3 text-sm">Available wallet: <strong>{money.format(duesPreview.walletBalanceMinor / 100)}</strong></p><p className="rounded-lg bg-muted/40 p-3 text-sm">Existing invoice balances: <strong>{money.format(duesPreview.existingInvoiceBalanceMinor / 100)}</strong></p><p className="rounded-lg bg-muted/40 p-3 text-sm">Existing invoices: <strong>{duesPreview.existingInvoiceIds.length}</strong></p></div><div className="mt-4 space-y-2">{duesPreview.obligations.map((item: any) => <div key={item.reference} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm"><span>{item.description} · due {new Date(item.dueDate).toLocaleDateString("en-KE")} · {item.overdueDays} days overdue<br/><small className="text-muted-foreground">Original {money.format(item.originalAmountMinor / 100)} · paid {money.format(item.amountPaidMinor / 100)}</small></span><strong>{money.format(item.outstandingMinor / 100)}</strong></div>)}</div><div className="mt-4 flex justify-between border-t border-border pt-3"><span>Total proposed</span><strong>{money.format(duesPreview.totalMinor / 100)}</strong></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setDuesPreview(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button><button onClick={() => void createDuesDraft()} disabled={duesPreviewLoading || duesPreview.totalMinor <= 0} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{duesPreviewLoading ? "Rechecking…" : "Confirm and create draft"}</button></div></section></div>}
      </main>
    </div>
  </div>;
}
