"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DoorOpen, AlertCircle, X, Loader2, Calendar } from "lucide-react";
import { VacateRequest } from "../../../types/vacate";

export default function VacateRequestsPage() {
  const [requests, setRequests] = useState<VacateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    moveOutDate: "",
    message: "",
  });

  const [formErrors, setFormErrors] = useState<{ moveOutDate?: string; message?: string }>({});

  useEffect(() => {
    const init = async () => {
      try {
        const csrfRes = await fetch("/api/csrf-token", { credentials: "include" });
        const csrfData = await csrfRes.json();
        if (!csrfData.success || !csrfData.csrfToken) {
          throw new Error("Failed to get security token");
        }
        setCsrfToken(csrfData.csrfToken);
      } catch (err: any) {
        setError(err.message || "Authentication failed. Please log in again.");
        setLoading(false);
      }
    };

    init();
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tenants/vacate", {
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load vacate requests");
      }
      setRequests(data.data.requests || []);
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    if (csrfToken) {
      fetchRequests();
    }
  }, [csrfToken, fetchRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: typeof formErrors = {};
    if (!form.moveOutDate) errors.moveOutDate = "Preferred move-out date is required";
    if (!form.message.trim()) errors.message = "Message is required";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (!csrfToken) {
      setError("Authentication missing. Please refresh the page.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tenants/vacate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          moveOutDate: form.moveOutDate,
          message: form.message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Server error: ${res.status}`);
      }

      setRequests((prev) => [data.data, ...prev]);
      setSuccess("Vacate request submitted. Your owner has been notified.");
      setIsModalOpen(false);
      setForm({ moveOutDate: "", message: "" });
      setFormErrors({});
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to submit vacate request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {(error || success) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
              error ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"
            }`}
          >
            <AlertCircle size={18} />
            {error || success}
            <button onClick={() => { setError(""); setSuccess(""); }} className="ml-3">
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
                <div className="p-3 bg-amber-100 rounded-xl">
                  <DoorOpen className="w-7 h-7 text-amber-600" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Vacate Notice</h1>
                  <p className="text-sm text-gray-600">Notify your property owner about moving out</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 shadow-lg transition"
              >
                New Request
              </button>
            </div>
          </motion.div>

          {loading ? (
            <div className="bg-white rounded-2xl p-8 shadow-lg animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-gray-50 border rounded-xl p-6 mb-4">
                  <div className="h-6 bg-gray-200 rounded w-64 mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl shadow">
              <DoorOpen className="w-20 h-20 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No vacate requests yet</p>
              <p className="text-sm text-gray-400 mt-2">Click "New Request" to notify your owner</p>
            </div>
          ) : (
            <div className="space-y-5">
              {requests.map((req) => (
                <motion.div
                  key={req._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-3 py-1.5 text-xs font-bold rounded-full ${
                        req.status === "Approved"
                          ? "bg-green-100 text-green-700"
                          : req.status === "Rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(req.createdAt).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-gray-600 mt-3">{req.message}</p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                    <Calendar size={16} className="text-amber-600" />
                    Preferred move-out: <strong>{req.requestedMoveOutDate ? new Date(req.requestedMoveOutDate).toLocaleDateString("en-KE") : "Not specified"}</strong>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

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
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Submit Vacate Request</h2>
                <button onClick={() => setIsModalOpen(false)}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Move-out Date</label>
                  <input
                    type="date"
                    value={form.moveOutDate}
                    onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border focus:ring-4 focus:ring-amber-500/20 outline-none transition"
                  />
                  {formErrors.moveOutDate && <p className="text-red-500 text-xs mt-1">{formErrors.moveOutDate}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message to Owner</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border focus:ring-4 focus:ring-amber-500/20 resize-none outline-none transition"
                    placeholder="Briefly explain your move-out request..."
                  />
                  {formErrors.message && <p className="text-red-500 text-xs mt-1">{formErrors.message}</p>}
                </div>

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
                    className="px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2 transition"
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
