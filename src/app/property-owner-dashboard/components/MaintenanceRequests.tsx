// src/app/property-owner-dashboard/components/MaintenanceRequests.tsx
"use client";

import { useState, useEffect } from "react";
import { Wrench, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Property } from "../../../types/property";

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  tenantId: string;
  propertyId: string;
  date: string;
  urgency: "low" | "medium" | "high";
  tenantName: string; // ← Now guaranteed from backend
}

interface MaintenanceRequestsProps {
  userId: string;
  csrfToken: string;
  properties: Property[];
}

export default function MaintenanceRequests({ userId, csrfToken, properties }: MaintenanceRequestsProps) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Pending" | "In Progress" | "Resolved">("All");

  useEffect(() => {
    const fetchRequests = async () => {
      if (!csrfToken) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/property-owners/maintenance", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to load requests");

        // tenantName is now included directly!
        setRequests(data.data.requests);
      } catch (err: any) {
        console.error("Failed to fetch maintenance requests:", err);
        setError(err.message || "Failed to load maintenance requests");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [csrfToken]); // Only depend on csrfToken

  const updateStatus = async (id: string, status: "Pending" | "In Progress" | "Resolved") => {
    try {
      const res = await fetch(`/api/tenants/maintenance/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update status");
      }

      setRequests(prev => prev.map(r => r._id === id ? { ...r, status } : r));
      setSuccess("Status updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update status");
      setTimeout(() => setError(null), 3000);
    }
  };

  const deleteRequest = async (id: string) => {
    if (!confirm("Are you sure you want to delete this maintenance request?")) return;

    try {
      const res = await fetch(`/api/tenants/maintenance/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete");

      setRequests(prev => prev.filter(r => r._id !== id));
      setSuccess("Request deleted successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError("Failed to delete request");
      setTimeout(() => setError(null), 3000);
    }
  };

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p._id.toString() === propertyId)?.name || "Unknown Property";
  };

  const filteredRequests = filter === "All"
    ? requests
    : requests.filter(r => r.status === filter);

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-12"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Wrench className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Maintenance Requests</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Manage and resolve tenant issues</p>
          </div>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-4 py-2 text-xs sm:text-sm border border-gray-200 rounded-xl bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
        >
          <option value="All">All Requests</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      {/* Messages */}
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

      {/* Loading & Empty States */}
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

      {!isLoading && filteredRequests.length === 0 && (
        <div className="text-center py-16 surface-card rounded-2xl">
          <Wrench className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <p className="text-base font-semibold text-gray-600">
            {filter === "All" ? "No maintenance requests yet" : `No ${filter.toLowerCase()} requests`}
          </p>
          <p className="text-xs text-gray-400 mt-2">All clear! Your tenants are happy</p>
        </div>
      )}

      {/* Requests Grid */}
      {!isLoading && filteredRequests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRequests.map((req) => (
            <motion.div
              key={req._id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="surface-card rounded-2xl p-4 sm:p-5 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-base text-gray-900 line-clamp-2">{req.title}</h3>
                <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
                  req.urgency === "high" ? "bg-red-100 text-red-700" :
                  req.urgency === "medium" ? "bg-yellow-100 text-yellow-700" :
                  "bg-primary/10 text-primary"
                }`}>
                  {req.urgency.toUpperCase()}
                </span>
              </div>

              <p className="text-gray-600 text-xs sm:text-sm mb-4 line-clamp-3">{req.description}</p>

              <div className="space-y-2 text-xs sm:text-sm border-t border-gray-100 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-medium text-gray-900">{req.tenantName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Property</span>
                  <span className="font-medium text-gray-900 truncate max-w-32">
                    {getPropertyName(req.propertyId)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900">
                    {new Date(req.date).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <select
                  value={req.status}
                  onChange={(e) => updateStatus(req._id, e.target.value as any)}
                  className="text-xs sm:text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/30 focus:border-primary transition bg-white/80"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

                <button
                  onClick={() => deleteRequest(req._id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition group-hover:scale-105"
                  title="Delete request"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
}



