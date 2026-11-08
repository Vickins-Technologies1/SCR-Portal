"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck,
  Download, History, LoaderCircle, RefreshCw, Search, ShieldCheck, Wallet,
} from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

type Proposal = {
  paymentId: string;
  reference: string | null;
  date: string | null;
  amount: number;
  previousAllocation: Record<string, number> | null;
  proposedAllocation: Record<string, number>;
  allocationChanges: string[];
  walletDebitToPost: number;
  walletAllocation: Record<string, number>;
};

type ReconciliationItem = {
  tenantId: string;
  landlordId: string | null;
  propertyId: string | null;
  tenantName: string;
  propertyName: string;
  unit: string;
  currentWalletBalance: number;
  expectedWalletBalance: number;
  existingWalletCredits: number;
  existingWalletDebits: number;
  verifiedPaymentAmount: number;
  totalPaymentAllocationAmount: number;
  outstandingRent: number;
  outstandingUtilities: number;
  eligibleDeposit: number;
  otherEligibleCharges: number;
  eligibleOutstanding: number;
  potentiallyMisallocatedAmount: number;
  walletAmountToAllocate: number;
  verifiedPaymentCount: number;
  unallocatedVerifiedPaymentCount: number;
  pendingPaymentCount: number;
  reversedOrRefundedPaymentCount: number;
  duplicatePaymentCount: number;
  allocationMismatchCount: number;
  walletBalanceMismatch: boolean;
  issues: string[];
  proposals: Proposal[];
  status: "requires_review" | "ready" | "reconciled" | "no_action" | "failed";
  previewHash: string;
  blockingIssues: string[];
};

type PropertyOption = { id: string; name: string; landlordId: string };
type LandlordOption = { id: string; name: string };
type HistoryItem = {
  reconciliationId: string;
  tenantId: string;
  tenantName?: string;
  propertyName?: string;
  unit?: string;
  status: string;
  actorRole?: string;
  executedAt?: string;
  createdAt?: string;
  before?: Record<string, number>;
  after?: Record<string, number>;
  proposals?: Proposal[];
  paymentReferences?: string[];
  failureReason?: string;
  allocationPolicyVersion?: string;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  items?: ReconciliationItem[];
  history?: HistoryItem[];
  properties?: PropertyOption[];
  landlords?: LandlordOption[];
  canExecute?: boolean;
  truncated?: boolean;
  summary?: {
    tenants: number;
    walletBalances: number;
    eligibleOutstanding: number;
    potentiallyMisallocated: number;
    unallocatedVerifiedPayments: number;
    reconciled: number;
    failed: number;
  };
};

const money = (value: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const issueLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
const statusLabel: Record<ReconciliationItem["status"], string> = {
  requires_review: "Requires review",
  ready: "Ready to reconcile",
  reconciled: "Reconciled",
  no_action: "No action required",
  failed: "Failed",
};

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status: ReconciliationItem["status"] | string }) {
  const styles = status === "ready" || status === "succeeded"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : status === "requires_review" || status === "failed"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : status === "reconciled"
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${styles}`}>{statusLabel[status as ReconciliationItem["status"]] || issueLabel(status)}</span>;
}

export default function PaymentReconciliationDashboard({ detailHrefBase }: { detailHrefBase: string }) {
  const { csrfToken, ensureCsrf } = useCsrfToken();
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [landlords, setLandlords] = useState<LandlordOption[]>([]);
  const [summary, setSummary] = useState<ApiResponse["summary"]>();
  const [canExecute, setCanExecute] = useState(false);
  const [activeTab, setActiveTab] = useState<"analysis" | "history">("analysis");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [filterDraft, setFilterDraft] = useState({
    search: "", unit: "", propertyId: "", landlordId: "", startDate: "", endDate: "", paymentMethod: "", status: "all",
  });
  const [filters, setFilters] = useState(filterDraft);

  const load = useCallback(async (tab: "analysis" | "history" = activeTab) => {
    setLoading(true);
    setNotice(null);
    const query = new URLSearchParams();
    if (tab === "history") query.set("view", "history");
    if (isAdmin && filters.landlordId) query.set("landlordId", filters.landlordId);
    for (const key of ["search", "unit", "propertyId", "startDate", "endDate", "paymentMethod", "status"] as const) {
      const value = filters[key];
      if (value && !(key === "status" && value === "all")) query.set(key, value);
    }
    try {
      const response = await fetch(`/api/admin/payment-reconciliation?${query.toString()}`, { credentials: "include" });
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load reconciliation data.");
      setCanExecute(!!data.canExecute);
      if (tab === "history") setHistory(data.history || []);
      else {
        setItems(data.items || []);
        setProperties(data.properties || []);
        setLandlords(data.landlords || []);
        setSummary(data.summary);
        setTruncated(!!data.truncated);
        setSelected([]);
        setExpandedId(null);
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load reconciliation data." });
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, isAdmin]);

  useEffect(() => { void load(activeTab); }, [load, activeTab]);
  useEffect(() => { setIsAdmin(["admin", "adminTeamMember"].includes(Cookies.get("role") || "")); }, []);

  const readyItems = useMemo(() => items.filter((item) => item.status === "ready" && item.blockingIssues.length === 0), [items]);
  const selectedItems = useMemo(() => items.filter((item) => selected.includes(item.tenantId)), [items, selected]);

  const toggleSelected = (tenantId: string) => {
    setSelected((current) => current.includes(tenantId) ? current.filter((id) => id !== tenantId) : [...current, tenantId]);
  };

  const selectAllReady = () => {
    setSelected((current) => current.length === readyItems.length ? [] : readyItems.map((item) => item.tenantId));
  };

  const exportAnalysis = () => downloadCsv("payment-reconciliation-preview.csv", [
    ["Tenant", "Property", "Unit", "Status", "Current wallet", "Eligible dues", "Potentially misallocated", "Expected wallet", "Rent outstanding", "Utility outstanding", "Deposit outstanding", "Verified payments", "Unallocated verified", "Pending payments", "Reasons"],
    ...items.map((item) => [item.tenantName, item.propertyName, item.unit, statusLabel[item.status], item.currentWalletBalance, item.eligibleOutstanding, item.potentiallyMisallocatedAmount, item.expectedWalletBalance, item.outstandingRent, item.outstandingUtilities, item.eligibleDeposit, item.verifiedPaymentCount, item.unallocatedVerifiedPaymentCount, item.pendingPaymentCount, item.issues.map(issueLabel).join("; ")]),
  ]);

  const exportHistory = () => downloadCsv("payment-reconciliation-history.csv", [
    ["Reconciliation ID", "Tenant", "Property", "Unit", "Status", "Executed at", "Executed by role", "Previous wallet", "New wallet", "Payment references", "Failure reason"],
    ...history.map((entry) => [entry.reconciliationId, entry.tenantName || "", entry.propertyName || "", entry.unit || "", entry.status, entry.executedAt || entry.createdAt || "", entry.actorRole || "", entry.before?.walletBalance ?? "", entry.after?.walletBalance ?? "", (entry.paymentReferences || []).join("; "), entry.failureReason || ""]),
  ]);

  const executeSelected = async () => {
    const token = csrfToken || await ensureCsrf();
    if (!canExecute || !token || selectedItems.length === 0) return;
    setBusy(true);
    setConfirmationOpen(false);
    setNotice({ kind: "info", text: `Reconciling ${selectedItems.length} tenant${selectedItems.length === 1 ? "" : "s"}…` });
    const operationKey = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `reconcile${Date.now()}${Math.random().toString(16).slice(2)}`;
    try {
      const response = await fetch("/api/admin/payment-reconciliation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({
          action: "execute",
          idempotencyKey: operationKey,
          landlordId: isAdmin ? filters.landlordId || undefined : undefined,
          items: selectedItems.map((item) => ({ tenantId: item.tenantId, previewHash: item.previewHash })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Reconciliation did not complete.");
      const succeeded = (data.results || []).filter((result: any) => result.status === "succeeded" || result.status === "no_action").length;
      const failed = data.results?.length - succeeded;
      const details = (data.results || []).filter((result: any) => result.status !== "succeeded" && result.status !== "no_action")
        .map((result: any) => `${result.tenantId}: ${result.failureReason || result.status}`).join(" • ");
      const resultNotice = {
        kind: failed ? "error" : "success",
        text: `${succeeded} completed${failed ? `; ${failed} need attention${details ? ` — ${details}` : ""}` : "."}`,
      } as const;
      await load("analysis");
      setNotice(resultNotice);
    } catch (error) {
      await load("analysis");
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Reconciliation did not complete." });
    } finally {
      setBusy(false);
    }
  };

  const applyFilters = () => {
    setFilters({ ...filterDraft });
    setActiveTab("analysis");
  };

  const openHistory = () => {
    setActiveTab("history");
  };

  const openAnalysis = () => {
    setActiveTab("analysis");
  };

  const runConfirmation = async () => {
    await executeSelected();
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 py-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Financial management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Payment reconciliation</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review verified tenant payments against current eligible dues. Previews use the established deposit, rent, utility allocation service and never include pending or reversed funds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load(activeTab)} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh preview
          </button>
          <button onClick={activeTab === "analysis" ? exportAnalysis : exportHistory} disabled={activeTab === "analysis" ? items.length === 0 : history.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{notice.text}</div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-7">
        {[
          { label: "Needs review", value: summary?.tenants ?? items.filter((item) => item.status === "ready" || item.status === "requires_review").length, icon: <ClipboardCheck size={17} /> },
          { label: "Wallet balances", value: money(summary?.walletBalances ?? items.reduce((total, item) => total + item.currentWalletBalance, 0)), icon: <Wallet size={17} /> },
          { label: "Eligible dues", value: money(summary?.eligibleOutstanding ?? items.reduce((total, item) => total + item.eligibleOutstanding, 0)), icon: <ArrowRight size={17} /> },
          { label: "Potentially misallocated", value: money(summary?.potentiallyMisallocated ?? items.reduce((total, item) => total + item.potentiallyMisallocatedAmount, 0)), icon: <AlertTriangle size={17} /> },
          { label: "Unallocated verified", value: summary?.unallocatedVerifiedPayments ?? items.reduce((total, item) => total + item.unallocatedVerifiedPaymentCount, 0), icon: <ShieldCheck size={17} /> },
          { label: "Reconciled", value: summary?.reconciled ?? items.filter((item) => item.status === "reconciled").length, icon: <CheckCircle2 size={17} /> },
          { label: "Failed operations", value: summary?.failed ?? 0, icon: <AlertTriangle size={17} /> },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-[11px] font-semibold">{card.label}</span><span className="text-primary">{card.icon}</span></div>
            <div className="mt-2 truncate text-lg font-bold text-foreground">{card.value}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="flex gap-2" role="tablist" aria-label="Reconciliation views">
            <button onClick={openAnalysis} role="tab" aria-selected={activeTab === "analysis"} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === "analysis" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>Analysis & preview</button>
            <button onClick={openHistory} role="tab" aria-selected={activeTab === "history"} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === "history" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><History size={14} /> Reconciliation history</button>
          </div>
          {activeTab === "analysis" && <div className="flex flex-wrap items-center gap-2">
            {canExecute && <button onClick={selectAllReady} disabled={readyItems.length === 0 || busy} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">{selected.length === readyItems.length && readyItems.length > 0 ? "Clear selection" : "Select ready tenants"}</button>}
            {canExecute && <button onClick={() => setConfirmationOpen(true)} disabled={selectedItems.length === 0 || busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-45">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Reconcile selected ({selectedItems.length})
            </button>}
          </div>}
        </div>

        {activeTab === "analysis" ? <>
          <div className="grid grid-cols-1 gap-2 border-b border-border/70 bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="relative block"><Search size={14} className="absolute left-3 top-3 text-muted-foreground" /><input value={filterDraft.search} onChange={(event) => setFilterDraft({ ...filterDraft, search: event.target.value })} placeholder="Tenant name or contact" className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30" /></label>
            <input value={filterDraft.unit} onChange={(event) => setFilterDraft({ ...filterDraft, unit: event.target.value })} placeholder="Unit" className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={filterDraft.propertyId} onChange={(event) => setFilterDraft({ ...filterDraft, propertyId: event.target.value })} className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            {isAdmin ? <select value={filterDraft.landlordId} onChange={(event) => setFilterDraft({ ...filterDraft, landlordId: event.target.value, propertyId: "" })} className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"><option value="">All landlords</option>{landlords.map((landlord) => <option key={landlord.id} value={landlord.id}>{landlord.name}</option>)}</select> : <input value={filterDraft.paymentMethod} onChange={(event) => setFilterDraft({ ...filterDraft, paymentMethod: event.target.value })} placeholder="Payment method" className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30" />}
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"><span className="shrink-0 text-[10px] text-muted-foreground">From</span><input aria-label="Payment date from" type="date" value={filterDraft.startDate} onChange={(event) => setFilterDraft({ ...filterDraft, startDate: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"><span className="shrink-0 text-[10px] text-muted-foreground">To</span><input aria-label="Payment date to" type="date" value={filterDraft.endDate} onChange={(event) => setFilterDraft({ ...filterDraft, endDate: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
            <select value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value })} className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"><option value="all">All statuses</option><option value="requires_review">Requires review</option><option value="ready">Ready to reconcile</option><option value="reconciled">Reconciled</option><option value="no_action">No action required</option><option value="failed">Failed</option></select>
            {!isAdmin && <input value={filterDraft.paymentMethod} onChange={(event) => setFilterDraft({ ...filterDraft, paymentMethod: event.target.value })} placeholder="Payment method" className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30" />}
            <button onClick={applyFilters} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10"><Search size={14} /> Apply filters</button>
          </div>

          {truncated && <div className="border-b border-border/70 bg-amber-50 px-4 py-2 text-xs text-amber-800">Showing the first 250 tenants in this scope. Add a property, unit, or tenant filter to narrow the preview.</div>}
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle size={18} className="animate-spin" /> Building reconciliation preview…</div> : items.length === 0 ? <div className="py-16 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-semibold text-foreground">No tenants match these filters</p><p className="mt-1 text-xs text-muted-foreground">The analysis only counts verified payments and currently eligible obligations.</p></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-left text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="w-10 px-4 py-3"></th><th className="px-4 py-3">Tenant / property</th><th className="px-4 py-3 text-right">Current wallet</th><th className="px-4 py-3 text-right">Eligible dues</th><th className="px-4 py-3 text-right">Misallocated</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-border/70">
                  {items.map((item) => <Fragment key={item.tenantId}>
                    <tr key={item.tenantId} className="hover:bg-muted/20">
                      <td className="px-4 py-3 align-top">
                        {canExecute && item.status === "ready" && <input type="checkbox" aria-label={`Select ${item.tenantName}`} checked={selected.includes(item.tenantId)} onChange={() => toggleSelected(item.tenantId)} className="mt-1 accent-primary" />}
                      </td>
                      <td className="px-4 py-3"><button onClick={() => setExpandedId(expandedId === item.tenantId ? null : item.tenantId)} className="group text-left"><span className="font-semibold text-foreground group-hover:text-primary">{item.tenantName}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.propertyName} · {item.unit}</span></button></td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(item.currentWalletBalance)}{item.walletBalanceMismatch && <span className="ml-1 text-amber-600" title="Cached wallet differs from the payment ledger">†</span>}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(item.eligibleOutstanding)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">{money(item.potentiallyMisallocatedAmount)}</td>
                      <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                    </tr>
                    {expandedId === item.tenantId && <tr key={`${item.tenantId}-detail`}><td colSpan={6} className="bg-muted/15 px-5 py-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                        <div className="space-y-3">
                          <h3 className="font-semibold text-foreground">Why this tenant is listed</h3>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Rent outstanding</span><strong className="mt-1 block">{money(item.outstandingRent)}</strong></div>
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Utilities outstanding</span><strong className="mt-1 block">{money(item.outstandingUtilities)}</strong></div>
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Eligible deposit</span><strong className="mt-1 block">{money(item.eligibleDeposit)}</strong></div>
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Expected wallet</span><strong className="mt-1 block">{money(item.expectedWalletBalance)}</strong></div>
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Wallet credits / debits</span><strong className="mt-1 block">{money(item.existingWalletCredits)} / {money(item.existingWalletDebits)}</strong></div>
                            <div className="rounded-lg bg-card p-3"><span className="text-muted-foreground">Verified / allocated</span><strong className="mt-1 block">{money(item.verifiedPaymentAmount)} / {money(item.totalPaymentAllocationAmount)}</strong></div>
                          </div>
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <p>Verified payments: {item.verifiedPaymentCount} · unallocated: {item.unallocatedVerifiedPaymentCount}</p>
                            <p>Pending excluded: {item.pendingPaymentCount} · reversed/refunded excluded: {item.reversedOrRefundedPaymentCount}</p>
                          </div>
                          {item.issues.length > 0 && <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">{item.issues.map((issue) => <li key={issue}>• {issueLabel(issue)}</li>)}</ul>}
                          {item.blockingIssues.length > 0 && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">Execution is blocked pending review: {item.blockingIssues.map(issueLabel).join(", ")}</p>}
                        </div>
                        <div>
                          <h3 className="mb-2 font-semibold text-foreground">Proposed allocation details</h3>
                          {item.proposals.length === 0 ? <p className="rounded-lg bg-card p-4 text-xs text-muted-foreground">No payment allocation changes are proposed. The analysis will leave valid wallet credit in place.</p> : <div className="space-y-2">
                            {item.proposals.map((proposal) => <div key={proposal.paymentId} className="rounded-xl border border-border/70 bg-card p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-xs">{proposal.reference || `Payment ${proposal.paymentId.slice(-8)}`}</strong><span className="ml-2 text-[10px] text-muted-foreground">{dateLabel(proposal.date)}</span></div><span className="font-semibold tabular-nums">{money(proposal.amount)}</span></div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                                {(["deposit", "rent", "utilities", "other", "walletCredit"] as const).filter((field) => Number(proposal.proposedAllocation[field] || 0) > 0).map((field) => <span key={field} className="rounded-full bg-muted px-2 py-1">{field === "walletCredit" ? "Wallet retained" : issueLabel(field)} {money(Number(proposal.proposedAllocation[field] || 0))}</span>)}
                                {proposal.walletDebitToPost > 0 && <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">Original wallet credit applied {money(proposal.walletDebitToPost)}{Object.entries(proposal.walletAllocation || {}).filter(([, amount]) => Number(amount) > 0).map(([field, amount]) => ` · ${issueLabel(field)} ${money(Number(amount))}`).join("")}</span>}
                              </div>
                            </div>)}
                          </div>}
                          <p className="mt-3 text-[10px] text-muted-foreground">Allocation order follows the current payment allocator. Money remains in the wallet after all eligible obligations are satisfied.</p>
                        </div>
                      </div>
                    </td></tr>}
                  </Fragment>)}
                </tbody>
              </table>
            </div>
          )}
        </> : (
          loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle size={18} className="animate-spin" /> Loading reconciliation history…</div> : history.length === 0 ? <div className="py-16 text-center"><History className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">No reconciliation history in this scope</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Reconciliation</th><th className="px-4 py-3">Tenant / property</th><th className="px-4 py-3">Executed</th><th className="px-4 py-3">Wallet</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y divide-border/70">{history.map((entry) => <tr key={entry.reconciliationId} className="align-top"><td className="px-4 py-3 font-mono text-[10px]">{entry.reconciliationId.slice(0, 12)}…</td><td className="px-4 py-3"><strong>{entry.tenantName || entry.tenantId}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{entry.propertyName || "Property"} · {entry.unit || "—"}</span></td><td className="px-4 py-3">{dateLabel(entry.executedAt || entry.createdAt)}<span className="mt-1 block text-[10px] text-muted-foreground">{entry.actorRole || "—"}</span></td><td className="px-4 py-3">{money(entry.before?.walletBalance || 0)} <ArrowRight size={12} className="inline" /> {money(entry.after?.walletBalance || 0)}</td><td className="px-4 py-3"><StatusPill status={entry.status} />{entry.failureReason && <span className="mt-1 block max-w-[180px] text-[10px] text-rose-700">{entry.failureReason}</span>}</td><td className="px-4 py-3"><Link href={`${detailHrefBase}/${entry.reconciliationId}`} className="font-semibold text-primary hover:underline">View {entry.proposals?.length || 0} allocations</Link><span className="mt-1 block max-w-[220px] text-[10px] text-muted-foreground">{entry.paymentReferences?.join(", ") || "No payment references"}</span></td></tr>)}</tbody></table></div>
        )}
      </section>

      {confirmationOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmationOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="reconcile-confirm-title" className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-800"><AlertTriangle size={20} /></div><div><h2 id="reconcile-confirm-title" className="text-lg font-bold">Confirm reconciliation</h2><p className="mt-1 text-xs text-muted-foreground">Each tenant is re-read and recalculated immediately before execution. A tenant whose records changed since preview will be skipped for review.</p></div></div>
          <div className="mt-4 rounded-xl bg-muted/40 p-4 text-xs"><strong>{selectedItems.length} tenant{selectedItems.length === 1 ? "" : "s"} selected</strong><div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground"><span>Wallet adjustments</span><b className="text-foreground">{money(selectedItems.reduce((total, item) => total + item.potentiallyMisallocatedAmount, 0))}</b><span>Eligible dues</span><b className="text-foreground">{money(selectedItems.reduce((total, item) => total + item.eligibleOutstanding, 0))}</b></div></div>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setConfirmationOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-muted">Cancel</button><button onClick={() => void runConfirmation()} disabled={busy || !canExecute} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Confirm and reconcile</button></div>
        </section>
      </div>}
    </main>
  );
}
