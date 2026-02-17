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

  // ── 1. Session check (replaces cookie reading + CSRF fetch) ────────────────
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

  // ── 2. Fetch all data when authenticated ───────────────────────────────────
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

      if (pRes.status === 401 || pRes.status === 403 ||
          oRes.status === 401 || oRes.status === 403 ||
          prRes.status === 401 || prRes.status === 403) {
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

  // ── Filtering logic ────────────────────────────────────────────────────────
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

  // ── Export Excel for selected owner ────────────────────────────────────────
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <Sidebar />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-white font-medium animate-slide-in ${
              toast.type === "error"
                ? "bg-red-600"
                : toast.type === "success"
                ? "bg-green-600"
                : "bg-blue-600"
            }`}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="sm:ml-64 pt-16">
        <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 flex items-center gap-3 mb-2">
            <CreditCard className="text-[#012a4a] w-8 h-8" />
            Payments Dashboard
          </h1>
          <p className="text-gray-600 mb-8">View, filter and export owner payments</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          {/* Export Section */}
          <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-8 mb-8 border border-gray-100">
            <h3 className="text-xl lg:text-2xl font-bold mb-5 flex items-center gap-3">
              <Download className="text-[#012a4a] w-6 h-6" />
              Export Reports
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                disabled={isExporting || isLoading}
                className="w-full sm:w-80 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]/30 focus:border-[#012a4a] transition"
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
                  className={`flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md font-medium min-w-[180px] ${
                    isExporting ? "opacity-70 cursor-wait" : ""
                  }`}
                >
                  {isExporting ? "Exporting..." : "Export Selected Owner"}
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-8 mb-8">
            <h3 className="text-xl lg:text-2xl font-bold mb-5">Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <select
                value={filters.ownerEmail}
                onChange={(e) => setFilters({ ...filters, ownerEmail: e.target.value })}
                className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]/30"
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
                className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]/30"
              />

              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]/30"
              >
                <option value="">All Types</option>
                <option value="Rent">Rent</option>
                <option value="Utility">Utility</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]/30"
              >
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Loading / Empty / Table */}
          {isLoading ? (
            <div className="grid gap-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow p-6 animate-pulse h-28" />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-2xl p-10 lg:p-16 text-center">
              <AlertCircle className="w-20 h-20 text-orange-500 mx-auto mb-6" />
              <h3 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-3">
                No Payments Match Your Filters
              </h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Try changing filters or refresh the data.
              </p>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#012a4a] text-white rounded-xl hover:bg-[#013a6a] transition text-lg font-medium shadow-md"
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Data
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-gradient-to-r from-[#012a4a] to-[#024a7a] text-white">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Transaction</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Tenant</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Property</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Type</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Amount</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Date</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginated.map((p) => {
                      const prop = properties.find((pr) => pr._id === p.propertyId);
                      return (
                        <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm whitespace-nowrap">{p.transactionId}</td>
                          <td className="px-6 py-4 font-medium">{p.tenantName || "—"}</td>
                          <td className="px-6 py-4">{prop?.name || "—"}</td>
                          <td className="px-6 py-4">
                            <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">
                              {p.type || "N/A"}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-green-700">
                            Ksh {p.amount.toLocaleString("en-KE")}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {new Date(p.paymentDate).toLocaleDateString("en-KE")}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                p.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : p.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
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
              <div className="px-6 py-5 bg-gray-50 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of{" "}
                  {filteredPayments.length} payments
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-5 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
                  >
                    Previous
                  </button>

                  <span className="px-4 py-2 font-medium">
                    Page {currentPage} of {totalPages || 1}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-5 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}