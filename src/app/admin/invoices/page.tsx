// src/app/admin/invoices/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface User {
  _id: string;
  email: string;
  role: "tenant" | "propertyOwner" | "admin";
}

interface Property {
  _id: string;
  name: string;
}

interface Invoice {
  _id: string;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  description: string;
}

interface SortConfig {
  key: keyof Invoice | "userEmail" | "propertyName";
  direction: "asc" | "desc";
}

export default function InvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalInvoices, setTotalInvoices] = useState(0);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  // ── Session + CSRF setup ──────────────────────────────────────────────────
  const checkSessionAndCsrf = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (!sessionRes.ok) throw new Error("Session invalid");

      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated) {
        throw new Error("Not authenticated");
      }

      const csrfRes = await fetch("/api/csrf-token", {
        credentials: "include",
        cache: "no-store",
      });

      if (!csrfRes.ok) throw new Error("CSRF fetch failed");

      const csrfData = await csrfRes.json();
      if (csrfData.csrfToken) {
        setCsrfToken(csrfData.csrfToken);
      }

      setStatus("authenticated");
    } catch (err) {
      console.error("Auth/CSRF setup failed", err);
      setError("Session expired or invalid. Redirecting...");
      setStatus("unauthenticated");
      setTimeout(() => router.replace("/admin/login?session=expired"), 1200);
    }
  }, [router]);

  useEffect(() => {
    checkSessionAndCsrf();
  }, [checkSessionAndCsrf]);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const [invoicesRes, usersRes, propertiesRes] = await Promise.all([
        fetch(`/api/invoices?page=${currentPage}&limit=${itemsPerPage}&sort=${sortConfig.key}:${sortConfig.direction}`, {
          credentials: "include",
        }),
        fetch("/api/admin/users", { credentials: "include" }),
        fetch("/api/admin/properties", { credentials: "include" }),
      ]);

      if (
        invoicesRes.status === 401 || invoicesRes.status === 403 ||
        usersRes.status === 401 || usersRes.status === 403 ||
        propertiesRes.status === 401 || propertiesRes.status === 403
      ) {
        setError("Session expired. Redirecting...");
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!invoicesRes.ok || !usersRes.ok || !propertiesRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const [invoicesData, usersData, propertiesData] = await Promise.all([
        invoicesRes.json(),
        usersRes.json(),
        propertiesRes.json(),
      ]);

      if (invoicesData.success) {
        setInvoices(invoicesData.invoices || []);
        setTotalInvoices(invoicesData.total || 0);
      } else {
        setError(invoicesData.message || "Failed to load invoices");
      }

      if (usersData.success) {
        setPropertyOwners((usersData.users || []).filter((u: User) => u.role === "propertyOwner"));
      }

      if (propertiesData.success) {
        setProperties(propertiesData.properties || []);
      }
    } catch (err) {
      console.error("Data fetch error:", err);
      setError("Failed to load invoices. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [status, currentPage, itemsPerPage, sortConfig, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, currentPage, sortConfig, fetchData]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: keyof Invoice | "userEmail" | "propertyName") => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1);
  }, []);

  const getSortIcon = useCallback(
    (key: keyof Invoice | "userEmail" | "propertyName") => {
      if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
      return sortConfig.direction === "asc" ? (
        <ChevronUp className="inline ml-1 h-4 w-4" />
      ) : (
        <ChevronDown className="inline ml-1 h-4 w-4" />
      );
    },
    [sortConfig]
  );

  // ── Generate PDF ───────────────────────────────────────────────────────────
  const handleGenerateInvoice = useCallback(
    async (invoice: Invoice) => {
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

  // ── Update status ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(
    async (invoiceId: string, newStatus: "pending" | "completed" | "failed") => {
      if (!csrfToken) {
        setError("Security token missing. Please refresh.");
        return;
      }

      const invoice = invoices.find((inv) => inv._id === invoiceId);
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
          setInvoices((prev) =>
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
    [csrfToken, invoices, router]
  );

  const totalPages = Math.ceil(totalInvoices / itemsPerPage);

  // ── Rendering ──────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
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

      <div className="md:ml-60 pt-14 pb-12 px-4 sm:px-5 lg:px-6">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 mt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shadow-md">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
            <p className="text-xs text-muted-foreground mt-1">Manage and generate invoices for property owners</p>
          </div>
        </div>

          {/* Error Message */}
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

          {isLoading ? (
            <div className="grid gap-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="surface-card rounded-2xl h-20 animate-pulse"
                />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center">
              <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-foreground mb-2">
                No Invoices Found
              </h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-md mx-auto">
                No invoices available yet or none match current filters.
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
              className="surface-card rounded-2xl overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-white/70">
                    <tr>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("amount")}
                      >
                        Amount {getSortIcon("amount")}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("userEmail")}
                      >
                        Owner Email {getSortIcon("userEmail")}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("propertyName")}
                      >
                        Property Name {getSortIcon("propertyName")}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("reference")}
                      >
                        Reference {getSortIcon("reference")}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("status")}
                      >
                        Status {getSortIcon("status")}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("createdAt")}
                      >
                        Created At {getSortIcon("createdAt")}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((i) => {
                      const owner = propertyOwners.find((u) => u._id === i.userId);
                      const prop = properties.find((p) => p._id === i.propertyId);

                        function cn(...classes: (string | false | null | undefined)[]): string {
                        return classes.filter(Boolean).join(" ");
                        }

                      return (
                        <tr key={i._id} className="hover:bg-primary/5 transition-colors">
                          <td className="px-4 py-3 text-xs font-medium text-foreground">
                            Ksh {i.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {owner?.email || "N/A"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {prop?.name || "N/A"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {i.reference}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={i.status}
                              onChange={(e) =>
                                handleStatusChange(i._id, e.target.value as "pending" | "completed" | "failed")
                              }
                              className={cn(
                                "text-xs px-3 py-1.5 rounded-md border font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition",
                                i.status === "completed"
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : i.status === "failed"
                                  ? "bg-red-50 text-red-800 border-red-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              )}
                            >
                              <option value="pending">Pending</option>
                              <option value="completed">Completed</option>
                              <option value="failed">Failed</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(i.createdAt).toLocaleDateString("en-KE")}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleGenerateInvoice(i)}
                              disabled={isGenerating === i._id}
                              className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition shadow-md disabled:opacity-60 text-xs",
                                isGenerating === i._id && "opacity-70 cursor-wait"
                              )}
                            >
                              {isGenerating === i._id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                "Generate PDF"
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-4 bg-white/70 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-xs text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1}–
                    {Math.min(currentPage * itemsPerPage, invoices.length)} of {totalInvoices} invoices
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-border rounded-md disabled:opacity-50 hover:bg-primary/5 transition text-xs font-medium text-muted-foreground"
                    >
                      Previous
                    </button>

                    <span className="px-3 py-2 text-xs font-medium bg-white/70 rounded-md border border-border shadow-sm">
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      className="px-4 py-2 border border-border rounded-md disabled:opacity-50 hover:bg-primary/5 transition text-xs font-medium text-muted-foreground"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
