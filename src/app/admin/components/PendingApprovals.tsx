"use client";

import React, { useState, useEffect, useRef } from "react";
import { CheckCircle, Clock, RefreshCw, UserPlus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PendingOwner {
  _id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

function SuccessToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-500/30"
    >
      <CheckCircle className="h-5 w-5 flex-shrink-0" />
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-white/80 hover:text-white transition-colors"
        aria-label="Close toast"
      >
        <X size={18} />
      </button>
    </motion.div>
  );
}

export default function PendingApprovals() {
  const [pending, setPending] = useState<PendingOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<PendingOwner | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch CSRF token once on mount
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Failed to fetch CSRF token");

        const data = await res.json();
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
      } catch (err) {
        console.error("CSRF token fetch failed:", err);
        setError("Security token unavailable. Please refresh the page.");
      }
    };

    fetchCsrfToken();
  }, []);

  const fetchPending = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/admin/property-owners?status=pending", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/admin/login?session=expired";
          return;
        }
        throw new Error(`Failed to fetch pending owners: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setPending(data.propertyOwners || []);
      } else {
        setError(data.message || "Could not load pending approvals");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfirmModal(false);
        setSelectedOwner(null);
      }
    };
    if (showConfirmModal) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showConfirmModal]);

  // Focus modal when opened
  useEffect(() => {
    if (showConfirmModal && modalRef.current) {
      modalRef.current.focus();
    }
  }, [showConfirmModal]);

  const openConfirmModal = (owner: PendingOwner) => {
    setSelectedOwner(owner);
    setShowConfirmModal(true);
  };

  const handleApprove = async () => {
    if (!selectedOwner || !csrfToken) {
      setError("Cannot proceed: security token missing. Please refresh.");
      return;
    }

    try {
      setApprovingId(selectedOwner._id);

      const res = await fetch(`/api/admin/property-owners/${selectedOwner._id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();

      if (data.success) {
        setPending((prev) => prev.filter((u) => u._id !== selectedOwner._id));
        setShowConfirmModal(false);
        setSelectedOwner(null);
        setSuccessMessage(`${selectedOwner.name} has been approved successfully!`);
      } else {
        setError(data.message || "Approval failed");
      }
    } catch (err) {
      setError("Failed to approve user. Please try again.");
      console.error(err);
    } finally {
      setApprovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow border p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#03a678] mx-auto mb-3"></div>
        <p className="text-gray-600">Loading pending approvals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl">
        <p>{error}</p>
        <button
          onClick={fetchPending}
          className="mt-3 inline-flex items-center gap-2 text-sm text-red-700 hover:text-red-800 transition-colors"
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
        <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-green-800">All caught up!</h3>
        <p className="text-green-700 mt-1">
          No pending property owner sign-up approvals at the moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow border overflow-hidden">
        <div className="bg-gradient-to-r from-blue-800 to-blue-950 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Pending Approvals</h2>
            </div>
            <span className="bg-indigo-500/30 px-5 py-1 rounded-full text-sm font-medium backdrop-blur-sm border border-indigo-400/20">
              {pending.length} waiting
            </span>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {pending.map((owner) => (
            <div
              key={owner._id}
              className="p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div>
                <h3 className="font-medium text-gray-900">{owner.name}</h3>
                <p className="text-sm text-gray-600 mt-0.5">{owner.email}</p>
                <p className="text-xs text-gray-500 mt-1.5">
                  Registered on{" "}
                  {new Date(owner.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <button
                onClick={() => openConfirmModal(owner)}
                disabled={approvingId === owner._id || !csrfToken}
                className={`
                  inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all shadow-sm min-w-[120px] justify-center
                  ${
                    approvingId === owner._id || !csrfToken
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-[#03a678] text-white hover:bg-[#027a55] hover:shadow-md active:scale-95"
                  }
                `}
              >
                {approvingId === owner._id ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Approve
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 bg-gray-50 text-right text-sm text-gray-500">
          Showing all pending property owner signups
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedOwner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden focus:outline-none"
              tabIndex={-1}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Confirm Approval
                  </h3>
                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      setSelectedOwner(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close modal"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="mb-6 space-y-3">
                  <p className="text-gray-700">
                    You are about to approve <strong>{selectedOwner.name}</strong>.
                  </p>
                  <p className="text-sm text-gray-600">
                    Email: {selectedOwner.email}
                  </p>
                  <p className="text-sm text-gray-500">
                    They will gain immediate access to manage their properties and dashboard.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-4">
                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      setSelectedOwner(null);
                    }}
                    className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approvingId === selectedOwner._id}
                    className={`
                      inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm text-white min-w-[140px] justify-center transition-all
                      ${
                        approvingId === selectedOwner._id
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-[#03a678] hover:bg-[#027a55] shadow-md active:scale-95"
                      }
                    `}
                  >
                    {approvingId === selectedOwner._id ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        Approve Owner
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {successMessage && (
          <SuccessToast
            message={successMessage}
            onClose={() => setSuccessMessage(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}