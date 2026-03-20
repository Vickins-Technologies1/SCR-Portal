// app/admin/property-owners/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
  Plus,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface PropertyOwner {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  createdAt: string;
  isApproved?: boolean;
  approvedAt?: string | null;
  propertiesCount: number;
  paymentsCount: number;
  invoicesCount: number;
}

interface SortConfig {
  key: keyof PropertyOwner;
  direction: "asc" | "desc";
}

export default function PropertyOwnersPage() {
  const router = useRouter();

  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "name",
    direction: "asc",
  });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editUser, setEditUser] = useState<PropertyOwner | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOwner, setNewOwner] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // ── Fetch property owners ───────────────────────────────────────────────────
  const fetchPropertyOwners = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/property-owners", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        throw new Error("Session expired");
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        setPropertyOwners(data.propertyOwners || []);
      } else {
        setError(data.message || "Failed to fetch owners.");
      }
    } catch (err: any) {
      setError(
        err.message?.includes("Session expired")
          ? "Your session has expired."
          : "Failed to load property owners. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchPropertyOwners();
    }
  }, [status, fetchPropertyOwners]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const handleSort = (key: keyof PropertyOwner) => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...propertyOwners].sort((a, b) => {
        const A = String(a[key] ?? "").toLowerCase();
        const B = String(b[key] ?? "").toLowerCase();
        return direction === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      });
      setPropertyOwners(sorted);
      return { key, direction };
    });
  };

  const getSortIcon = (key: keyof PropertyOwner) => {
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

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this owner? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/api/admin/property-owners/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setPropertyOwners(propertyOwners.filter((o) => o._id !== id));
        setError(null);
      } else {
        setError(data.message || "Delete failed");
      }
    } catch {
      setError("Delete request failed. Please try again.");
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = (owner: PropertyOwner) => {
    setEditUser(owner);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    try {
      const res = await fetch(`/api/admin/property-owners/${editUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editUser.name,
          email: editUser.email,
          phone: editUser.phone,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPropertyOwners(
          propertyOwners.map((o) => (o._id === editUser._id ? { ...o, ...editUser } : o))
        );
        setShowEditModal(false);
        setEditUser(null);
      } else {
        setError(data.message || "Update failed");
      }
    } catch {
      setError("Update request failed.");
    }
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/property-owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newOwner),
      });

      const data = await res.json();

      if (data.success) {
        setPropertyOwners([data.propertyOwner, ...propertyOwners]);
        setShowCreateModal(false);
        setNewOwner({ name: "", email: "", phone: "", password: "" });
      } else {
        setCreateError(data.message || "Could not create owner");
      }
    } catch {
      setCreateError("Server error during creation");
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
              <Users size={20} />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Property Owners</h1>
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
                    fetchPropertyOwners();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end mb-5">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#03a678] text-white text-xs font-medium rounded-md hover:bg-[#027a55] transition-all shadow-md hover:shadow-lg"
            >
              <Plus size={16} />
              Add New Owner
            </button>
          </div>

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
                        Name {getSortIcon("name")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("email")}
                      >
                        Email {getSortIcon("email")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("phone")}
                      >
                        Phone {getSortIcon("phone")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:text-[#03a678]"
                        onClick={() => handleSort("createdAt")}
                      >
                        Created {getSortIcon("createdAt")}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {propertyOwners.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-xs text-gray-500">
                          No property owners found.
                        </td>
                      </tr>
                    ) : (
                      propertyOwners.map((owner) => (
                        <React.Fragment key={owner._id}>
                          <tr className="hover:bg-gray-50/70 transition-colors">
                            <td className="py-3 px-4 text-xs font-medium text-gray-900">{owner.name}</td>
                            <td className="py-3 px-4 text-xs text-gray-600">{owner.email}</td>
                            <td className="py-3 px-4 text-xs text-gray-600">{owner.phone}</td>
                            <td className="py-3 px-4 text-xs text-gray-600">
                              {owner.createdAt}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  owner.isApproved
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {owner.isApproved ? "Approved" : "Pending"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleEdit(owner)}
                                  className="text-[#03a678] hover:text-[#027a55] transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => handleDelete(owner._id)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                                <button
                                  onClick={() => toggleExpand(owner._id)}
                                  className="text-gray-500 hover:text-[#03a678] transition-colors"
                                  title="View stats"
                                >
                                  {expanded.includes(owner._id) ? (
                                    <ChevronUp size={18} />
                                  ) : (
                                    <ChevronDown size={18} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {expanded.includes(owner._id) && (
                            <tr>
                              <td colSpan={6} className="bg-gray-50/70 px-4 py-4">
                                <div className="grid grid-cols-3 gap-6 text-center text-xs text-gray-700">
                                  <div>
                                    <div className="text-lg font-semibold text-[#03a678]">
                                      {owner.propertiesCount ?? 0}
                                    </div>
                                    <div className="mt-1 text-[10px]">Properties</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-semibold text-[#03a678]">
                                      {owner.paymentsCount ?? 0}
                                    </div>
                                    <div className="mt-1 text-[10px]">Payments</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-semibold text-[#03a678]">
                                      {owner.invoicesCount ?? 0}
                                    </div>
                                    <div className="mt-1 text-[10px]">Invoices</div>
                                  </div>
                                </div>
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

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Add New Property Owner</h2>

                {createError && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md flex items-center gap-2 text-xs">
                    <AlertCircle size={20} />
                    <span>{createError}</span>
                  </div>
                )}

                <form onSubmit={handleCreate} className="space-y-3.5">
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    value={newOwner.name}
                    onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    required
                    value={newOwner.email}
                    onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    required
                    value={newOwner.phone}
                    onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    required
                    minLength={6}
                    value={newOwner.password}
                    onChange={(e) => setNewOwner({ ...newOwner, password: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                  />

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateError(null);
                        setNewOwner({ name: "", email: "", phone: "", password: "" });
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#03a678] text-white rounded-md hover:bg-[#027a55] transition text-xs font-medium shadow-md"
                    >
                      Create Owner
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {showEditModal && editUser && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Property Owner</h2>

                <form onSubmit={handleUpdate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Name</label>
                    <input
                      type="text"
                      value={editUser.name}
                      onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                      className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={editUser.email}
                      onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                      className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={editUser.phone}
                      onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                      className="w-full p-2.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#03a678]/40 focus:border-[#03a678] transition"
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
        </main>
      </div>
    </div>
  );
}
