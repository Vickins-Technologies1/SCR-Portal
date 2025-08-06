"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface Payment {
  _id: string;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  tenantName: string;
  type: "Rent" | "Utility" | "ManagementFee";
  phoneNumber: string;
  reference: string;
  unitType: string; // Format: "type-index", e.g., "Single-0"
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: "RentCollection" | "FullManagement"; managementFee: number; uniqueType: string }[];
}

interface FilterConfig {
  tenantName: string;
  type: string;
  status: string;
  unitType: string;
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
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterConfig>({
    tenantName: "",
    type: "",
    status: "",
    unitType: "",
  });

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      const existingToken = Cookies.get("csrf-token");
      if (existingToken) {
        setCsrfToken(existingToken);
        console.log("Using existing CSRF token:", existingToken);
        return;
      }

      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          let errorMessage = `HTTP error: ${res.status}`;
          try {
            const text = await res.text();
            errorMessage += `, Response: ${text || "No response body"}`;
            console.error("CSRF fetch failed", { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers), body: text });
          } catch {
            errorMessage += ", Failed to read response body";
            console.error("CSRF fetch failed", { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers) });
          }
          throw new Error(errorMessage);
        }

        const csrfToken = res.headers.get("X-CSRF-Token");
        if (!csrfToken) {
          let responseBody;
          try {
            responseBody = await res.text();
          } catch {
            responseBody = "Failed to read response body";
          }
          const errorMessage = "CSRF token not found in response headers";
          console.error("Failed to fetch CSRF token:", errorMessage, {
            status: res.status,
            headers: Object.fromEntries(res.headers),
            body: responseBody,
          });
          setError(errorMessage);
          return;
        }

        Cookies.set("csrf-token", csrfToken, { sameSite: "strict", expires: 7 });
        setCsrfToken(csrfToken);
        console.log("Fetched new CSRF token from headers:", csrfToken);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to connect to server for CSRF token";
        setError(errorMessage);
        console.error("Error fetching CSRF token:", errorMessage, { error });
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
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      const data: { success: boolean; properties?: Property[]; message?: string } = await res.json();
      if (data.success) {
        const properties = data.properties?.map((p: Property) => ({
          ...p,
          unitTypes: p.unitTypes?.map((u, index) => ({
            ...u,
            uniqueType: `${u.type}-${index}`,
          })) || [],
        })) || [];
        setProperties(properties);
      } else {
        setError(data.message || "Failed to fetch properties.");
        console.error("Failed to fetch properties:", data.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to the server.";
      setError(errorMessage);
      console.error("Error fetching properties:", errorMessage, { error });
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
        ...(filters.unitType && { unitType: filters.unitType }),
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
          console.warn("Unauthorized request to /api/payments:", res.status);
          return;
        }
        throw new Error(`HTTP error: ${res.status}`);
      }
      const data: {
        success: boolean;
        payments?: Payment[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
        message?: string;
      } = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
        setTotalPayments(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.totalPages && currentPage > data.totalPages) {
          setCurrentPage(data.totalPages);
        } else if (currentPage < 1) {
          setCurrentPage(1);
        }
      } else {
        setError(data.message || "Failed to fetch payments.");
        setPayments([]);
        setTotalPayments(0);
        setTotalPages(1);
        console.error("Failed to fetch payments:", data.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to the server.";
      setError(errorMessage);
      console.error("Error fetching payments:", errorMessage, { error });
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
    setFilters({ tenantName: "", type: "", status: "", unitType: "" });
    setCurrentPage(1);
    setError(null);
  };

  // Pagination controls
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && !isLoading) {
      setCurrentPage(newPage);
      setError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  // Get unique unit types for filter (base types without index)
  const uniqueUnitTypes = [
    ...new Set(
      payments
        .map((payment) => payment.unitType?.split('-')[0])
        .filter((ut): ut is string => !!ut)
    ),
  ];

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const maxPagesToShow = 5;
    const pages: (number | string)[] = [];
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push("...");
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
                <select
                  name="tenantName"
                  value={filters.tenantName}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Tenants</option>
                  {[...new Set(payments.map((payment) => payment.tenantName).filter((tn): tn is string => tn !== "Unknown"))].map((tenantName) => (
                    <option key={tenantName} value={tenantName}>
                      {tenantName}
                    </option>
                  ))}
                  <option value="Unknown">Non-tenant Payments</option>
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
                  <option value="ManagementFee">Management Fee</option>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
                <select
                  name="unitType"
                  value={filters.unitType}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Unit Types</option>
                  {uniqueUnitTypes.map((unitType) => (
                    <option key={unitType} value={unitType}>
                      {unitType}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 bg-[#012a4a] text-white rounded-md hover:bg-[#024a7a] transition"
              disabled={isLoading}
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
                    <th className="px-4 py-3 text-left">Property</th>
                    <th className="px-4 py-3 text-left">Unit Type</th>
                    <th className="px-4 py-3 text-left">Amount (Ksh)</th>
                    <th className="px-4 py-3 text-left">Payment Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => {
                    const [baseUnitType] = payment.unitType?.split('-') || ['N/A'];
                    return (
                      <tr key={payment._id} className="border-t hover:bg-gray-50 transition">
                        <td className="px-4 py-3">{index + 1 + (currentPage - 1) * itemsPerPage}</td>
                        <td className="px-4 py-3">{payment.transactionId}</td>
                        <td className="px-4 py-3">{payment.tenantName || payment.tenantId || "Unknown"}</td>
                        <td className="px-4 py-3">
                          {properties.find((p) => p._id === payment.propertyId)?.name || "N/A"}
                        </td>
                        <td className="px-4 py-3">{`${baseUnitType} (${payment.unitType})`}</td>
                        <td className="px-4 py-3">Ksh {payment.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(payment.status)}`}>
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPayments > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 p-4">
                  <div className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, totalPayments)} of {totalPayments} payments
                  </div>
                  {totalPages > 1 && (
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                        className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      {getPageNumbers().map((page, index) => (
                        <button
                          key={index}
                          onClick={() => typeof page === "number" && handlePageChange(page)}
                          disabled={page === "..." || page === currentPage || isLoading}
                          className={`px-3 py-1 rounded-lg transition ${
                            page === currentPage
                              ? "bg-[#012a4a] text-white"
                              : page === "..."
                              ? "bg-gray-100 text-gray-500 cursor-default"
                              : "bg-gray-200 hover:bg-gray-300"
                          }`}
                          aria-label={typeof page === "number" ? `Page ${page}` : "Ellipsis"}
                        >
                          {page}
                        </button>
                      ))}
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