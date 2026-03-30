"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, AlertCircle, CheckCircle2, XCircle, User, Home, Calendar } from "lucide-react";
import { TenantDeletionRequest } from "../../../types/tenant-deletion";

interface TenantDeletionRequestsProps {
  csrfToken: string;
}

const formatDate = (value?: string) => {
  if (!value) return "Not specified";
  const date = new Date(value);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};

export default function TenantDeletionRequests({ csrfToken }: TenantDeletionRequestsProps) {
  const [requests, setRequests] = useState<TenantDeletionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeCsrfToken, setActiveCsrfToken] = useState<string | null>(csrfToken);

  useEffect(() => {
    setActiveCsrfToken(csrfToken);
  }, [csrfToken]);

  const fetchCsrfToken = async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data?.csrfToken) {
        setActiveCsrfToken(data.csrfToken);
        return data.csrfToken as string;
      }
    } catch {
      // ignore
    }
    return null;
  };

  useEffect(() => {
    const fetchRequests = async () => {
      const token = activeCsrfToken || (await fetchCsrfToken());
      if (!token) return;
      setIsLoading(true);
      setError(null);

      try {
        let res = await fetch("/api/property-owners/tenant-deletions", {
          method: "GET",
          headers: { "x-csrf-token": token },
          credentials: "include",
        });
        if (res.status === 403) {
          const refreshed = await fetchCsrfToken();
          if (refreshed) {
            res = await fetch("/api/property-owners/tenant-deletions", {
              method: "GET",
              headers: { "x-csrf-token": refreshed },
              credentials: "include",
            });
          }
        }
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to load deletion requests");
        }
        setRequests(data.data?.requests || []);
      } catch (err: any) {
        setError(err.message || "Failed to load deletion requests");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [activeCsrfToken]);

  const updateStatus = async (id: string, status: "Approved" | "Rejected") => {
    const token = activeCsrfToken || (await fetchCsrfToken());
    if (!token) return;
    const targetRequest = requests.find((req) => req._id === id);
    const tenantLabel = targetRequest?.tenantName || "tenant";
    try {
      let res = await fetch("/api/property-owners/tenant-deletions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
        body: JSON.stringify({ requestId: id, status }),
      });
      if (res.status === 403) {
        const refreshed = await fetchCsrfToken();
        if (refreshed) {
          res = await fetch("/api/property-owners/tenant-deletions", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": refreshed,
            },
            credentials: "include",
            body: JSON.stringify({ requestId: id, status }),
          });
        }
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update deletion request");
      }

      setRequests((prev) =>
        status === "Approved"
          ? prev.filter((req) => req._id !== id)
          : prev.map((req) =>
              req._id === id ? { ...req, status, decisionAt: new Date().toISOString() } : req
            )
      );
      setSuccess(
        status === "Approved"
          ? `Approved & removed: ${tenantLabel}.`
          : `Deletion request rejected: ${tenantLabel}.`
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update deletion request");
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-12"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-red-100 rounded-xl">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Tenant Deletion Requests</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review team-member deletion requests before removal
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-3 text-sm"
          >
            <AlertCircle size={20} />
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-5 p-3 bg-primary/10 border border-primary/30 text-primary rounded-2xl flex items-center gap-3 text-sm"
          >
            <CheckCircle2 size={20} />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="text-center py-16 surface-card rounded-2xl">
          <Trash2 className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <p className="text-base font-semibold text-gray-600">No deletion requests yet</p>
          <p className="text-xs text-gray-400 mt-2">Team-member delete requests will appear here</p>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {requests.map((req) => (
            <motion.div
              key={req._id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="surface-card rounded-2xl p-4 sm:p-5 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-base text-gray-900 line-clamp-2">
                  {req.tenantName || "Tenant"}
                </h3>
                <span
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
                    req.status === "Approved"
                      ? "bg-primary/10 text-primary"
                      : req.status === "Rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {req.status}
                </span>
              </div>

              <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Home className="w-4 h-4" /> Property
                  </span>
                  <span className="font-medium text-gray-900 truncate max-w-32">
                    {req.propertyName || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unit</span>
                  <span className="font-medium text-gray-900">
                    {req.houseNumber || req.unitType || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1">
                    <User className="w-4 h-4" /> Requested by
                  </span>
                  <span className="font-medium text-gray-900 truncate max-w-32">
                    {req.requestedByName || "Team member"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Requested
                  </span>
                  <span className="font-medium text-gray-900">{formatDate(req.createdAt)}</span>
                </div>
              </div>

              {req.status === "Pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => updateStatus(req._id, "Approved")}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[11px] sm:text-xs font-semibold text-white hover:bg-primary-hover transition"
                  >
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button
                    onClick={() => updateStatus(req._id, "Rejected")}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-[11px] sm:text-xs font-semibold text-white hover:bg-red-700 transition"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
