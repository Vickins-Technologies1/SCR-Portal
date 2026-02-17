"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
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

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  // ── 1. Session + CSRF setup ───────────────────────────────────────────────
  const checkSessionAndCsrf = useCallback(async () => {
    try {
      // Check session
      const sessionRes = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (!sessionRes.ok) throw new Error("Session invalid");

      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated) {
        throw new Error("Not authenticated");
      }

      // Fetch CSRF token (needed for POST/PATCH)
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

  // ── 2. Fetch invoices + related data ──────────────────────────────────────
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

  // ── Generate PDF (POST → needs CSRF) ──────────────────────────────────────
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

  // ── Update status (PATCH → needs CSRF) ────────────────────────────────────
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

  // ── Render logic ───────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-lg text-gray-600">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
          Verifying session...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6">
            <FileText className="text-[#012a4a] h-6 w-6" />
            Invoices
          </h1>

          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-6 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-gray-600 py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading invoices...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-md">
                <thead className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white">
                  <tr>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("amount")}
                    >
                      Amount {getSortIcon("amount")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("userEmail")}
                    >
                      Owner Email {getSortIcon("userEmail")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("propertyName")}
                    >
                      Property Name {getSortIcon("propertyName")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("reference")}
                    >
                      Reference {getSortIcon("reference")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("status")}
                    >
                      Status {getSortIcon("status")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("createdAt")}
                    >
                      Created At {getSortIcon("createdAt")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-600">
                        No invoices found.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((i, index) => (
                      <tr
                        key={i._id}
                        className="border-b border-gray-200 hover:bg-gray-50"
                        style={{ animationDelay: `${index * 80}ms` }}
                      >
                        <td className="py-3 px-4 text-sm text-gray-800">
                          Ksh {i.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {propertyOwners.find((u) => u._id === i.userId)?.email || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {properties.find((p) => p._id === i.propertyId)?.name || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{i.reference}</td>
                        <td className="py-3 px-4 text-sm">
                          <select
                            value={i.status}
                            onChange={(e) =>
                              handleStatusChange(i._id, e.target.value as "pending" | "completed" | "failed")
                            }
                            className={`text-sm p-1 rounded border ${
                              i.status === "completed"
                                ? "text-green-600 border-green-600"
                                : i.status === "failed"
                                ? "text-red-600 border-red-600"
                                : "text-yellow-600 border-yellow-600"
                            } bg-white focus:outline-none focus:ring-2 focus:ring-[#012a4a]`}
                            aria-label={`Change status for invoice ${i._id}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {new Date(i.createdAt).toLocaleDateString("en-KE")}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <button
                            onClick={() => handleGenerateInvoice(i)}
                            disabled={isGenerating === i._id}
                            className={`px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm disabled:opacity-50 ${
                              isGenerating === i._id ? "opacity-70 cursor-wait" : ""
                            }`}
                            aria-label={`Generate PDF for invoice ${i._id}`}
                          >
                            {isGenerating === i._id ? (
                              <span className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                Generating...
                              </span>
                            ) : (
                              "Generate PDF"
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {invoices.length} of {totalInvoices} invoices
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
                    >
                      Previous
                    </button>
                    <span className="px-4 py-2 font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}