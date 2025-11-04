"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
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
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");

  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success" | "info";
    id: number;
  } | null>(null);

  const showToast = (
    message: string,
    type: "error" | "success" | "info" = "info"
  ) => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
  };

  const [filters, setFilters] = useState({
    ownerEmail: "",
    propertyName: "",
    type: "",
    status: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  /* ------------------------------------------------------------------ */
  /* AUTH & CSRF */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const init = async () => {
      const uid = Cookies.get("userId");
      const role = Cookies.get("role");
      if (!uid || role !== "admin") {
        showToast("Access denied. Redirecting...", "error");
        setTimeout(() => router.push("/admin/login"), 1500);
        return;
      }

      const token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", {
            credentials: "include",
          });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            setCsrfToken(data.csrfToken);
          }
        } catch {
          showToast("Session error. Refresh page.", "error");
        }
      } else {
        setCsrfToken(token);
      }
    };
    init();
  }, [router]);

  /* ------------------------------------------------------------------ */
  /* FETCH DATA */
  /* ------------------------------------------------------------------ */
  const fetchData = useCallback(async () => {
    if (!csrfToken) return;
    setIsLoading(true);

    try {
      const [pRes, oRes, prRes] = await Promise.all([
        fetch(
          `/api/payments?page=${currentPage}&limit=${itemsPerPage}&sort=-paymentDate`,
          {
            headers: { "X-CSRF-Token": csrfToken },
            credentials: "include",
          }
        ),
        fetch("/api/admin/property-owners", {
          headers: { "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin/properties", {
          headers: { "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
      ]);

      if (!pRes.ok || !oRes.ok || !prRes.ok) throw new Error("Network error");

      const [pData, oData, prData] = await Promise.all([
        pRes.json(),
        oRes.json(),
        prRes.json(),
      ]);

      if (!pData.success || !oData.success || !prData.success) {
        throw new Error("Invalid data");
      }

      setPayments(pData.payments || []);
      setFilteredPayments(pData.payments || []);
      setPropertyOwners(oData.propertyOwners || []);
      setProperties(prData.properties || []);
      showToast("Data loaded!", "success");
    } catch {
      showToast("Failed to load data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, csrfToken]);

  useEffect(() => {
    if (csrfToken) fetchData();
  }, [csrfToken, fetchData]);

  /* ------------------------------------------------------------------ */
  /* FILTERING */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let filtered = [...payments];

    if (filters.ownerEmail) {
      const owner = propertyOwners.find((o) => o.email === filters.ownerEmail);
      if (owner) {
        const ids = properties
          .filter((p) => p.ownerId === owner._id)
          .map((p) => p._id);
        filtered = filtered.filter((p) => ids.includes(p.propertyId));
      }
    }

    if (filters.propertyName) {
      filtered = filtered.filter((p) =>
        properties
          .find((pr) => pr._id === p.propertyId)
          ?.name.toLowerCase()
          .includes(filters.propertyName.toLowerCase())
      );
    }

    if (filters.type) filtered = filtered.filter((p) => p.type === filters.type);
    if (filters.status)
      filtered = filtered.filter((p) => p.status === filters.status);

    setFilteredPayments(filtered);
    setCurrentPage(1);
  }, [filters, payments, propertyOwners, properties]);

  /* ------------------------------------------------------------------ */
  /* EXCEL EXPORT */
  /* ------------------------------------------------------------------ */
  const generateExcel = async (ownerId: string) => {
    if (!csrfToken) return showToast("Session expired", "error");

    setIsExporting(true);
    try {
      const res = await fetch("/api/payments/excel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ ownerId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Export failed");

      if (data.excel) {
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.excel}`;
        link.download = data.filename || "payments.xlsx";
        link.click();
        showToast("Excel downloaded!", "success");
      } else {
        showToast("No data to export", "info");
      }
    } catch {
      showToast("Export failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginated = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  /* ------------------------------------------------------------------ */
  /* RENDER */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <Sidebar />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl shadow-2xl text-white font-medium animate-slide-in ${
              toast.type === "error"
                ? "bg-red-600"
                : toast.type === "success"
                ? "bg-green-600"
                : "bg-blue-600"
            }`}
          >
            <AlertCircle className="w-5 h-5" />
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main content – push under navbar & sidebar */}
      <div className="sm:ml-64 pt-16">
        <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 flex items-center gap-2 mb-2">
            <CreditCard className="text-[#012a4a] w-7 h-7 sm:w-8 sm:h-8" />
            Payments Dashboard
          </h1>
          <p className="text-gray-600 mb-6 sm:mb-8">
            Export and analyze all owner payments
          </p>

          {/* ---------- EXPORT BAR ---------- */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 lg:mb-8 border border-gray-100">
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold mb-4 flex items-center gap-2">
              <Download className="text-[#012a4a] w-5 h-5 sm:w-6 sm:h-6" />
              Export Reports
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        

              {/* Owner selector + export */}
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  disabled={isExporting}
                  className="w-full sm:w-64 px-4 py-3 border-2 border-gray-300 rounded-xl text-base focus:ring-4 focus:ring-[#012a4a]/20 focus:border-[#012a4a] transition"
                >
                  <option value="">Select Owner</option>
                  {propertyOwners.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.name} ({o.email})
                    </option>
                  ))}
                </select>

                {selectedOwnerId && (
                  <button
                    onClick={() => generateExcel(selectedOwnerId)}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg text-base sm:text-lg font-medium"
                  >
                    Export This Owner
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---------- FILTERS ---------- */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 lg:mb-8">
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold mb-4">
              Filters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Owner */}
              <select
                value={filters.ownerEmail}
                onChange={(e) =>
                  setFilters({ ...filters, ownerEmail: e.target.value })
                }
                className="p-3 border-2 rounded-xl text-base focus:ring-4 focus:ring-[#012a4a]/20"
              >
                <option value="">All Owners</option>
                {propertyOwners.map((o) => (
                  <option key={o._id} value={o.email}>
                    {o.email}
                  </option>
                ))}
              </select>

              {/* Property name */}
              <input
                type="text"
                placeholder="Search property..."
                value={filters.propertyName}
                onChange={(e) =>
                  setFilters({ ...filters, propertyName: e.target.value })
                }
                className="p-3 border-2 rounded-xl text-base focus:ring-4 focus:ring-[#012a4a]/20"
              />

              {/* Type */}
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
                className="p-3 border-2 rounded-xl text-base"
              >
                <option value="">All Types</option>
                <option>Rent</option>
                <option>Utility</option>
              </select>

              {/* Status */}
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="p-3 border-2 rounded-xl text-base"
              >
                <option value="">All Status</option>
                <option>completed</option>
                <option>pending</option>
                <option>failed</option>
              </select>
            </div>
          </div>

          {/* ---------- LOADING ---------- */}
          {isLoading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow p-6 animate-pulse"
                >
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                  <div className="h-5 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- EMPTY STATE ---------- */}
          {!isLoading && filteredPayments.length === 0 && (
            <div className="bg-white rounded-xl shadow-2xl p-8 sm:p-12 lg:p-16 text-center">
              <AlertCircle className="w-16 h-16 sm:w-20 sm:h-20 text-orange-500 mx-auto mb-4 sm:mb-6" />
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                No Payments Found
              </h3>
              <p className="text-gray-600 mb-6">
                Try adjusting filters or refresh data.
              </p>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#012a4a] text-white rounded-xl hover:bg-[#013a6a] transition text-base sm:text-lg font-medium"
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Data
              </button>
            </div>
          )}

          {/* ---------- TABLE ---------- */}
          {!isLoading && paginated.length > 0 && (
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] table-auto">
                  <thead className="bg-gradient-to-r from-[#012a4a] to-[#024a7a] text-white">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Transaction
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Tenant
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Property
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Type
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Amount
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Date
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-left text-sm sm:text-base font-bold">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginated.map((p) => {
                      const prop = properties.find(
                        (pr) => pr._id === p.propertyId
                      );
                      return (
                        <tr
                          key={p._id}
                          className="hover:bg-gray-50 transition"
                        >
                          <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono text-xs sm:text-sm whitespace-nowrap">
                            {p.transactionId}
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-sm">
                            {p.tenantName || "—"}
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm">
                            {prop?.name || "—"}
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4">
                            <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-xs sm:text-sm font-medium">
                              {p.type || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4 font-bold text-green-600 text-sm sm:text-base">
                            Ksh {p.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm">
                            {new Date(p.paymentDate).toLocaleDateString(
                              "en-KE"
                            )}
                          </td>
                          <td className="px-4 py-3 sm:px-6 sm:py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs sm:text-sm font-bold ${
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
              <div className="p-4 sm:p-6 lg:p-8 border-t bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <span className="text-sm sm:text-base text-gray-700 font-medium">
                  Showing{" "}
                  {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(
                    currentPage * itemsPerPage,
                    filteredPayments.length
                  )}{" "}
                  of {filteredPayments.length}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.max(1, p - 1))
                    }
                    disabled={currentPage === 1}
                    className="px-4 py-2 border-2 border-gray-300 rounded-xl text-sm sm:text-base font-medium hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    Previous
                  </button>

                  <span className="px-4 py-2 text-sm sm:text-base font-bold">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border-2 border-gray-300 rounded-xl text-sm sm:text-base font-medium hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Animation */}
      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}