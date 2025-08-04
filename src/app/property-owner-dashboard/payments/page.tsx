"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  tenantName: string;
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
}

interface FilterConfig {
  tenantName: string;
  type: string;
  status: string;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [filters, setFilters] = useState<FilterConfig>({
    tenantName: "",
    type: "",
    status: "",
  });

  // Fetch CSRF token with retry
  useEffect(() => {
    const fetchCsrfToken = async (retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          setIsLoading(true);
          const res = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "include",
          });
          const data = await res.json();
          if (data.success) {
            setCsrfToken(data.csrfToken);
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", expires: 1 });
            return;
          } else {
            setError(data.message || "Failed to fetch CSRF token.");
          }
        } catch {
          if (i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          setError("Failed to connect to server for CSRF token.");
        }
        setIsLoading(false);
      }
    };
    fetchCsrfToken();
  }, []);

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/login");
    }
  }, [router]);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId, csrfToken]);

  // Fetch payments with pagination and filters
  const fetchPayments = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        sort: "-paymentDate",
        ...(selectedPropertyId !== "all" && { propertyId: selectedPropertyId }),
        ...(filters.tenantName && { tenantName: filters.tenantName }),
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status }),
      });
      const res = await fetch(`/api/payments?${queryParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          setError("Unauthorized request. Please try logging in again.");
          return;
        }
        throw new Error(`HTTP error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
        setTotalPayments(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setCurrentPage(data.page || 1);
        if (data.payments?.length === 0 && data.total > 0) {
          setError(`No payments found for page ${currentPage}. Try another page or adjust filters.`);
        }
      } else {
        setError(data.message || "Failed to fetch payments.");
        setPayments([]);
        setTotalPayments(0);
        setTotalPages(1);
      }
    } catch {
      setError("Failed to connect to the server.");
      setPayments([]);
      setTotalPayments(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [userId, selectedPropertyId, currentPage, itemsPerPage, csrfToken, filters]);

  // Fetch data when dependencies change
  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      fetchProperties();
      fetchPayments();
    }
  }, [userId, role, selectedPropertyId, currentPage, filters, fetchProperties, fetchPayments, csrfToken]);

  // Handle property selection
  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPropertyId(e.target.value);
    setCurrentPage(1);
    setError(null);
  };

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setCurrentPage(1);
    setError(null);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ tenantName: "", type: "", status: "" });
    setCurrentPage(1);
    setError(null);
  };

  // Pagination controls
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && !isLoading) {
      setCurrentPage(newPage);
      setError(null);
    }
  };

  // Status styles
  const getStatusStyles = (status: Payment["status"]) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100";
      case "pending":
        return "text-yellow-600 bg-yellow-100";
      case "failed":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <CreditCard className="text-[#012a4a]" />
              Payments
            </h1>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Property</label>
            <select
              value={selectedPropertyId}
              onChange={handlePropertyChange}
              className="w-full sm:w-64 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
              disabled={isLoading}
            >
              <option value="all">All Properties</option>
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6 bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Filter Payments</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
                <select
                  name="tenantName"
                  value={filters.tenantName}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Tenants</option>
                  {[...new Set(payments.map((payment) => payment.tenantName))].map((tenantName) => (
                    <option key={tenantName} value={tenantName}>
                      {tenantName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Types</option>
                  <option value="Rent">Rent</option>
                  <option value="Utility">Utility</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 bg-[#012a4a] text-white rounded-md hover:bg-[#024a7a] transition"
            >
              Clear Filters
            </button>
          </div>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading payments...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No payments found for {selectedPropertyId === "all" ? "any properties" : "selected property"}.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Transaction ID</th>
                    <th className="px-4 py-3 text-left">Tenant</th>
                    <th className="px-4 py-3 text-left">Amount (Ksh)</th>
                    <th className="px-4 py-3 text-left">Payment Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => (
                    <tr key={payment._id} className="border-t hover:bg-gray-50 transition">
                      <td className="px-4 py-3">{index + 1 + (currentPage - 1) * itemsPerPage}</td>
                      <td className="px-4 py-3">{payment.transactionId}</td>
                      <td className="px-4 py-3">{payment.tenantName || payment.tenantId}</td>
                      <td className="px-4 py-3">Ksh {payment.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPayments > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 p-4">
                  <div className="text-sm text-gray-600">
                    Showing {Math.min(payments.length, itemsPerPage)} of {totalPayments} payments
                  </div>
                  {totalPayments > itemsPerPage && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                        className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-600">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages || isLoading}
                        className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}