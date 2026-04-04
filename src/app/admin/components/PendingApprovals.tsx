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
      className="fixed bottom-5 right-5 z-50 bg-primary text-white px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 border border-primary/30 text-xs"
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
      <div className="surface-card rounded-xl p-4 text-center">
        <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-xs text-muted-foreground">Loading pending approvals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs">
        <p>{error}</p>
        <button
          onClick={fetchPending}
          className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
        <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-foreground">All caught up!</h3>
        <p className="text-xs text-muted-foreground mt-1">
          No pending property owner sign-up approvals at the moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="surface-card rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-primary-hover px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5" />
              <h2 className="text-sm font-semibold">Pending Approvals</h2>
            </div>
            <span className="bg-white/15 px-3 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm border border-white/30">
              {pending.length} waiting
            </span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {pending.map((owner) => (
            <div
              key={owner._id}
              className="p-4 hover:bg-primary/5 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <h3 className="text-sm font-medium text-foreground">{owner.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{owner.email}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
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
                  inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-xs transition-all shadow-sm min-w-[110px] justify-center
                  ${
                    approvingId === owner._id || !csrfToken
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-white hover:bg-primary-hover hover:shadow-md active:scale-95"
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

        <div className="px-4 py-3 bg-white/70 text-right text-xs text-muted-foreground">
          Showing all pending property owner signups
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedOwner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-3">
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="modal-panel max-w-sm w-full overflow-hidden focus:outline-none"
              tabIndex={-1}
            >
              <div className="modal-header flex items-start justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Confirm Approval
                </h3>
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setSelectedOwner(null);
                  }}
                  className="modal-close rounded-full p-1.5"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body modal-stagger">
                <div className="mb-5 space-y-2 text-xs">
                  <p className="text-foreground">
                    You are about to approve <strong>{selectedOwner.name}</strong>.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Email: {selectedOwner.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    They will gain immediate access to manage their properties and dashboard.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      setSelectedOwner(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground bg-white/70 hover:bg-white rounded-md transition border border-border"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approvingId === selectedOwner._id}
                    className={`
                      inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-xs text-white min-w-[120px] justify-center transition-all
                      ${
                        approvingId === selectedOwner._id
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-primary hover:bg-primary-hover shadow-md active:scale-95"
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
