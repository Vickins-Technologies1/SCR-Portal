"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle, Clock, RefreshCw, UserPlus } from "lucide-react";

interface PendingOwner {
  _id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

export default function PendingApprovals() {
  const [pending, setPending] = useState<PendingOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

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

  const handleApprove = async (id: string, name: string) => {
    if (!confirm(`Approve ${name}? They will be able to log in immediately.`)) {
      return;
    }

    try {
      setApprovingId(id);
      const res = await fetch(`/api/admin/property-owners/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (data.success) {
        // Remove from list optimistically
        setPending((prev) => prev.filter((u) => u._id !== id));
        alert(`${name} has been approved!`);
      } else {
        setError(data.message || "Approval failed");
      }
    } catch (err) {
      setError("Failed to approve user");
      console.error(err);
    } finally {
      setApprovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow border p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600 mx-auto mb-3"></div>
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
          className="mt-3 inline-flex items-center gap-2 text-sm text-red-700 hover:text-red-800"
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
        <p className="text-green-700 mt-1">No pending property owner approvals at the moment.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow border overflow-hidden">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6" />
            <h2 className="text-xl font-semibold">Pending Approvals</h2>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
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
              <p className="text-sm text-gray-600">{owner.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(owner.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleApprove(owner._id, owner.name)}
                disabled={approvingId === owner._id}
                className={`
                  inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                  ${
                    approvingId === owner._id
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }
                  transition-colors shadow-sm
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
          </div>
        ))}
      </div>

      <div className="px-6 py-4 bg-gray-50 text-right text-sm text-gray-500">
        Showing all pending property owner signups
      </div>
    </div>
  );
}