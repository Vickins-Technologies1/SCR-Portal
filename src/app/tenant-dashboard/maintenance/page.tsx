// src/app/tenant-dashboard/maintenance/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Plus, AlertCircle, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  urgency: "low" | "medium" | "high";
  date: string;
}

export default function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  const limit = 10;

  const [form, setForm] = useState({
    title: "",
    description: "",
    urgency: "medium" as "low" | "medium" | "high",
  });

  const [formErrors, setFormErrors] = useState<{ title?: string; description?: string }>({});

  // Initialize auth: CSRF + Profile
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Step 1: Get CSRF token
        const csrfRes = await fetch("/api/csrf-token", {
          credentials: "include",
        });
        const csrfData = await csrfRes.json();
        if (!csrfData.success || !csrfData.csrfToken) {
          throw new Error("Failed to get security token");
        }
        setCsrfToken(csrfData.csrfToken);

        // Step 2: Get tenant profile (contains propertyId)
        const profileRes = await fetch("/api/tenant/profile", {
          method: "GET",
          credentials: "include",
          headers: {
            "x-csrf-token": csrfData.csrfToken,
          },
        });

        const profileData = await profileRes.json();
        if (!profileData.success || !profileData.tenant?.propertyId) {
          throw new Error("Not linked to any property");
        }

        setPropertyId(profileData.tenant.propertyId);
      } catch (err: any) {
        setError(err.message || "Authentication failed. Please log in again.");
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!csrfToken) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/tenants/maintenance?page=${page}&limit=${limit}`, {
        credentials: "include",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to load requests");
      }

      setRequests(data.data.requests);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [csrfToken, page]);

  useEffect(() => {
    if (csrfToken && propertyId) {
      fetchRequests();
    }
  }, [fetchRequests, csrfToken, propertyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: typeof formErrors = {};
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.description.trim()) errors.description = "Description is required";
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) return;

    if (!csrfToken || !propertyId) {
      setError("Authentication missing. Please refresh the page.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tenants/maintenance", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          urgency: form.urgency,
          propertyId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Server error: ${res.status}`);
      }

      if (!data.success) {
        throw new Error(data.message || "Failed to submit request");
      }

      // Add new request to top
      setRequests(prev => [data.data, ...prev]);
      setIsModalOpen(false);
      setForm({ title: "", description: "", urgency: "medium" });
      setFormErrors({});
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl p-8 shadow-lg animate-pulse">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-gray-200 rounded-xl" />
              <div className="h-8 bg-gray-200 rounded w-64" />
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-50 border rounded-xl p-6 mb-4">
                <div className="h-6 bg-gray-200 rounded w-96 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-20 right-4 z-50 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2"
          >
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError("")} className="ml-3">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white pt-16 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl p-6 mb-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <Wrench className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Maintenance Requests</h1>
                  <p className="text-sm text-gray-600">Report and track repair issues</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 shadow-lg transition"
              >
                <Plus size={20} /> New Request
              </button>
            </div>
          </motion.div>

          <div className="space-y-5">
            {requests.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl shadow">
                <Wrench className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg font-medium">No maintenance requests yet</p>
                <p className="text-sm text-gray-400 mt-2">Click "New Request" to report an issue</p>
              </div>
            ) : (
              requests.map((req) => (
                <motion.div
                  key={req._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition"
                >
                  <h3 className="font-bold text-lg text-gray-900">{req.title}</h3>
                  <p className="text-gray-600 mt-2">{req.description}</p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    <span
                      className={`px-3 py-1.5 text-xs font-bold rounded-full ${
                        req.urgency === "high"
                          ? "bg-red-100 text-red-700"
                          : req.urgency === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {req.urgency.toUpperCase()}
                    </span>
                    <span
                      className={`px-3 py-1.5 text-xs font-bold rounded-full ${
                        req.status === "Pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : req.status === "In Progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(req.date).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-4 mt-10 pb-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-5 py-2.5 bg-white border rounded-xl disabled:opacity-50 hover:bg-gray-50 transition"
              >
                <ChevronLeft size={18} /> Prev
              </button>
              <span className="text-sm font-medium self-center">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-5 py-2.5 bg-white border rounded-xl disabled:opacity-50 hover:bg-gray-50 transition"
              >
                Next <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">New Maintenance Request</h2>
                <button onClick={() => setIsModalOpen(false)}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border focus:ring-4 focus:ring-emerald-500/20 outline-none transition"
                    placeholder="e.g. Leaking kitchen tap"
                  />
                  {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
                </div>

                <div>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border focus:ring-4 focus:ring-emerald-500/20 resize-none outline-none transition"
                    placeholder="Describe the problem in detail..."
                  />
                  {formErrors.description && <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>}
                </div>

                <select
                  value={form.urgency}
                  onChange={e => setForm({ ...form, urgency: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-xl border outline-none"
                >
                  <option value="low">Low – Can wait</option>
                  <option value="medium">Medium – Soon</option>
                  <option value="high">High – Urgent!</option>
                </select>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 border rounded-xl hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" size={18} /> Submitting...
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
    </>
  );
}