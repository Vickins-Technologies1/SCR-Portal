"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CreditCard, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { usePermissions } from "@/hooks/usePermissions";
import { useAccountTier } from "@/hooks/useAccountTier";
import { TableRowsSkeleton } from "@/components/ui/LoadingSkeletons";

interface Payment {
  _id: string;
  tenantId: string | null;
  amount: number;
  propertyId: string;
  paymentDate: string;
  date?: string;
  transactionId: string;
  status: string;
  tenantName: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  phoneNumber: string;
  reference: string;
  unitType: string;
  createdAt: string;
  mpesaCode?: string;
  isManual?: boolean;
  originalAmount?: number;
  reversedAmount?: number;
  allocation?: { rent?: number; utilities?: number; deposit?: number; other?: number; walletCredit?: number };
  paymentMethod?: string;
  unitIdentifier?: string;
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
  const { isFree } = useAccountTier();
  const canViewPayments = perm.canViewPayments;
  const canManagePayments = perm.hasPermission("payments:record");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPayments, setTotalPayments] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalNote, setReversalNote] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
      Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", expires: 1, path: "/" });
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

  const reverseManualPayment = useCallback(async () => {
    const payment = paymentToReverse;
    if (!payment) return;
    if (!canManagePayments) {
      setError("You do not have permission to reverse manual payments.");
      return;
    }
    if (!reversalReason || (reversalReason === "Other" && !reversalNote.trim())) {
      setError("Choose a reason and add a note when selecting Other.");
      return;
    }
    setReversingPaymentId(payment._id);
    setError(null);
    setSuccessMessage(null);

    const runReversal = async (token: string) => {
      const res = await fetch(`/api/payments/${encodeURIComponent(payment._id)}/reverse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "include",
        body: JSON.stringify({ reason: reversalReason, note: reversalNote.trim() }),
      });
      const data = await res.json().catch(() => null);
      return { res, data };
    };

    try {
      const token = csrfToken || (await fetchCsrfToken());
      if (!token) {
        setError("Missing CSRF token. Refresh and try again.");
        return;
      }

      let { res, data } = await runReversal(token);

      if (!res.ok && res.status === 403) {
        const newToken = await fetchCsrfToken();
        if (newToken) {
          ({ res, data } = await runReversal(newToken));
        }
      }

      if (!res.ok || !data?.success) {
        setError(data?.message || "Failed to reverse manual payment.");
        return;
      }

      setSuccessMessage("Manual payment reversed. Tenant balances and allocations have been recalculated.");
      setPaymentToReverse(null);
      setReversalReason("");
      setReversalNote("");
      await fetchPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to the server.");
    } finally {
      setReversingPaymentId(null);
    }
  }, [canManagePayments, csrfToken, fetchCsrfToken, fetchPayments, paymentToReverse, reversalReason, reversalNote]);

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
      case "pending_stk":
        return "text-yellow-600 bg-yellow-100";
      case "failed":
        return "text-red-600 bg-red-100";
      case "reversed":
        return "text-gray-600 bg-gray-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };
  const formatTransactionDisplay = (payment: Payment) => {
    const isManual = payment.isManual ?? payment.transactionId?.startsWith("MANUAL-");
    const identifier = isManual ? payment.transactionId : payment.mpesaCode || payment.transactionId || "N/A";
    return { identifier, isManual };
  };

  const formatPaymentDate = (payment: Payment) => {
    const rawDate = payment.paymentDate || payment.date || payment.createdAt;
    if (!rawDate) return "—";

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return rawDate;
    }

    return new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(parsedDate);
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

          {isFree && (
            <section className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Free Tier Notice</p>
                  <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                    Upgrade to unlock automated tenant payments
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                    You can still view payment history here. Premium enables automated collections, integrations, and advanced operations.
                  </p>
                </div>
                <a
                  href="/upgrade"
                  className="shrink-0 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
                >
                  Upgrade
                </a>
              </div>
            </section>
          )}

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
          {successMessage && (
            <div role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 shadow sm:text-sm">
              {successMessage}
            </div>
          )}
          {isLoading ? (
            <div className="table-shell overflow-hidden" aria-busy="true" aria-label="Loading payments">
              <TableRowsSkeleton rows={6} columns={6} />
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
                    <th className="px-4 py-3 text-left">Actions</th>
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
                          {formatPaymentDate(payment)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusStyles(payment.status)}`}>
                            {payment.reversedAmount && payment.originalAmount && payment.reversedAmount >= payment.originalAmount
                              ? "reversed"
                              : payment.status === "pending_stk" ? "pending" : payment.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canManagePayments && transactionDisplay.isManual && payment.status === "completed" && !(payment.reversedAmount && payment.originalAmount && payment.reversedAmount >= payment.originalAmount) ? (
                            <button
                              type="button"
                              onClick={() => { setPaymentToReverse(payment); setReversalReason(""); setReversalNote(""); setError(null); }}
                              disabled={reversingPaymentId === payment._id}
                              className="inline-flex items-center gap-1.5 justify-center rounded-lg border border-border bg-white/80 px-2.5 py-2 text-xs font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              aria-label="Reverse manual payment"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Reverse
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
          {paymentToReverse && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation">
              <section role="dialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-2xl">
                <h2 id="reverse-payment-title" className="text-lg font-semibold">Reverse manual payment</h2>
                <p className="mt-1 text-sm text-muted-foreground">This keeps the original transaction in the audit history and recalculates the tenant’s outstanding rent, utilities, deposit, and later payment allocations.</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Tenant</dt><dd className="font-medium">{paymentToReverse.tenantName || "Unknown"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Property / unit</dt><dd className="font-medium">{properties.find((p) => p._id === paymentToReverse.propertyId)?.name || "Unknown"} · {paymentToReverse.unitIdentifier || paymentToReverse.unitType || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Original amount</dt><dd className="font-medium">Ksh {(paymentToReverse.originalAmount ?? paymentToReverse.amount).toFixed(2)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Payment date</dt><dd className="font-medium">{formatPaymentDate(paymentToReverse)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Method</dt><dd className="font-medium">{paymentToReverse.paymentMethod || "Manual entry"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="font-medium">{paymentToReverse.reference || paymentToReverse.transactionId || "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">Allocation</dt><dd className="font-medium">Rent {paymentToReverse.allocation?.rent ?? 0} · Utilities {paymentToReverse.allocation?.utilities ?? 0} · Deposit {paymentToReverse.allocation?.deposit ?? 0} · Credit {paymentToReverse.allocation?.walletCredit ?? 0}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Current status</dt><dd className="font-medium">{paymentToReverse.status}</dd></div>
                </dl>
                <label className="mt-4 block text-sm font-medium">Correction reason
                  <select value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
                    <option value="">Select a reason</option>
                    <option>Incorrect amount</option><option>Wrong tenant</option><option>Wrong property or unit</option><option>Duplicate manual entry</option><option>Payment was not received</option><option>Incorrect payment date or reference</option><option>Other</option>
                  </select>
                </label>
                <label className="mt-3 block text-sm font-medium">Note{reversalReason === "Other" ? " (required)" : " (optional)"}
                  <textarea value={reversalNote} onChange={(event) => setReversalNote(event.target.value.slice(0, 500))} rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="Add details for the audit record" />
                </label>
                {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setPaymentToReverse(null); setError(null); }} disabled={reversingPaymentId === paymentToReverse._id} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
                  <button type="button" onClick={reverseManualPayment} disabled={reversingPaymentId === paymentToReverse._id || !reversalReason || (reversalReason === "Other" && !reversalNote.trim())} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{reversingPaymentId === paymentToReverse._id ? "Reversing…" : "Confirm reversal"}</button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}







