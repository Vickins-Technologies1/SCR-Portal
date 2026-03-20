"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Download,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

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
  description?: string;
  billingPlan?: string;
  percentage?: number;
  expectedIncome?: number;
}

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<InvoiceTransaction[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<InvoiceTransaction[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ── Session check ───────────────────────────────────────────────────────────
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

  // ── Fetch data ─────────────────────────────────────────────────────────────
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
  }, [status, currentPage, router, showToast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, fetchData]);

  // ── Filtering logic (unchanged) ────────────────────────────────────────────
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

  // ── Export Excel ───────────────────────────────────────────────────────────
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

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginated = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-[#03a678]"></div>
          <p className="text-lg font-medium text-gray-700">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-60 pt-14 pb-12 px-4 sm:px-5 lg:px-6">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 mt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#03a678] to-[#027a55] text-white shadow-md">
              <CreditCard size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Payments</h1>
              <p className="text-xs text-gray-600 mt-1">Invoice transactions for property owners</p>
            </div>
          </div>

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
                    ? "bg-green-600"
                    : "bg-[#03a678]"
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
            className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 p-4 lg:p-5 mb-6"
          >
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Download className="text-[#03a678] h-5 w-5" />
              Export Invoice Transactions
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                disabled={isExporting || isLoading}
                className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition text-xs text-gray-700"
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
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2 bg-[#03a678] text-white text-xs font-medium rounded-md hover:bg-[#027a55] transition-all shadow-md min-w-[180px] ${
                    isExporting ? "opacity-70 cursor-wait" : ""
                  }`}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
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
            className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 p-4 lg:p-5 mb-6"
          >
            <h3 className="text-base font-semibold text-gray-900 mb-4">Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={filters.ownerEmail}
                onChange={(e) => setFilters({ ...filters, ownerEmail: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
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
                className="px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
              />

              <select
                value={filters.billingPlan}
                onChange={(e) => setFilters({ ...filters, billingPlan: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
              >
                <option value="">All Billing Plans</option>
                <option value="FullManagement">Full Management</option>
                <option value="RentCollection">Software Leasing</option>
                <option value="Unknown">Unknown</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
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
                  className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg h-24 animate-pulse"
                />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 p-8 text-center">
              <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                No Invoice Transactions Found
              </h3>
              <p className="text-xs text-gray-600 mb-5 max-w-md mx-auto">
                No invoice transactions match the selected filters or no data is available yet.
              </p>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#03a678] text-white rounded-md hover:bg-[#027a55] transition shadow-md text-xs font-medium"
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
              className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Invoice Ref
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Owner
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Property
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
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
                        <tr key={p._id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-700">
                            {p.reference}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-900">
                            {owner?.email || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {prop?.name || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-700">
                              {billingPlanLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-emerald-700">
                            Ksh {p.amount.toLocaleString("en-KE")}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {p.description || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {new Date(p.createdAt).toLocaleDateString("en-KE")}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                p.status === "completed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : p.status === "pending"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of{" "}
                  {filteredPayments.length} invoice transactions
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100 transition text-xs font-medium"
                  >
                    Previous
                  </button>

                  <span className="px-3 py-2 text-xs font-medium bg-white rounded-md border border-gray-200 shadow-sm">
                    Page {currentPage} of {totalPages || 1}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100 transition text-xs font-medium"
                  >
                    Next
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
