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

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  type?: "Rent" | "Utility";
  tenantName?: string;
}

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");

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
    type: "",
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
        fetch(`/api/payments?page=${currentPage}&limit=${itemsPerPage}&sort=-paymentDate`, {
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

      setPayments(pData.payments || []);
      setFilteredPayments(pData.payments || []);
      setPropertyOwners(oData.propertyOwners || []);
      setProperties(prData.properties || []);

      showToast("Payments & data loaded", "success");
    } catch (err) {
      console.error("Data fetch error:", err);
      setError("Failed to load payments data. Please try again.");
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
        const propertyIds = properties
          .filter((p) => p.ownerId === owner._id)
          .map((p) => p._id);
        filtered = filtered.filter((p) => propertyIds.includes(p.propertyId));
      }
    }

    if (filters.propertyName) {
      const search = filters.propertyName.toLowerCase();
      filtered = filtered.filter((p) => {
        const prop = properties.find((pr) => pr._id === p.propertyId);
        return prop?.name?.toLowerCase().includes(search);
      });
    }

    if (filters.type) {
      filtered = filtered.filter((p) => p.type === filters.type);
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
      const res = await fetch("/api/payments/excel", {
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
        link.download = data.filename || `payments-${ownerId.slice(-6)}.xlsx`;
        link.click();
        showToast("Excel file downloaded", "success");
      } else {
        showToast("No payments found for export", "info");
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
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-16 px-5 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-10 mt-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#03a678] to-[#027a55] text-white shadow-md">
              <CreditCard size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
              <p className="text-gray-600 mt-1">View, filter and export payment records</p>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div className="fixed top-6 right-6 z-50 max-w-md">
              <motion.div
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-medium ${
                  toast.type === "error"
                    ? "bg-red-600"
                    : toast.type === "success"
                    ? "bg-green-600"
                    : "bg-[#03a678]"
                }`}
              >
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <span className="flex-1">{toast.message}</span>
                <button onClick={() => setToast(null)} className="text-white/90 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </motion.div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-10 bg-red-50 border border-red-200 text-red-700 px-6 py-5 rounded-2xl flex items-start gap-4">
              <AlertCircle className="h-6 w-6 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchData();
                  }}
                  className="mt-3 inline-flex items-center gap-2 text-sm text-red-700 hover:text-red-800 transition-colors"
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
            className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 p-6 lg:p-8 mb-10"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Download className="text-[#03a678] h-7 w-7" />
              Export Reports
            </h3>

            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                disabled={isExporting || isLoading}
                className="w-full sm:w-96 px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition text-gray-700"
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
                  className={`inline-flex items-center justify-center gap-3 px-8 py-4 bg-[#03a678] text-white font-medium rounded-xl hover:bg-[#027a55] transition-all shadow-md min-w-[220px] ${
                    isExporting ? "opacity-70 cursor-wait" : ""
                  }`}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download size={20} />
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
            className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 p-6 lg:p-8 mb-10"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <select
                value={filters.ownerEmail}
                onChange={(e) => setFilters({ ...filters, ownerEmail: e.target.value })}
                className="px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
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
                className="px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
              />

              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
              >
                <option value="">All Types</option>
                <option value="Rent">Rent</option>
                <option value="Utility">Utility</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
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
            <div className="grid gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg h-28 animate-pulse"
                />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
              <AlertCircle className="w-20 h-20 text-orange-500 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                No Payments Found
              </h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                No payments match the selected filters or no data is available yet.
              </p>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#03a678] text-white rounded-xl hover:bg-[#027a55] transition shadow-md font-medium"
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
              className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Transaction
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Tenant
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Property
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((p) => {
                      const prop = properties.find((pr) => pr._id === p.propertyId);
                      return (
                        <tr key={p._id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-gray-700">
                            {p.transactionId}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {p.tenantName || "—"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {prop?.name || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                              {p.type || "N/A"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-emerald-700">
                            Ksh {p.amount.toLocaleString("en-KE")}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {new Date(p.paymentDate).toLocaleDateString("en-KE")}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${
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
              <div className="px-6 py-5 bg-gray-50 border-t flex flex-col sm:flex-row justify-between items-center gap-5">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of{" "}
                  {filteredPayments.length} payments
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-6 py-3 border border-gray-300 rounded-xl disabled:opacity-50 hover:bg-gray-100 transition font-medium"
                  >
                    Previous
                  </button>

                  <span className="px-5 py-3 font-medium bg-white rounded-xl border border-gray-200 shadow-sm">
                    Page {currentPage} of {totalPages || 1}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-6 py-3 border border-gray-300 rounded-xl disabled:opacity-50 hover:bg-gray-100 transition font-medium"
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