"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Plus,
  AlertCircle,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  urgency: "low" | "medium" | "high";
  date: string;
  propertyId: string;
  tenantId: string;
  tenantName?: string;
  ownerId?: string;
}

export default function MaintenanceRequestsPage() {
  const router = useRouter();

  /* ---------- STATE ---------- */
  const [isClient, setIsClient] = useState(false);
  const [role, setRole] = useState<"tenant" | "propertyOwner" | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [form, setForm] = useState({
    title: "",
    description: "",
    urgency: "medium" as "low" | "medium" | "high",
  });
  const [formErrors, setFormErrors] = useState<{ title?: string; description?: string }>({});

  const isFetching = useRef(false);

  /* ---------- CLIENT-SIDE CHECK ---------- */
  useEffect(() => {
    setIsClient(true);
  }, []);

  /* ---------- ROLE + CSRF (only once) ---------- */
  useEffect(() => {
    if (!isClient) return;

    const r = Cookies.get("role") as "tenant" | "propertyOwner" | undefined;
    if (!r) {
      router.replace("/");
      return;
    }
    setRole(r);

    const existing = Cookies.get("csrf-token");
    if (existing) {
      setCsrfToken(existing);
    } else {
      fetchCsrfToken();
    }
  }, [isClient, router]);

  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();

      if (data.success && data.csrfToken) {
        const token = data.csrfToken;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, {
          path: "/",
          secure: true,
          sameSite: "strict",
          expires: 1,
        });
        return token;
      } else {
        setError("Failed to fetch CSRF token");
        setLoading(false);
        return null;
      }
    } catch (e) {
      console.error(e);
      setError("Failed to fetch CSRF token");
      setLoading(false);
      return null;
    }
  }, []);

  /* ---------- FETCH DATA (no loop) ---------- */
  const fetchData = useCallback(
    async (retry = 0) => {
      if (!role || !csrfToken || isFetching.current) return;
      isFetching.current = true;

      if (retry > 1) {
        setError("Failed after retry. Please refresh.");
        isFetching.current = false;
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const currentCsrfToken = csrfToken;

      try {
        const endpoint =
          role === "tenant"
            ? "/api/tenants/maintenance"
            : "/api/property-owners/maintenance";

        const res = await fetch(`${endpoint}?page=${page}&limit=${limit}`, {
          method: "GET",
          credentials: "include",
          headers: { "X-CSRF-Token": currentCsrfToken },
        });

        if (res.status === 403) {
          console.log("[CSRF] 403 → fetching fresh token...");
          const fresh = await fetchCsrfToken();
          if (fresh) {
            setCsrfToken(fresh);
            isFetching.current = false;
            return; // useEffect will re-run
          }
          throw new Error("Session expired");
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const payload = await res.json();
        const list: MaintenanceRequest[] = payload?.data?.requests ?? payload?.requests ?? [];
        const totalCount = payload?.total ?? payload?.data?.total ?? list.length;
        const totalPagesCount = payload?.totalPages ?? Math.ceil(totalCount / limit);

        setRequests(list);
        setTotal(totalCount);
        setTotalPages(totalPagesCount);
      } catch (e: any) {
        setError(e.message ?? "Failed to load requests");
      } finally {
        isFetching.current = false;
        setLoading(false);
      }
    },
    [role, page, limit, fetchCsrfToken] // csrfToken NOT in deps
  );

  useEffect(() => {
    if (role && csrfToken) {
      fetchData();
    }
  }, [role, page, csrfToken, fetchData]);

  /* ---------- SUBMIT NEW REQUEST (tenant only) ---------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: typeof formErrors = {};
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.description.trim()) errors.description = "Description is required";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    if (!csrfToken) {
      setError("CSRF token missing");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const propertyId = Cookies.get("propertyId");
      if (!propertyId) throw new Error("Property not found");

      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        urgency: form.urgency,
        propertyId,
      };

      const res = await fetch("/api/tenants/maintenance", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 403) {
        const fresh = await fetchCsrfToken();
        if (!fresh) throw new Error("Session expired");
        setCsrfToken(fresh);
        throw new Error("Please try again");
      }

      if (!res.ok) throw new Error("Submission failed");

      const data = await res.json();
      if (data.success) {
        setRequests((prev) => [data.data, ...prev]);
        closeModal();
      }
    } catch (e: any) {
      setError(e.message ?? "Unable to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm({ title: "", description: "", urgency: "medium" });
    setFormErrors({});
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  /* ---------- UI ---------- */
  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pt-16">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 sm:p-8"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Wrench className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Maintenance Requests
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Track and submit repair requests
                </p>
              </div>
            </div>

            {role === "tenant" && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
              >
                <Plus className="h-5 w-5" />
                New Request
              </button>
            )}
          </div>

          {/* Global error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2"
              >
                <AlertCircle className="h-5 w-5" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-hidden rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Date
                  </th>
                  {role === "propertyOwner" && (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Tenant
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={role === "propertyOwner" ? 5 : 4}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      <Loader2 className="inline-block h-6 w-6 animate-spin mr-2" />
                      Loading requests…
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === "propertyOwner" ? 5 : 4}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No maintenance requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <motion.tr
                      key={r._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {r.title}
                      </td>
                      <td className="px-6 py-4">
                        <UrgencyBadge urgency={r.urgency} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(r.date).toLocaleDateString("en-GB")}
                      </td>
                      {role === "propertyOwner" && (
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {r.tenantName || "Unknown"}
                        </td>
                      )}
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <Loader2 className="inline-block h-6 w-6 animate-spin mr-2" />
                Loading…
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No requests found.
              </div>
            ) : (
              requests.map((r) => (
                <motion.div
                  key={r._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
                >
                  <h3 className="font-semibold text-gray-900">{r.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {r.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <UrgencyBadge urgency={r.urgency} />
                    <StatusBadge status={r.status} />
                  </div>
                  {role === "propertyOwner" && r.tenantName && (
                    <p className="text-xs text-gray-500 mt-1">
                      Tenant: {r.tenantName}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-3">
                    {new Date(r.date).toLocaleDateString("en-GB")}
                  </p>
                </motion.div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1 || loading}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-100 rounded-full hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <span className="text-sm text-gray-600">
                Page {page} of {totalPages} ({total} total)
              </span>

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages || loading}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-100 rounded-full hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* ---------- NEW REQUEST MODAL ---------- */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-gray-900">
                  New Maintenance Request
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    placeholder="e.g. Leaking faucet in kitchen"
                  />
                  {formErrors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    rows={4}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition resize-none"
                    placeholder="Describe the issue in detail..."
                  />
                  {formErrors.description && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.description}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Urgency Level
                  </label>
                  <select
                    value={form.urgency}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        urgency: e.target.value as any,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  >
                    <option value="low">Low – Not urgent</option>
                    <option value="medium">Medium – Needs attention soon</option>
                    <option value="high">High – Critical issue</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      "Submit Request"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- BADGES ---------- */
function UrgencyBadge({ urgency }: { urgency: "low" | "medium" | "high" }) {
  const map = {
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`px-3 py-1 text-xs font-medium rounded-full ${map[urgency]}`}
    >
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "Pending" | "In Progress" | "Resolved";
}) {
  const map = {
    Pending: "bg-yellow-100 text-yellow-800",
    "In Progress": "bg-blue-100 text-blue-800",
    Resolved: "bg-green-100 text-green-800",
  };
  return (
    <span className={`px-3 py-1 text-xs font-medium rounded-full ${map[status]}`}>
      {status}
    </span>
  );
}