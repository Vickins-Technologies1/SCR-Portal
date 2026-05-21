"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileText, RefreshCw } from "lucide-react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbReportSummary } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";
import PaymentModal from "@/app/property-owner-dashboard/components/PaymentModal";
import { useAccountTier } from "@/hooks/useAccountTier";
import PremiumGate from "@/components/PremiumGate";

ChartJS.register(BarElement, LinearScale, Title, CategoryScale, Tooltip, Legend);

type AirbnbTrendPoint = {
  label: string;
  total: number;
  direct: number;
  payouts: number;
};

type AirbnbInvoice = {
  _id: string;
  propertyId: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: string;
  description: string;
};

type AirbnbInvoiceEstimate = {
  period: { billingMonth: string; label: string };
  total: number;
  items: Array<{
    propertyId: string;
    propertyName: string;
    billingPlan: string;
    percentage: number;
    expectedIncome: number;
    estimatedAmount: number;
    period?: { start: string; end: string; label: string };
  }>;
};

type AirbnbListing = {
  id: string;
  name: string;
  location?: string;
  status?: string;
};

export default function AirbnbReportsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("reports:view");
  const { isFree } = useAccountTier();
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean } | null>(null);
  const isDue = Boolean(dueStatus?.isDue);
  const [activeTab, setActiveTab] = useState<"reports" | "invoices">("reports");
  const [summary, setSummary] = useState<AirbnbReportSummary | null>(null);
  const [trend, setTrend] = useState<AirbnbTrendPoint[]>([]);
  const [listings, setListings] = useState<AirbnbListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [invoices, setInvoices] = useState<AirbnbInvoice[]>([]);
  const [invoiceEstimate, setInvoiceEstimate] = useState<AirbnbInvoiceEstimate | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isInvoicePaymentOpen, setIsInvoicePaymentOpen] = useState(false);
  const [invoicePaymentPropertyId, setInvoicePaymentPropertyId] = useState<string>("");
  const [invoicePaymentPhone] = useState<string>("");
  const [isInvoiceSyncing, setIsInvoiceSyncing] = useState(false);
  const [hasTriggeredInvoiceSync, setHasTriggeredInvoiceSync] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;

    const fetchDueStatus = async () => {
      try {
        const res = await fetch("/api/owner-dues", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) {
          setDueStatus({ isDue: Boolean(data?.isDue) });
        }
      } catch {
        // ignore
      }
    };

    fetchDueStatus();
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const fetchSummary = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const queryParams = new URLSearchParams();
    queryParams.append("ownerId", ownerId);
    if (startDate) queryParams.append("startDate", startDate);
    if (endDate) queryParams.append("endDate", endDate);
    const res = await fetch(`/api/airbnb/reports?${queryParams.toString()}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setSummary(data.summary);
      setTrend(data.trend || []);
    } else {
      setSummary(null);
      setTrend([]);
    }
    setIsLoading(false);
  }, [ownerId, startDate, endDate]);

  useEffect(() => {
    if (hasAccess) {
      fetchSummary();
    }
  }, [hasAccess, fetchSummary]);

  useEffect(() => {
    setHasTriggeredInvoiceSync(false);
  }, [ownerId]);

  const fetchInvoices = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/invoices?ownerId=${encodeURIComponent(ownerId)}&billingPlan=Airbnb`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      setInvoices(data.invoices || []);
    } else {
      setInvoices([]);
    }
  }, [ownerId]);

  const fetchListings = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/airbnb/listings?ownerId=${encodeURIComponent(ownerId)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      setListings(data.listings || []);
    }
  }, [ownerId]);

  const fetchInvoiceEstimate = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/airbnb/invoices/estimate?ownerId=${encodeURIComponent(ownerId)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.success) {
      setInvoiceEstimate(data);
    } else {
      setInvoiceEstimate(null);
    }
  }, [ownerId]);

  const fetchWalletBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/user", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.user.walletBalance || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshInvoices = useCallback(async () => {
    if (!ownerId || !csrfToken || isInvoiceSyncing) return;
    setIsInvoiceSyncing(true);
    setExportMessage(null);
    try {
      const res = await fetch(`/api/airbnb/invoices/refresh?ownerId=${encodeURIComponent(ownerId)}`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to refresh invoices");
      }
      setExportMessage("Invoices refreshed.");
      await Promise.all([fetchInvoices(), fetchInvoiceEstimate(), fetchWalletBalance(), fetchListings()]);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to refresh invoices.");
    } finally {
      setIsInvoiceSyncing(false);
    }
  }, [ownerId, csrfToken, isInvoiceSyncing, fetchInvoices, fetchInvoiceEstimate, fetchWalletBalance, fetchListings]);

  useEffect(() => {
    if (hasAccess && activeTab === "invoices") {
      if (!hasTriggeredInvoiceSync && ownerId && csrfToken) {
        refreshInvoices();
        setHasTriggeredInvoiceSync(true);
        return;
      }
      fetchInvoices();
      fetchInvoiceEstimate();
      fetchWalletBalance();
      fetchListings();
    }
  }, [
    hasAccess,
    activeTab,
    hasTriggeredInvoiceSync,
    ownerId,
    csrfToken,
    refreshInvoices,
    fetchInvoices,
    fetchInvoiceEstimate,
    fetchWalletBalance,
    fetchListings,
  ]);

  const handleExportCsv = () => {
    if (!summary) {
      setExportMessage("No report data available yet.");
      return;
    }

    const rows = [
      ["Metric", "Value"],
      ["Occupancy Rate (%)", summary.occupancyRate.toString()],
      ["Revenue (KES)", summary.revenue.toString()],
      ["Average Daily Price (KES)", summary.adr.toString()],
      ["Revenue Per Room (KES)", summary.revpar.toString()],
      ["Cancellation Rate (%)", summary.cancellationRate.toString()],
      ["Review Score", summary.reviewScore.toString()],
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `airbnb-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage("Report exported.");
  };

  const handleExportPdf = async () => {
    if (!ownerId) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("ownerId", ownerId);
      if (startDate) queryParams.append("startDate", startDate);
      if (endDate) queryParams.append("endDate", endDate);
      const res = await fetch(`/api/airbnb/reports/pdf?${queryParams.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to export PDF");
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
      link.download = data.filename || "airbnb-tax-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage("PDF report downloaded.");
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to export PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const chartData = useMemo(() => ({
    labels: trend.map((item) => item.label),
    datasets: [
      {
        label: "Direct payments",
        data: trend.map((item) => item.direct),
        backgroundColor: "rgba(30,58,138,0.7)",
        borderRadius: 6,
      },
      {
        label: "Payouts",
        data: trend.map((item) => item.payouts),
        backgroundColor: "rgba(66,199,117,0.7)",
        borderRadius: 6,
      },
    ],
  }), [trend]);

  const paymentModalProperties = useMemo(() => (
    ownerId
      ? listings.map((listing) => ({
          _id: listing.id,
          name: listing.name,
          address: listing.location || "Airbnb",
          unitTypes: [
            {
              uniqueType: listing.id,
              type: "Airbnb",
              price: 0,
              deposit: 0,
              managementType: "RentCollection" as const,
              quantity: 1,
            },
          ],
          ownerId,
          status: listing.status || "active",
          createdAt: new Date().toISOString(),
        }))
      : []
  ), [ownerId, listings]);

  const listingNameMap = useMemo(() => {
    const map = new Map<string, string>();
    listings.forEach((listing) => {
      map.set(listing.id, listing.name);
    });
    return map;
  }, [listings]);

  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

  const applyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(formatDateInput(start));
    setEndDate(formatDateInput(end));
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title={activeTab === "reports" ? "Reports & Analytics" : "Invoices"}
            subtitle="Occupancy, revenue, Average Daily Price, and Revenue Per Room in KES."
            icon={activeTab === "reports" ? BarChart3 : FileText}
            actions={
              isFree ? (
                isDue ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab("invoices")}
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-primary-hover"
                  >
                    Pay invoice
                  </button>
                ) : (
                  <a
                    href="/upgrade"
                    className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
                  >
                    Upgrade
                  </a>
                )
              ) : activeTab === "reports" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold"
                  >
                    <Download size={16} />
                    Export CSV
                  </button>
                  <button
                    onClick={handleExportPdf}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover shadow-sm transition-all text-xs sm:text-sm font-semibold disabled:opacity-60"
                  >
                    <Download size={16} />
                    {isExporting ? "Generating..." : "Export PDF"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={refreshInvoices}
                  disabled={isInvoiceSyncing || !csrfToken}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold disabled:opacity-60"
                >
                  <RefreshCw size={16} className={isInvoiceSyncing ? "animate-spin" : ""} />
                  {!csrfToken ? "Preparing..." : isInvoiceSyncing ? "Syncing invoices..." : "Refresh invoices"}
                </button>
              )
            }
          />

          {isFree && isDue ? (
            <div className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Payment required</p>
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                Your invoice is overdue
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Pay your invoice to regain full access.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("invoices")}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-primary-hover"
              >
                Pay invoice
              </button>
            </div>
          ) : isFree ? (
            <div className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Premium only</p>
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                Reports & invoices analytics are locked on Free tier
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Upgrade to Premium to access exports, statements, and deeper performance reporting.
              </p>
              <a
                href="/upgrade"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
              >
                Upgrade
              </a>
            </div>
          ) : null}

          <PremiumGate
            locked={isFree && !isDue}
            title="Upgrade to unlock reports & invoices"
            message="Free tier hides critical reports, exports, and invoice analytics. Upgrade to Premium for full access."
          >
          <div className="surface-card rounded-2xl px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("reports")}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition ${
                  activeTab === "reports"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                Reports
              </button>
              <button
                onClick={() => setActiveTab("invoices")}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition ${
                  activeTab === "invoices"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                Invoices
              </button>
            </div>
          </div>

          {exportMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              {exportMessage}
            </div>
          )}

          {activeTab === "reports" && (
            <>
              <section className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => applyPreset(7)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                  >
                    Last 7 days
                  </button>
                  <button
                    onClick={() => applyPreset(30)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                  >
                    Last 30 days
                  </button>
                  <button
                    onClick={() => applyPreset(90)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                  >
                    Last 90 days
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-2 w-full border border-border px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">End date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="mt-2 w-full border border-border px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
                    />
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse" />
                  ))
                ) : !summary ? (
                  <div className="surface-card rounded-2xl p-4 sm:p-5 text-xs text-muted-foreground col-span-full">
                    No report data available yet.
                  </div>
                ) : (
                  <>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Occupancy</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{summary.occupancyRate}%</p>
                    </div>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Revenue</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.revenue)}</p>
                    </div>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Average Daily Price</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.adr)}</p>
                    </div>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Revenue Per Room</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{formatKes(summary.revpar)}</p>
                    </div>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Cancellation rate</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{summary.cancellationRate}%</p>
                    </div>
                    <div className="surface-card rounded-2xl p-4 sm:p-5">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Review score</p>
                      <p className="text-lg font-semibold text-foreground mt-2">{summary.reviewScore} ★</p>
                    </div>
                  </>
                )}
              </section>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Revenue trends</h2>
                {trend.length ? (
                  <div className="h-72">
                    <Bar
                      data={chartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                          y: { beginAtZero: true },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground">
                    No trend data available yet.
                  </div>
                )}
              </section>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Owner statements</h2>
                <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                  <p>• Export PDF statements for each property.</p>
                  <p>• Include tax breakdowns and commission splits.</p>
                  <p>• Compatible with KRA and KTRA reporting.</p>
                </div>
              </section>
            </>
          )}

          {activeTab === "invoices" && (
            <>
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="surface-card rounded-2xl p-5 sm:p-6">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">Wallet Balance</h2>
                  <p className="text-xl sm:text-2xl font-semibold text-primary">
                    Ksh {walletBalance !== null ? walletBalance.toFixed(2) : "Loading..."}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Available credit for management fees</p>
                </div>

                <div className="surface-card rounded-2xl p-5 sm:p-6 lg:col-span-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-foreground">Upcoming Invoice Estimate</h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {invoiceEstimate?.period?.label || "Upcoming billing period"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs sm:text-sm text-muted-foreground">Estimated total</p>
                      <p className="text-xl sm:text-2xl font-semibold text-primary">
                        Ksh {invoiceEstimate ? invoiceEstimate.total.toFixed(2) : "—"}
                      </p>
                    </div>
                  </div>

                  {invoiceEstimate?.items?.length ? (
                    <div className="mt-4 space-y-2 text-xs sm:text-sm text-muted-foreground">
                      {invoiceEstimate.items.map((item) => (
                        <div key={item.propertyId} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                          <div>
                            <p className="font-semibold text-foreground">{item.propertyName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.billingPlan} • {item.percentage.toFixed(2)}% • Bookings Ksh {item.expectedIncome.toFixed(2)}
                              {item.period?.label ? ` • ${item.period.label}` : ""}
                            </p>
                          </div>
                          <div className="text-right font-semibold text-foreground">
                            Ksh {item.estimatedAmount.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 text-xs sm:text-sm text-muted-foreground">
                      No estimate available yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="table-shell">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Listing</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th>Amount (KES)</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted-foreground py-6">
                            No invoices found.
                          </td>
                        </tr>
                      ) : (
                        invoices.map((invoice) => (
                          <tr key={invoice._id}>
                            <td>{listingNameMap.get(invoice.propertyId) || "Airbnb Listing"}</td>
                            <td>{invoice.reference}</td>
                            <td>{invoice.description}</td>
                            <td>Ksh {Number(invoice.amount || 0).toFixed(2)}</td>
                            <td>{new Date(invoice.createdAt).toLocaleDateString()}</td>
                            <td>{invoice.status}</td>
                            <td>
                              {invoice.status === "pending" ? (
                                <button
                                  onClick={() => {
                                    setInvoicePaymentPropertyId(invoice.propertyId);
                                    setIsInvoicePaymentOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition"
                                >
                                  Pay Now
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          </PremiumGate>
        </main>
      </div>

      <PaymentModal
        isOpen={isInvoicePaymentOpen}
        onClose={() => setIsInvoicePaymentOpen(false)}
        onSuccess={() => {
          setIsInvoicePaymentOpen(false);
          fetchInvoices();
          fetchWalletBalance();
          fetchInvoiceEstimate();
        }}
        onError={(message) => setExportMessage(message)}
        properties={paymentModalProperties}
        initialPropertyId={invoicePaymentPropertyId}
        initialPhone={invoicePaymentPhone}
        userId={ownerId}
        billingPlan="Airbnb"
      />
    </div>
  );
}
