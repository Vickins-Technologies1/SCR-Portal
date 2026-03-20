// src/app/admin/properties/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ArrowUpDown,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string;
  unitTypes: {
    type: string;
    price?: number;
    deposit?: number;
    managementType: string;
    managementFee?: number;
  }[];
  totalUnpaidInvoices?: number;
  unpaidInvoiceCount?: number;
  managementFeePercent?: number;
  billingType?: string;
}

interface SortConfig {
  key: keyof Property | "ownerEmail" | "totalUnpaidInvoices";
  direction: "asc" | "desc";
}

interface ApiResponse {
  success: boolean;
  properties?: Property[];
  message?: string;
}

export default function PropertiesPage() {
  const router = useRouter();

  const [properties, setProperties] = useState<Property[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});
  const [feeLoadingId, setFeeLoadingId] = useState<string | null>(null);

  // New states for delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Fetch CSRF token ────────────────────────────────────────────────────────
  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.success && data.csrfToken ? data.csrfToken : null;
    } catch {
      return null;
    }
  }, []);

  // ── Session check ───────────────────────────────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Fetch properties ───────────────────────────────────────────────────────
  const fetchProperties = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/properties", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ApiResponse = await res.json();

      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch (err: any) {
      setError(
        err.message?.includes("Session expired")
          ? "Your session has expired."
          : "Failed to load properties. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProperties();
    }
  }, [status, fetchProperties]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const handleSort = useCallback(
    (key: keyof Property | "ownerEmail" | "totalUnpaidInvoices") => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";

        const sorted = [...properties].sort((a, b) => {
          if (key === "ownerEmail") {
            const aVal = a.ownerEmail || "";
            const bVal = b.ownerEmail || "";
            return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          }

          if (key === "totalUnpaidInvoices") {
            const aVal = a.totalUnpaidInvoices ?? 0;
            const bVal = b.totalUnpaidInvoices ?? 0;
            return direction === "asc" ? aVal - bVal : bVal - aVal;
          }

          const aVal = String(a[key] ?? "");
          const bVal = String(b[key] ?? "");
          return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });

        setProperties(sorted);
        return { key, direction };
      });
    },
    [properties]
  );

  const getSortIcon = (key: keyof Property | "ownerEmail" | "totalUnpaidInvoices") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="inline ml-1 h-4 w-4" />
    ) : (
      <ChevronDown className="inline ml-1 h-4 w-4" />
    );
  };

  // ── Expand / Collapse ──────────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ── Delete flow with confirmation modal ────────────────────────────────────
  const openDeleteModal = (id: string) => {
    setPropertyToDelete(id);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setPropertyToDelete(null);
  };

  const confirmDelete = async () => {
    if (!propertyToDelete) return;

    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) {
        setError("Failed to get security token. Please refresh the page.");
        closeDeleteModal();
        return;
      }

      const res = await fetch(`/api/admin/properties/${propertyToDelete}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setProperties(properties.filter((p) => p._id !== propertyToDelete));
        setError(null);
      } else {
        setError(data.message || "Failed to delete property.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      setError("Delete request failed. Please try again.");
    } finally {
      closeDeleteModal();
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = (property: Property) => {
    setEditProperty(property);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProperty) return;

    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) {
        setError("Failed to get security token. Please refresh the page.");
        return;
      }

      const res = await fetch(`/api/admin/properties/${editProperty._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ name: editProperty.name }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setProperties(
          properties.map((p) =>
            p._id === editProperty._id ? { ...p, ...editProperty } : p
          )
        );
        setShowEditModal(false);
        setEditProperty(null);
      } else {
        setError(data.message || "Failed to update property.");
      }
    } catch {
      setError("Update request failed.");
    }
  };

  
  const handleSetManagementFee = async (property: Property) => {
    const rawValue = feeInputs[property._id] ?? (property.managementFeePercent?.toString() ?? "");
    const percent = Number(rawValue);

    if (!rawValue || Number.isNaN(percent) || percent < 0 || percent > 100) {
      setError("Management fee percent must be a number between 0 and 100.");
      return;
    }

    setFeeLoadingId(property._id);
    setError(null);

    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) {
        setError("Failed to get security token. Please refresh the page.");
        return;
      }

      const res = await fetch(`/api/admin/properties/${property._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ managementFeePercent: percent, createInvoice: true }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setProperties(properties.map((p) =>
          p._id === property._id ? { ...p, managementFeePercent: percent } : p
        ));
      } else {
        setError(data.message || "Failed to create management invoice.");
      }
    } catch (err) {
      console.error("Management invoice error:", err);
      setError("Failed to create management invoice.");
    } finally {
      setFeeLoadingId(null);
    }
  };
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
              <Building2 size={20} />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Properties</h1>
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
                    fetchProperties();
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
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg h-20 animate-pulse" />
              <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg h-20 animate-pulse" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("name")}
                      >
                        Property Name {getSortIcon("name")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("ownerEmail")}
                      >
                        Owner Email {getSortIcon("ownerEmail")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("totalUnpaidInvoices")}
                      >
                        Pending Invoices (Ksh) {getSortIcon("totalUnpaidInvoices")}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Unit Types
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {properties.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-xs text-gray-500">
                          No properties found.
                        </td>
                      </tr>
                    ) : (
                      properties.map((p) => (
                        <React.Fragment key={p._id}>
                          <tr className="hover:bg-gray-50/70 transition-colors">
                            <td className="py-3 px-4 text-xs font-medium text-gray-900">{p.name}</td>
                            <td className="py-3 px-4 text-xs text-gray-600">{p.ownerEmail || "N/A"}</td>
                            <td className="py-3 px-4 text-xs font-medium">
                              {p.totalUnpaidInvoices && p.totalUnpaidInvoices > 0 ? (
                                <span className="text-red-600">
                                  {p.totalUnpaidInvoices.toLocaleString()}
                                  {p.unpaidInvoiceCount && p.unpaidInvoiceCount > 1 && (
                                    <span className="text-[10px] text-red-400 ml-1.5">
                                      ({p.unpaidInvoiceCount})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-600">
                              {p.unitTypes.length > 0 ? (
                                <button
                                  onClick={() => toggleExpand(p._id)}
                                  className="text-[#03a678] hover:text-[#027a55] transition-colors"
                                  title="View unit types"
                                >
                                  {expanded.includes(p._id) ? (
                                    <ChevronUp size={18} />
                                  ) : (
                                    <ChevronDown size={18} />
                                  )}
                                </button>
                              ) : (
                                "No units"
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleEdit(p)}
                                  className="text-[#03a678] hover:text-[#027a55] transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(p._id)} // ← changed to open modal
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {expanded.includes(p._id) && (
                            <tr>
                              <td colSpan={5} className="bg-gray-50/70 px-4 py-4">
                                <h4 className="text-xs font-semibold text-gray-800 mb-2">Unit Types</h4>
                                {p.unitTypes.length === 0 ? (
                                  <p className="text-xs text-gray-600">No unit types defined</p>
                                ) : (
                                  <ul className="space-y-1.5 text-xs text-gray-700">
                                    {p.unitTypes.map((u, i) => (
                                      <li key={i} className="flex flex-wrap gap-x-4 gap-y-1">
                                        <span className="font-medium">{u.type}</span>
                                        {u.price != null && (
                                          <span>Price: Ksh {u.price.toLocaleString()}</span>
                                        )}
                                        {u.deposit != null && (
                                          <span>Deposit: Ksh {u.deposit.toLocaleString()}</span>
                                        )}
                                        {u.managementFee != null && (
                                          <span>Fee: Ksh {u.managementFee.toLocaleString()}</span>
                                        )}
                                        {u.managementType && (
                                          <span className="text-gray-500">({u.managementType})</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {(p.billingType ? p.billingType === "FullManagement" : p.unitTypes.some((u) => u.managementType === "FullManagement")) ? (
                                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                    <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                                      <div className="flex-1">
                                        <label className="block text-[10px] font-semibold text-emerald-800 uppercase tracking-wide mb-1.5">
                                          Full Management Fee (% of expected income)
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={feeInputs[p._id] ?? (p.managementFeePercent?.toString() ?? "")}
                                          onChange={(e) =>
                                            setFeeInputs({ ...feeInputs, [p._id]: e.target.value })
                                          }
                                          className="w-full rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                        />
                                        <p className="mt-2 text-[10px] text-emerald-800/80">
                                          Creates a monthly invoice based on expected income for this property.
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => handleSetManagementFee(p)}
                                        disabled={feeLoadingId === p._id}
                                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {feeLoadingId === p._id ? "Saving..." : "Save & Create Invoice"}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-3 text-[10px] text-gray-500">
                                    Software leasing invoices are 1.5% of expected monthly income and are auto-generated when tenants are added.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Edit Modal */}
          {showEditModal && editProperty && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Property</h2>

                <form onSubmit={handleUpdate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Property Name
                    </label>
                    <input
                      type="text"
                      value={editProperty.name}
                      onChange={(e) => setEditProperty({ ...editProperty, name: e.target.value })}
                      required
                      className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Owner Email
                    </label>
                    <input
                      type="text"
                      value={editProperty.ownerEmail || "N/A"}
                      disabled
                      className="w-full p-2.5 border border-gray-300 rounded-md bg-gray-100 text-xs text-gray-600 cursor-not-allowed"
                    />
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#03a678] text-white rounded-md hover:bg-[#027a55] transition text-xs font-medium shadow-md"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 relative"
              >
                <button
                  onClick={closeDeleteModal}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 transition"
                  aria-label="Close"
                >
                  <X size={24} />
                </button>

                <div className="text-center mb-5">
                  <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                    <Trash2 className="h-6 w-6 text-red-600" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 mb-2">
                    Delete Property
                  </h2>
                  <p className="text-xs text-gray-600">
                    Are you sure you want to delete this property? This action cannot be undone.
                  </p>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition text-xs font-medium shadow-md flex items-center gap-2"
                  >
                    <Trash2 size={16} />
                    Delete Property
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}








