"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const authRetryRef = useRef(0);

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

  const fetchRequests = useCallback(async function fetchRequestsInner() {
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
      setError("");
    } catch (err: any) {
      const message = err?.message || "Network error";
      const isAuthTransient =
        /unauthorized|forbidden|invalid csrf/i.test(message) && authRetryRef.current < 1;
      if (isAuthTransient) {
        authRetryRef.current += 1;
        setTimeout(() => fetchRequestsInner(), 400);
        return;
      }
      setError(message);
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
          className={`fixed top-20 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs sm:text-sm ${
              error ? "bg-red-50 border border-red-200 text-red-700" : "bg-primary/10 border border-primary/20 text-primary"
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

      <div className="relative min-h-screen pt-16 px-4 text-[13px] sm:text-sm pb-10">
        <div className="pointer-events-none absolute -top-24 right-[-12%] h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-[-8%] h-72 w-72 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-3xl p-5 sm:p-6 mb-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-xl">
                  <DoorOpen className="w-7 h-7 text-amber-600" />
                </div>
                <div>
                  <p className="eyebrow">Move-Out</p>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-display text-foreground">Vacate Notice</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">Notify your property owner about moving out</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-amber-600 text-white font-semibold rounded-full hover:bg-amber-700 shadow-lg transition"
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
            <div className="text-center py-16 surface-card rounded-3xl">
              <DoorOpen className="w-20 h-20 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-base sm:text-lg font-medium">No vacate requests yet</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-2">Click New Request to notify your owner</p>
            </div>
          ) : (
            <div className="space-y-5">
              {requests.map((req) => (
                <motion.div
                  key={req._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="surface-card rounded-3xl p-4 sm:p-6 hover:shadow-md transition"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-3 py-1.5 text-xs font-bold rounded-full ${
                        req.status === "Approved"
                          ? "bg-primary/10 text-primary"
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
                  <p className="text-muted-foreground mt-3 text-xs sm:text-sm">{req.message}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm text-foreground">
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
            className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="modal-panel w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header flex justify-between items-center px-5 sm:px-6 py-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Submit Vacate Request</h2>
                <button onClick={() => setIsModalOpen(false)} className="modal-close rounded-full p-1">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="modal-body modal-stagger space-y-5">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Preferred Move-out Date</label>
                  <input
                    type="date"
                    value={form.moveOutDate}
                    onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:ring-4 focus:ring-amber-500/20 outline-none transition text-sm bg-white/70"
                  />
                  {formErrors.moveOutDate && <p className="text-red-500 text-xs mt-1">{formErrors.moveOutDate}</p>}
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Message to Owner</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:ring-4 focus:ring-amber-500/20 resize-none outline-none transition text-sm bg-white/70"
                    placeholder="Briefly explain your move-out request..."
                  />
                  {formErrors.message && <p className="text-red-500 text-xs mt-1">{formErrors.message}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-sm border rounded-xl hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 text-sm bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2 transition"
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
