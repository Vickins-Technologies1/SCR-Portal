"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { usePermissions } from "@/hooks/usePermissions";

interface Payment {
  _id: string;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  tenantName: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber: string;
  reference: string;
  unitType: string;
  createdAt: string;
  mpesaCode?: string;
  isManual?: boolean;
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
  const perm = usePermissions();
  const canViewPayments = perm.canViewPayments;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
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
  const fetchCsrfToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const errorMessage = `HTTP error: ${res.status}`;
        console.error("CSRF fetch failed", { status: res.status, statusText: res.statusText });
        throw new Error(errorMessage);
      }

      const data = await res.json();
      if (!data.success || !data.csrfToken) {
        const errorMessage = data.message || "CSRF token not found in response";
        console.error("Failed to fetch CSRF token:", errorMessage);
        throw new Error(errorMessage);
      }

      setCsrfToken(data.csrfToken);
      Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", expires: 1 });
      console.log("Fetched new CSRF token:", data.csrfToken);
      return data.csrfToken;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to server for CSRF token";
      setError(errorMessage);
      console.error("Error fetching CSRF token:", errorMessage, { error });
      return null;
    }
  }, []);

  // Initialize CSRF token on mount
  useEffect(() => {
    fetchCsrfToken();
  }, [fetchCsrfToken]);

  // Check cookies and determine effective ownerId
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    setUserId(uid || null);
    setRole(userRole || null);

    let ownerIdToUse: string | null = null;

    if (userRole === "propertyOwner") {
      ownerIdToUse = uid || null;
    } else if (userRole === "teamMember") {
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      setError("Unauthorized. Please log in as a property owner or team member.");
      router.push("/");
      return;
    }

    if (userRole === "teamMember" && !canViewPayments) {
      setError("Access restricted. You do not have permission to view payments.");
      router.replace("/property-owner-dashboard");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router, canViewPayments]);

  // Fetch properties with CSRF retry
  const fetchProperties = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(effectiveOwnerId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          console.warn("CSRF token invalid, attempting to refetch");
          const newToken = await fetchCsrfToken();
          if (newToken) {
            const retryRes = await fetch(`/api/properties?userId=${encodeURIComponent(effectiveOwnerId)}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": newToken,
              },
              credentials: "include",
            });
            if (!retryRes.ok) {
              throw new Error(`Retry failed: HTTP error ${retryRes.status}`);
            }
            const retryData = await retryRes.json();
            if (retryData.success) {
              const properties = retryData.properties?.map((p: Property) => ({
                ...p,
                unitTypes: p.unitTypes?.map((u, index) => ({
                  ...u,
                  uniqueType: `${u.type}-${index}`,
                })) || [],
              })) || [];
              setProperties(properties);
              return;
            } else {
              throw new Error(retryData.message || "Retry failed to fetch properties");
            }
          }
        }
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
  }, [effectiveOwnerId, csrfToken, fetchCsrfToken]);

  // Fetch payments with pagination, filters, and CSRF retry
  const fetchPayments = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
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
      const res = await fetch(`/api/payments?userId=${encodeURIComponent(effectiveOwnerId)}&${queryParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          console.warn("CSRF token invalid, attempting to refetch");
          const newToken = await fetchCsrfToken();
          if (newToken) {
            const retryRes = await fetch(`/api/payments?userId=${encodeURIComponent(effectiveOwnerId)}&${queryParams}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": newToken,
              },
              credentials: "include",
            });
            if (!retryRes.ok) {
              throw new Error(`Retry failed: HTTP error ${retryRes.status}`);
            }
            const retryData = await retryRes.json();
            if (retryData.success) {
              setPayments(retryData.payments || []);
              setTotalPayments(retryData.total || 0);
              setTotalPages(retryData.totalPages || 1);
              if (retryData.totalPages && currentPage > retryData.totalPages) {
                setCurrentPage(retryData.totalPages);
              } else if (currentPage < 1) {
                setCurrentPage(1);
              }
              return;
            } else {
              throw new Error(retryData.message || "Retry failed to fetch payments");
            }
          }
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
  }, [effectiveOwnerId, selectedPropertyId, currentPage, itemsPerPage, csrfToken, filters, fetchCsrfToken]);

  // Fetch data when dependencies change
  useEffect(() => {
    if (effectiveOwnerId && csrfToken) {
      fetchProperties();
      fetchPayments();
    }
  }, [effectiveOwnerId, csrfToken, selectedPropertyId, currentPage, filters, fetchProperties, fetchPayments]);

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
        return "text-primary bg-primary/10";
      case "pending":
        return "text-yellow-600 bg-yellow-100";
      case "failed":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };
  const formatTransactionDisplay = (payment: Payment) => {
    const isManual = payment.isManual ?? payment.transactionId?.startsWith("MANUAL-");
    const identifier = isManual ? payment.transactionId : payment.mpesaCode || payment.transactionId || "N/A";
    return { identifier, isManual };
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
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Payments</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Track rent, utility, deposit, and manual payments across your portfolio.
                </p>
              </div>
            </div>
          </section>

          <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-5" data-tour="owner-payments-filters">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Select Property</label>
            <select
              value={selectedPropertyId}
              onChange={handlePropertyChange}
              className="mt-2 w-full sm:w-72 border border-gray-200 px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
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
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">Filter Payments</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tenant Name</label>
                <select
                  name="tenantName"
                  value={filters.tenantName}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">All Types</option>
                  <option value="Rent">Rent</option>
                  <option value="Utility">Utility</option>
                  <option value="Deposit">Deposit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Type</label>
                <select
                  name="unitType"
                  value={filters.unitType}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
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
                className="mt-4 px-4 py-2 bg-primary text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary-hover transition"
                disabled={isLoading}
              >
                Clear Filters
              </button>
            </div>
          </div>
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-xl shadow text-xs sm:text-sm animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-muted-foreground text-xs sm:text-sm">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span className="ml-2">Loading payments...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-muted-foreground text-center text-xs sm:text-sm">
              No payments found for {selectedPropertyId === "all" ? "any properties" : "selected property"}.
            </div>
          ) : (
            <div className="table-shell" data-tour="owner-payments-table">
              <div className="table-scroll">
              <table className="min-w-full table-auto">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Transaction / MPesa ID</th>
                    <th className="px-4 py-3 text-left">Tenant</th>
                    <th className="px-4 py-3 text-left">Property</th>
                    <th className="px-4 py-3 text-left">Unit Type</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Amount (Ksh)</th>
                    <th className="px-4 py-3 text-left">Payment Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => {
                    const [baseUnitType] = payment.unitType?.split('-') || ['N/A'];
                    const transactionDisplay = formatTransactionDisplay(payment);
                    return (
                      <tr key={payment._id} className="hover:bg-primary/5 transition">
                        <td className="px-4 py-3">{index + 1 + (currentPage - 1) * itemsPerPage}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-gray-800">
                              {transactionDisplay.identifier}
                            </span>
                            <span className="text-xs uppercase tracking-wide text-gray-500">
                              {transactionDisplay.isManual ? "Manual entry" : "M-Pesa code"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{payment.tenantName || payment.tenantId || "Unknown"}</td>
                        <td className="px-4 py-3">
                          {properties.find((p) => p._id === payment.propertyId)?.name || "N/A"}
                        </td>
                        <td className="px-4 py-3">{`${baseUnitType} (${payment.unitType})`}</td>
                        <td className="px-4 py-3">{payment.type}</td>
                        <td className="px-4 py-3">Ksh {payment.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {new Date(payment.paymentDate || payment.createdAt).toLocaleString("en-KE", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusStyles(payment.status)}`}>
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {totalPayments > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 p-4">
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, totalPayments)} of {totalPayments} payments
                  </div>
                  {totalPages > 1 && (
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      {getPageNumbers().map((page, index) => (
                        <button
                          key={index}
                          onClick={() => typeof page === "number" && handlePageChange(page)}
                          disabled={page === "..." || page === currentPage || isLoading}
                          className={`px-3 py-1 rounded-lg transition text-xs sm:text-sm ${page === currentPage
                              ? "bg-primary text-white"
                              : page === "..."
                                ? "bg-gray-100 text-gray-500 cursor-default"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          aria-label={typeof page === "number" ? `Page ${page}` : "Ellipsis"}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages || isLoading}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
    </div>
  );
}







