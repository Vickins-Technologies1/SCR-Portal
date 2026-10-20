"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Download,
  AlertCircle,
  RefreshCw,
  X,
  FileText,
  Send,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/cn";

interface PropertyOwner {
  _id: string;
  email: string;
  name: string;
  phone: string;
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
}

interface InvoiceTransaction {
  _id: string;
  userId: string;
  propertyId: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  reference: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  description?: string;
  billingPlan?: string;
  percentage?: number;
  expectedIncome?: number;
  amountPaid?: number;
  balanceDue?: number;
  invoiceStatus?: string;
  dueDate?: string;
  latestPaymentMethod?: string | null;
  latestPaymentReference?: string | null;
}

type ManualPaymentDraft = { invoice: InvoiceTransaction; idempotencyKey: string };

export default function BillingPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<InvoiceTransaction[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<InvoiceTransaction[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [isSendingInvoice, setIsSendingInvoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualPayment, setManualPayment] = useState<ManualPaymentDraft | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("other");
  const [manualReference, setManualReference] = useState("");
  const [manualPaymentDate, setManualPaymentDate] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [isRecordingManualPayment, setIsRecordingManualPayment] = useState(false);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success" | "info";
    id: number;
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "error" | "success" | "info" = "info") => {
      const id = Date.now();
      setToast({ message, type, id });
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
    },
    []
  );

  const [filters, setFilters] = useState({
    ownerEmail: "",
    propertyName: "",
    billingPlan: "",
    status: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ── Session check + CSRF ────────────────────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session check failed");

      const data = await res.json();

      if (!data.authenticated) {
        throw new Error("Not authenticated");
      }

      const csrfRes = await fetch("/api/csrf-token", {
        credentials: "include",
        cache: "no-store",
      });

      if (csrfRes.ok) {
        const csrfData = await csrfRes.json();
        if (csrfData.csrfToken) {
          setCsrfToken(csrfData.csrfToken);
        }
      }

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      showToast("Session expired or invalid. Redirecting...", "error");
      setTimeout(() => router.replace("/admin/login?session=expired"), 1200);
    }
  }, [router, showToast]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const [pRes, oRes, prRes] = await Promise.all([
        fetch(`/api/invoices`, {
          credentials: "include",
        }),
        fetch("/api/admin/property-owners", { credentials: "include" }),
        fetch("/api/admin/properties", { credentials: "include" }),
      ]);

      if (
        pRes.status === 401 || pRes.status === 403 ||
        oRes.status === 401 || oRes.status === 403 ||
        prRes.status === 401 || prRes.status === 403
      ) {
        showToast("Session expired. Please log in again.", "error");
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!pRes.ok || !oRes.ok || !prRes.ok) {
        throw new Error("One or more requests failed");
      }

      const [pData, oData, prData] = await Promise.all([
        pRes.json(),
        oRes.json(),
        prRes.json(),
      ]);

      setPayments(pData.invoices || []);
      setFilteredPayments(pData.invoices || []);
      setPropertyOwners(oData.propertyOwners || []);
      setProperties(prData.properties || []);

      showToast("Invoices & data loaded", "success");
    } catch (err) {
      console.error("Data fetch error:", err);
      setError("Failed to load invoice transactions. Please try again.");
      showToast("Failed to load data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [status, router, showToast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, fetchData]);

  // ── Filtering logic ──────────────────────────────────────────────────────
  useEffect(() => {
    let filtered = [...payments];

    if (filters.ownerEmail) {
      const owner = propertyOwners.find((o) => o.email === filters.ownerEmail);
      if (owner) {
        filtered = filtered.filter((p) => p.userId === owner._id);
      }
    }

    if (filters.propertyName) {
      const search = filters.propertyName.toLowerCase();
      filtered = filtered.filter((p) => {
        const prop = properties.find((pr) => pr._id === p.propertyId);
        return prop?.name?.toLowerCase().includes(search);
      });
    }

    if (filters.billingPlan) {
      filtered = filtered.filter((p) => (p.billingPlan || "Unknown") === filters.billingPlan);
    }

    if (filters.status) {
      filtered = filtered.filter((p) => p.status === filters.status);
    }

    setFilteredPayments(filtered);
    setCurrentPage(1);
  }, [filters, payments, propertyOwners, properties]);

  // ── Export Excel ─────────────────────────────────────────────────────────
  const generateExcel = async (ownerId: string) => {
    if (!ownerId) return;

    setIsExporting(true);
    try {
      const res = await fetch("/api/invoices/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ownerId }),
      });

      if (res.status === 401 || res.status === 403) {
        showToast("Session expired. Please log in again.", "error");
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Export failed");
      }

      const data = await res.json();

      if (data.excel) {
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.excel}`;
        link.download = data.filename || `invoice-transactions-${ownerId.slice(-6)}.xlsx`;
        link.click();
        showToast("Excel file downloaded", "success");
      } else {
        showToast("No invoice transactions found for export", "info");
      }
    } catch (err) {
      console.error("Export error:", err);
      showToast("Export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const handleGenerateInvoice = useCallback(
    async (invoice: InvoiceTransaction) => {
      if (!csrfToken) {
        setError("Security token missing. Please refresh.");
        return;
      }

      setIsGenerating(invoice._id);
      try {
        const res = await fetch("/api/invoices/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ invoiceId: invoice._id }),
        });

        if (res.status === 401 || res.status === 403) {
          setError("Session expired. Redirecting...");
          router.replace("/admin/login?session=expired");
          return;
        }

        const data = await res.json();

        if (data.success && data.pdf) {
          const link = document.createElement("a");
          link.href = `data:application/pdf;base64,${data.pdf}`;
          link.download = `invoice-${invoice._id}.pdf`;
          link.click();
        } else {
          setError(data.message || "Failed to generate invoice PDF.");
        }
      } catch {
        setError("Failed to connect to server.");
      } finally {
        setIsGenerating(null);
      }
    },
    [csrfToken, router]
  );

  const handleSendInvoiceEmail = useCallback(
    async (invoice: InvoiceTransaction) => {
      if (!csrfToken) {
        setError("Security token missing. Please refresh.");
        return;
      }

      setIsSendingInvoice(invoice._id);
      try {
        const res = await fetch("/api/admin/invoices/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ invoiceId: invoice._id }),
        });

        if (res.status === 401 || res.status === 403) {
          setError("Session expired. Redirecting...");
          router.replace("/admin/login?session=expired");
          return;
        }

        const data = await res.json().catch(() => ({} as any));
        if (res.ok && data.success) {
          showToast("Invoice email sent to owner.", "success");
        } else {
          setError(data.message || "Failed to send invoice email.");
        }
      } catch {
        setError("Failed to connect to server.");
      } finally {
        setIsSendingInvoice(null);
      }
    },
    [csrfToken, router, showToast]
  );

  const openManualPayment = (invoice: InvoiceTransaction) => {
    setManualPayment({ invoice, idempotencyKey: crypto.randomUUID() });
    setManualAmount(String(invoice.balanceDue ?? Math.max(0, invoice.amount - (invoice.amountPaid || 0))));
    setManualMethod("other");
    setManualReference("");
    setManualPaymentDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setManualNote("");
    setManualConfirmed(false);
  };

  const submitManualPayment = async () => {
    if (!manualPayment || !csrfToken || !manualConfirmed || isRecordingManualPayment) return;
    setIsRecordingManualPayment(true);
    try {
      const response = await fetch("/api/admin/invoices/manual-payment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          invoiceId: manualPayment.invoice._id,
          idempotencyKey: manualPayment.idempotencyKey,
          amount: Number(manualAmount),
          method: manualMethod,
          reference: manualReference,
          paymentDate: new Date(manualPaymentDate).toISOString(),
          note: manualNote,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to record the payment.");
      setManualPayment(null);
      showToast("Manual payment recorded. Invoice balances refreshed.", "success");
      await fetchData();
    } catch (submitError) {
      showToast(submitError instanceof Error ? submitError.message : "Unable to record the payment.", "error");
    } finally {
      setIsRecordingManualPayment(false);
    }
  };

  // ── Update status ────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(
    async (invoiceId: string, newStatus: "pending" | "completed" | "failed") => {
      if (!csrfToken) {
        setError("Security token missing. Please refresh.");
        return;
      }

      const invoice = payments.find((inv) => inv._id === invoiceId);
      if (!invoice) {
        setError("Invoice not found.");
        return;
      }

      try {
        const res = await fetch("/api/invoices/update-status", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            invoiceId,
            amount: invoice.amount,
            status: newStatus,
            description: invoice.description,
          }),
        });

        if (res.status === 401 || res.status === 403) {
          setError("Session expired. Redirecting...");
          router.replace("/admin/login?session=expired");
          return;
        }

        const data = await res.json();

        if (data.success) {
          setPayments((prev) =>
            prev.map((inv) =>
              inv._id === invoiceId
                ? {
                    ...inv,
                    status: data.invoice.status,
                    amount: data.invoice.amount,
                    description: data.invoice.description,
                    updatedAt: data.invoice.updatedAt,
                  }
                : inv
            )
          );
        } else {
          setError(data.message || "Failed to update status.");
        }
      } catch {
        setError("Failed to connect to server.");
      }
    },
    [csrfToken, payments, router]
  );

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginated = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ── Rendering ────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div aria-hidden="true" className="loading-skeleton h-4 w-32 rounded-md" />
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Payments & Invoices</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Track invoice transactions, update status, and generate PDFs.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Toast */}
          {toast && (
            <div className="fixed top-5 right-5 z-50 max-w-sm">
              <motion.div
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-white text-xs font-medium ${
                  toast.type === "error"
                    ? "bg-red-600"
                    : toast.type === "success"
                    ? "bg-primary"
                    : "bg-foreground"
                }`}
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{toast.message}</span>
                <button onClick={() => setToast(null)} className="text-white/90 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchData();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Export Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-card rounded-2xl p-4 lg:p-5 mb-6"
          >
            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Download className="text-primary h-5 w-5" />
              Export Invoice Transactions
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                disabled={isExporting || isLoading}
                className="w-full sm:w-80 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-xs text-foreground bg-white/70"
              >
                <option value="">Select Property Owner...</option>
                {propertyOwners.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.name} — {o.email}
                  </option>
                ))}
              </select>

              {selectedOwnerId && (
                <button
                  onClick={() => generateExcel(selectedOwnerId)}
                  disabled={isExporting || isLoading}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2 bg-primary text-white text-xs font-medium rounded-md hover:bg-primary-hover transition-all shadow-md min-w-[180px] ${
                    isExporting ? "opacity-70 cursor-wait" : ""
                  }`}
                >
                  {isExporting ? (
                    <>

                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Export Selected Owner
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>

          {/* Filters Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="surface-card rounded-2xl p-4 lg:p-5 mb-6"
          >
            <h3 className="text-base font-semibold text-foreground mb-4">Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={filters.ownerEmail}
                onChange={(e) => setFilters({ ...filters, ownerEmail: e.target.value })}
                className="px-3 py-2 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
              >
                <option value="">All Owners</option>
                {propertyOwners.map((o) => (
                  <option key={o._id} value={o.email}>
                    {o.email}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search property name..."
                value={filters.propertyName}
                onChange={(e) => setFilters({ ...filters, propertyName: e.target.value })}
                className="px-3 py-2 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
              />

              <select
                value={filters.billingPlan}
                onChange={(e) => setFilters({ ...filters, billingPlan: e.target.value })}
                className="px-3 py-2 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
              >
                <option value="">All Billing Plans</option>
                <option value="FullManagement">Full Management</option>
                <option value="RentCollection">Software Leasing</option>
                <option value="Unknown">Unknown</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="px-3 py-2 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
              >
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </motion.div>

          {/* Table / Loading / Empty */}
          {isLoading ? (
            <div className="grid gap-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="surface-card rounded-2xl h-24 animate-pulse"
                />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center">
              <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-foreground mb-2">
                No Invoice Transactions Found
              </h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-md mx-auto">
                No invoice transactions match the selected filters or no data is available yet.
              </p>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition shadow-md text-xs font-medium"
              >
                <RefreshCw size={20} />
                Refresh Data
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="table-shell table-compact"
            >
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Invoice Ref
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Owner
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Property
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((p) => {
                      const prop = properties.find((pr) => pr._id === p.propertyId);
                      const owner = propertyOwners.find((o) => o._id === p.userId);
                      const billingPlanLabel =
                        p.billingPlan === "FullManagement"
                          ? "Full Management"
                          : p.billingPlan === "RentCollection"
                          ? "Software Leasing"
                          : "Unknown";
                      return (
                        <tr key={p._id} className="hover:bg-primary/5 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                            {p.reference}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-foreground">
                            {owner?.email || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {prop?.name || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
                              {billingPlanLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-primary">
                            <div>Ksh {p.amount.toLocaleString("en-KE")}</div>
                            {(p.amountPaid || 0) > 0 && <div className="mt-1 text-[10px] font-normal text-muted-foreground">Paid Ksh {(p.amountPaid || 0).toLocaleString("en-KE")} · Due Ksh {(p.balanceDue || 0).toLocaleString("en-KE")}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.description || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString("en-KE")}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={p.status}
                              onChange={(e) =>
                                handleStatusChange(p._id, e.target.value as "pending" | "completed" | "failed")
                              }
                              className={cn(
                                "text-xs px-3 py-1.5 rounded-md border font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition",
                                p.status === "completed"
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : p.status === "failed"
                                  ? "bg-red-50 text-red-800 border-red-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              )}
                            >
                              <option value="pending">Pending</option>
                              <option value="completed">Completed</option>
                              <option value="failed">Failed</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleGenerateInvoice(p)}
                                disabled={isGenerating === p._id}
                                className={cn(
                                  "inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition shadow-md disabled:opacity-60 text-xs",
                                  isGenerating === p._id && "opacity-70 cursor-wait"
                                )}
                              >
                                {isGenerating === p._id ? (
                                  <>

                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <FileText className="h-4 w-4" />
                                    Generate PDF
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleSendInvoiceEmail(p)}
                                disabled={isSendingInvoice === p._id}
                                className={cn(
                                  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-primary font-medium rounded-md border border-primary/30 hover:bg-primary/5 transition shadow-sm disabled:opacity-60 text-xs",
                                  isSendingInvoice === p._id && "opacity-70 cursor-wait"
                                )}
                                title="Send invoice email to property owner"
                              >
                                {isSendingInvoice === p._id ? (
                                  <>

                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    <Send className="h-4 w-4" />
                                    Send Invoice
                                  </>
                                )}
                              </button>
                              {p.status !== "completed" && (p.balanceDue ?? p.amount) > 0 && (
                                <button
                                  onClick={() => openManualPayment(p)}
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                                  title="Record a verified payment received outside the automated flow"
                                >
                                  <CreditCard className="h-4 w-4" /> Mark as Paid
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-4 bg-white/70 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of{" "}
                  {filteredPayments.length} invoice transactions
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-border rounded-md disabled:opacity-50 hover:bg-primary/5 transition text-xs font-medium text-muted-foreground"
                  >
                    Previous
                  </button>

                  <span className="px-3 py-2 text-xs font-medium bg-white/70 rounded-md border border-border shadow-sm">
                    Page {currentPage} of {totalPages || 1}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-border rounded-md disabled:opacity-50 hover:bg-primary/5 transition text-xs font-medium text-muted-foreground"
                  >
                    Next
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {manualPayment && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="presentation">
              <section role="dialog" aria-modal="true" aria-labelledby="manual-payment-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="manual-payment-title" className="text-lg font-semibold">Record manual invoice payment</h2>
                    <p className="mt-1 text-sm text-muted-foreground">This records a payment received outside the automated payment flow.</p>
                  </div>
                  <button type="button" onClick={() => setManualPayment(null)} disabled={isRecordingManualPayment} aria-label="Close" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 text-sm">
                  <div><span className="text-xs text-muted-foreground">Invoice</span><p className="font-mono font-medium">{manualPayment.invoice.reference}</p></div>
                  <div><span className="text-xs text-muted-foreground">Owner</span><p className="font-medium">{propertyOwners.find((owner) => owner._id === manualPayment.invoice.userId)?.name || propertyOwners.find((owner) => owner._id === manualPayment.invoice.userId)?.email || "—"}</p></div>
                  <div><span className="text-xs text-muted-foreground">Original amount</span><p>Ksh {manualPayment.invoice.amount.toLocaleString("en-KE")}</p></div>
                  <div><span className="text-xs text-muted-foreground">Already paid</span><p>Ksh {(manualPayment.invoice.amountPaid || 0).toLocaleString("en-KE")}</p></div>
                  <div><span className="text-xs text-muted-foreground">Outstanding balance</span><p className="font-semibold">Ksh {(manualPayment.invoice.balanceDue ?? manualPayment.invoice.amount).toLocaleString("en-KE")}</p></div>
                  <div><span className="text-xs text-muted-foreground">Issue date</span><p>{new Date(manualPayment.invoice.createdAt).toLocaleDateString("en-KE")}</p></div>
                  <div><span className="text-xs text-muted-foreground">Due date</span><p>{manualPayment.invoice.dueDate ? new Date(manualPayment.invoice.dueDate).toLocaleDateString("en-KE") : "—"}</p></div>
                  <div><span className="text-xs text-muted-foreground">Current status</span><p>{manualPayment.invoice.invoiceStatus || manualPayment.invoice.status}</p></div>
                  {manualPayment.invoice.latestPaymentMethod && <div><span className="text-xs text-muted-foreground">Last payment</span><p>{manualPayment.invoice.latestPaymentMethod} · {manualPayment.invoice.latestPaymentReference || "No reference"}</p></div>}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium">Amount received (KES)<input type="number" min="0.01" max={manualPayment.invoice.balanceDue ?? manualPayment.invoice.amount} step="0.01" value={manualAmount} onChange={(event) => { setManualAmount(event.target.value); setManualConfirmed(false); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium">Payment method<select value={manualMethod} onChange={(event) => setManualMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="other">Other verified method</option><option value="mpesa_paybill">M-Pesa Paybill</option><option value="mpesa_till">M-Pesa Till</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option></select></label>
                  <label className="text-xs font-medium sm:col-span-2">Payment reference (optional)<input value={manualReference} onChange={(event) => setManualReference(event.target.value)} maxLength={120} placeholder="M-Pesa code, bank reference, or receipt number" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium sm:col-span-2">Payment date and time<input type="datetime-local" value={manualPaymentDate} onChange={(event) => setManualPaymentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium sm:col-span-2">Reconciliation note (optional)<textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} maxLength={500} rows={2} className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
                </div>
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5">Amount to record: <strong>Ksh {Number(manualAmount || 0).toLocaleString("en-KE")}</strong>. The server will recheck the live outstanding balance before saving.</p>
                <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={manualConfirmed} onChange={(event) => setManualConfirmed(event.target.checked)} className="mt-0.5" /><span>I verified that this payment was received and want to record it in the invoice payment history.</span></label>
                <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={() => setManualPayment(null)} disabled={isRecordingManualPayment} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button type="button" onClick={submitManualPayment} disabled={isRecordingManualPayment || !manualConfirmed || !manualAmount || Number(manualAmount) <= 0 || Number(manualAmount) > (manualPayment.invoice.balanceDue ?? manualPayment.invoice.amount) || !manualPaymentDate} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isRecordingManualPayment ? "Recording payment…" : "Confirm and record payment"}</button></div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
