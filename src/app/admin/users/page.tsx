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
  LogIn,
  Shield,
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
  managementType?: "rentals" | "airbnb" | string;
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
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<PropertyOwner | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PropertyOwner | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    const loadCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
      } catch {
        // ignore csrf preload errors
      }
    };
    if (status === "authenticated") {
      loadCsrf();
    }
  }, [status]);

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

  const formatOwnerType = (value?: string) =>
    value?.toLowerCase() === "airbnb" ? "Airbnb / Short-term" : "Rentals / Long-term";

  // ── Expand / Collapse ──────────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const openDeleteModal = (owner: PropertyOwner) => {
    setDeleteTarget(owner);
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.isApproved) {
      setDeleteError("Approved owners cannot be deleted. Only pending owners can be removed.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/admin/property-owners/${deleteTarget._id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();

      if (data.success) {
        setPropertyOwners((prev) => prev.filter((o) => o._id !== deleteTarget._id));
        setShowDeleteModal(false);
        setDeleteTarget(null);
        setError(null);
      } else {
        setDeleteError(data.message || "Delete failed");
      }
    } catch {
      setDeleteError("Delete request failed. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = (owner: PropertyOwner) => {
    setEditUser(owner);
    setShowEditModal(true);
  };

  const openImpersonateModal = (owner: PropertyOwner) => {
    setImpersonateTarget(owner);
    setImpersonateError(null);
    setShowImpersonateModal(true);
  };

  const ensureCsrfToken = async () => {
    if (csrfToken) return csrfToken;
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget) return;
    setIsImpersonating(true);
    setImpersonateError(null);

    try {
      const token = await ensureCsrfToken();
      if (!token) {
        setImpersonateError("Security token missing. Please refresh and try again.");
        setIsImpersonating(false);
        return;
      }

      const res = await fetch("/api/admin/impersonate-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": token },
        credentials: "include",
        body: JSON.stringify({ ownerId: impersonateTarget._id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setImpersonateError(data.message || "Failed to impersonate owner");
        setIsImpersonating(false);
        return;
      }

      const redirect = data.redirect || "/property-owner-dashboard";
      window.location.href = redirect;
    } catch {
      setImpersonateError("Impersonation request failed.");
      setIsImpersonating(false);
    }
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Property Owners</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Approve, update, or impersonate owner accounts.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-hover text-white rounded-xl shadow-md hover:shadow-lg transition-all text-xs sm:text-sm font-semibold"
              >
                <Plus size={16} />
                Add New Owner
              </button>
            </div>
          </motion.section>

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

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="surface-card rounded-2xl h-20 animate-pulse" />
              <div className="surface-card rounded-2xl h-20 animate-pulse" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="table-shell"
            >
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("name")}
                      >
                        Name {getSortIcon("name")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("email")}
                      >
                        Email {getSortIcon("email")}
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("phone")}
                      >
                        Phone {getSortIcon("phone")}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Type
                      </th>
                      <th
                        className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-primary"
                        onClick={() => handleSort("createdAt")}
                      >
                        Created {getSortIcon("createdAt")}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Status
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {propertyOwners.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                          No property owners found.
                        </td>
                      </tr>
                    ) : (
                      propertyOwners.map((owner) => (
                        <React.Fragment key={owner._id}>
                          <tr className="hover:bg-primary/5 transition-colors">
                            <td className="py-3 px-4 text-xs font-medium text-foreground">{owner.name}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{owner.email}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{owner.phone}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {formatOwnerType(owner.managementType)}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
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
                                  onClick={() => openImpersonateModal(owner)}
                                  className="text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
                                  title="Impersonate owner"
                                  disabled={!owner.isApproved}
                                >
                                  <LogIn size={18} />
                                </button>
                                <button
                                  onClick={() => handleEdit(owner)}
                                  className="text-primary hover:text-primary-hover transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(owner)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                                <button
                                  onClick={() => toggleExpand(owner._id)}
                                  className="text-muted-foreground hover:text-primary transition-colors"
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
                              <td colSpan={7} className="bg-white/70 px-4 py-4">
                                <div className="grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
                                  <div>
                                    <div className="text-lg font-semibold text-primary">
                                      {owner.propertiesCount ?? 0}
                                    </div>
                                    <div className="mt-1 text-[10px]">Properties</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-semibold text-primary">
                                      {owner.paymentsCount ?? 0}
                                    </div>
                                    <div className="mt-1 text-[10px]">Payments</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-semibold text-primary">
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
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-3">
              <div className="modal-panel max-w-sm w-full overflow-hidden">
                <div className="modal-header px-4 sm:px-5 py-3">
                  <h2 className="text-base font-semibold text-foreground">Add New Property Owner</h2>
                </div>

                <div className="modal-body modal-stagger">
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
                    className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    required
                    value={newOwner.email}
                    onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                    className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    required
                    value={newOwner.phone}
                    onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                    className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    required
                    minLength={6}
                    value={newOwner.password}
                    onChange={(e) => setNewOwner({ ...newOwner, password: e.target.value })}
                    className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                  />

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateError(null);
                        setNewOwner({ name: "", email: "", phone: "", password: "" });
                      }}
                      className="px-4 py-2 bg-white/70 text-muted-foreground rounded-md hover:bg-white transition text-xs font-medium border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition text-xs font-medium shadow-md"
                    >
                      Create Owner
                    </button>
                  </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {showEditModal && editUser && (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-3">
              <div className="modal-panel max-w-sm w-full overflow-hidden">
                <div className="modal-header px-4 sm:px-5 py-3">
                  <h2 className="text-base font-semibold text-foreground">Edit Property Owner</h2>
                </div>

                <form onSubmit={handleUpdate} className="modal-body modal-stagger space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
                    <input
                      type="text"
                      value={editUser.name}
                      onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                      className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                    <input
                      type="email"
                      value={editUser.email}
                      onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                      className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={editUser.phone}
                      onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                      className="w-full p-2.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white/70 text-foreground"
                    />
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-4 py-2 bg-white/70 text-muted-foreground rounded-md hover:bg-white transition text-xs font-medium border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition text-xs font-medium shadow-md"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Impersonate Modal */}
          {showImpersonateModal && impersonateTarget && (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-3">
              <div className="modal-panel max-w-sm w-full overflow-hidden">
                <div className="modal-header flex items-center gap-3 px-4 sm:px-5 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Impersonate Owner</h2>
                    <p className="text-xs text-muted-foreground">View the owner dashboard as this account.</p>
                  </div>
                </div>

                <div className="modal-body modal-stagger">
                  {impersonateError && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md flex items-center gap-2 text-xs">
                      <AlertCircle size={18} />
                      <span>{impersonateError}</span>
                    </div>
                  )}

                  <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-3 text-xs text-foreground">
                    <p className="font-semibold">You are about to impersonate:</p>
                    <p className="mt-1">{impersonateTarget.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{impersonateTarget.email}</p>
                  </div>

                  {!impersonateTarget.isApproved && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      This owner is not approved yet. Approve the account before impersonating.
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImpersonateModal(false);
                        setImpersonateTarget(null);
                        setImpersonateError(null);
                      }}
                      className="px-4 py-2 bg-white/70 text-muted-foreground rounded-md hover:bg-white transition text-xs font-medium border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleImpersonate}
                      disabled={isImpersonating || !impersonateTarget.isApproved}
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition text-xs font-medium shadow-md disabled:opacity-60"
                    >
                      {isImpersonating ? "Switching..." : "Impersonate Owner"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delete Modal */}
          {showDeleteModal && deleteTarget && (
            <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-3">
              <div className="modal-panel max-w-sm w-full overflow-hidden">
                <div className="modal-header flex items-center gap-3 px-4 sm:px-5 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Delete Property Owner</h2>
                    <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                  </div>
                </div>

                <div className="modal-body modal-stagger">
                  {deleteError && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md flex items-center gap-2 text-xs">
                      <AlertCircle size={18} />
                      <span>{deleteError}</span>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-white/70 px-3 py-3 text-xs text-foreground">
                    <p className="font-semibold">You are about to delete:</p>
                    <p className="mt-1">{deleteTarget.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{deleteTarget.email}</p>
                  </div>

                  {deleteTarget.isApproved && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      Approved owners cannot be deleted. Only pending sign-ups can be removed.
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteModal(false);
                        setDeleteTarget(null);
                        setDeleteError(null);
                      }}
                      className="px-4 py-2 bg-white/70 text-muted-foreground rounded-md hover:bg-white transition text-xs font-medium border border-border"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting || deleteTarget.isApproved}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition text-xs font-medium shadow-md disabled:opacity-60"
                    >
                      {isDeleting ? "Deleting..." : "Delete Owner"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
