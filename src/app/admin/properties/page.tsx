// src/app/admin/properties/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowUpDown, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";
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
}

interface SortConfig {
  key: keyof Property | "ownerEmail";
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

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── 1. Verify session (httpOnly cookies) ───────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();

      if (!data.authenticated) {
        throw new Error("Not authenticated");
      }

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

  // ── 2. Fetch properties when authenticated ────────────────────────────────
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
        throw new Error("Session expired");
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: ApiResponse = await res.json();

      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch (err: any) {
      setError(
        err.message.includes("Session expired")
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
    (key: keyof Property | "ownerEmail") => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
        const sorted = [...properties].sort((a, b) => {
          if (key === "ownerEmail") {
            const aVal = a.ownerEmail || "";
            const bVal = b.ownerEmail || "";
            return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
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

  const getSortIcon = (key: keyof Property | "ownerEmail") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4 text-white" />;
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="inline ml-1 h-4 w-4 text-white" />
    ) : (
      <ChevronDown className="inline ml-1 h-4 w-4 text-white" />
    );
  };

  // ── Expand / Collapse unit types ───────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpanded((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Delete property ────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this property? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/admin/properties/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setProperties(properties.filter((p) => p._id !== id));
      } else {
        setError(data.message || "Failed to delete property.");
      }
    } catch {
      setError("Delete request failed. Please try again.");
    }
  };

  // ── Edit property ──────────────────────────────────────────────────────────
  const handleEdit = (property: Property) => {
    setEditProperty(property);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProperty) return;

    try {
      const res = await fetch(`/api/admin/properties/${editProperty._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editProperty.name,
          // ownerId: editProperty.ownerId,  // usually not changeable from here
        }),
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

  // ── Rendering ──────────────────────────────────────────────────────────────
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

  if (status === "unauthenticated") return null; // redirect already handled

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6">
            <Building2 className="text-[#012a4a] h-6 w-6" />
            Properties
          </h1>

          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-6 rounded-lg shadow">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-10 text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading properties...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-md">
                <thead className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white">
                  <tr>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("name")}
                    >
                      Property Name {getSortIcon("name")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("ownerEmail")}
                    >
                      Owner Email {getSortIcon("ownerEmail")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Unit Types</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-600">
                        No properties found.
                      </td>
                    </tr>
                  ) : (
                    properties.map((p, index) => (
                      <React.Fragment key={p._id}>
                        <tr
                          className="border-b border-gray-200 hover:bg-gray-50"
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                          <td className="py-3 px-4 text-sm text-gray-800">{p.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{p.ownerEmail || "N/A"}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {p.unitTypes.length > 0 ? (
                              <button
                                className="text-white hover:text-gray-200"
                                onClick={() => toggleExpand(p._id)}
                              >
                                {expanded.includes(p._id) ? (
                                  <ChevronUp className="h-5 w-5" />
                                ) : (
                                  <ChevronDown className="h-5 w-5" />
                                )}
                              </button>
                            ) : (
                              "No units"
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleEdit(p)}
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                aria-label={`Edit ${p.name}`}
                              >
                                <Edit className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(p._id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                aria-label={`Delete ${p.name}`}
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expanded.includes(p._id) && (
                          <tr className="bg-gray-50">
                            <td colSpan={4} className="py-4 px-6">
                              <h4 className="text-sm font-semibold text-gray-800 mb-2">Unit Types</h4>
                              {p.unitTypes.length === 0 ? (
                                <p className="text-sm text-gray-600">No unit types defined</p>
                              ) : (
                                <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
                                  {p.unitTypes.map((u, i) => (
                                    <li key={`${p._id}-${i}`}>
                                      <span className="font-medium">{u.type}</span>
                                      {u.price != null && ` • Price: Ksh ${u.price.toLocaleString()}`}
                                      {u.deposit != null && ` • Deposit: Ksh ${u.deposit.toLocaleString()}`}
                                      {u.managementFee != null && ` • Fee: Ksh ${u.managementFee.toLocaleString()}`}
                                      {u.managementType && ` (${u.managementType})`}
                                    </li>
                                  ))}
                                </ul>
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
          )}

          {/* Edit Modal */}
          {showEditModal && editProperty && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-5">Edit Property</h2>
                <form onSubmit={handleUpdate}>
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Property Name
                    </label>
                    <input
                      type="text"
                      value={editProperty.name}
                      onChange={(e) => setEditProperty({ ...editProperty, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Owner Email
                    </label>
                    <input
                      type="text"
                      value={editProperty.ownerEmail || "N/A"}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}