"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, AlertCircle, CheckCircle2, XCircle, Calendar } from "lucide-react";
import { VacateRequest } from "../../../types/vacate";

interface VacateRequestsProps {
  csrfToken: string;
}

const formatDate = (value?: string) => {
  if (!value) return "Not specified";
  const date = new Date(value);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};

export default function VacateRequests({ csrfToken }: VacateRequestsProps) {
  const [requests, setRequests] = useState<VacateRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!csrfToken) return;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/property-owners/vacate", {
          method: "GET",
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to load vacate requests");
        }
        setRequests(data.data?.requests || []);
      } catch (err: any) {
        setError(err.message || "Failed to load vacate requests");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [csrfToken]);

  const updateStatus = async (id: string, status: "Approved" | "Rejected") => {
    try {
      const res = await fetch("/api/property-owners/vacate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ requestId: id, status }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update vacate request");
      }

      setRequests((prev) =>
        prev.map((req) => (req._id === id ? { ...req, status, decisionAt: new Date().toISOString() } : req))
      );
      setSuccess(`Vacate request ${status.toLowerCase()}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update vacate request");
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-100 rounded-xl">
            <Home className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Vacate Requests</h2>
            <p className="text-gray-600">Approve or reject tenant move-out requests</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3"
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
            className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-center gap-3"
          >
            <CheckCircle2 size={20} />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <Home className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-500">No vacate requests yet</p>
          <p className="text-gray-400 mt-2">Tenant move-out requests will appear here</p>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {requests.map((req) => (
            <motion.div
              key={req._id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-xl transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-lg text-gray-900 line-clamp-2">{req.tenantName || "Tenant"}</h3>
                <span
                  className={`px-3 py-1 text-xs font-bold rounded-full ${
                    req.status === "Approved"
                      ? "bg-green-100 text-green-700"
                      : req.status === "Rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {req.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500">Property</span>
                  <span className="font-medium text-gray-900 truncate max-w-32">{req.propertyName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unit</span>
                  <span className="font-medium text-gray-900">{req.houseNumber || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Move-out
                  </span>
                  <span className="font-medium text-gray-900">{formatDate(req.requestedMoveOutDate)}</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-600 line-clamp-3">{req.message}</p>

              {req.status === "Pending" && (
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => updateStatus(req._id, "Approved")}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button
                    onClick={() => updateStatus(req._id, "Rejected")}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
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
