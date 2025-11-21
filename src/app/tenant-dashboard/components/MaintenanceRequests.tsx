// src/app/tenant-dashboard/components/MaintenanceRequests.tsx
"use client";

import { useState, useEffect } from "react";
import { Wrench, Trash2 } from "lucide-react";
import { Property } from "../../../types/property";
import { motion } from "framer-motion";

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  tenantId: string;
  propertyId: string;
  date: string;
  tenantName?: string;
  urgency: "low" | "medium" | "high";
}

interface Props {
  userId: string;
  role: string;
  csrfToken: string;
  properties: Property[];
}

export default function MaintenanceRequests({ userId, role, csrfToken, properties }: Props) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const requestsPerPage = 5;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/tenants/maintenance?page=${currentPage}&limit=${requestsPerPage}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setRequests(data.data.requests);
        setTotalPages(Math.ceil(data.data.total / requestsPerPage));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentPage]);

  const handleStatusUpdate = async (id: string, status: any) => {
    try {
      const res = await fetch(`/api/tenants/maintenance/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      setRequests(prev => prev.map(r => r._id === id ? { ...r, status } : r));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete?")) return;
    try {
      const res = await fetch(`/api/tenants/maintenance/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!res.ok) throw new Error("Delete failed");
      setRequests(prev => prev.filter(r => r._id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPropertyName = (id: string) => properties.find(p => p._id === id)?.name || "Unknown";

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        <Wrench className="h-5 w-5 text-teal-600" /> Maintenance Requests
      </h2>

      {error && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {["Title", "Description", "Status", "Urgency", "Property", "Date", ...(role === "propertyOwner" ? ["Actions"] : [])].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {requests.map(r => (
              <tr key={r._id}>
                <td className="px-6 py-4 text-sm text-gray-900">{r.title}</td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{r.description}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    r.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                    r.status === "In Progress" ? "bg-blue-100 text-blue-800" :
                    "bg-green-100 text-green-800"
                  }`}>{r.status}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    r.urgency === "low" ? "bg-green-100 text-green-800" :
                    r.urgency === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>{r.urgency}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{getPropertyName(r.propertyId)}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(r.date).toLocaleDateString()}</td>
                {role === "propertyOwner" && (
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusUpdate(r._id, e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option>Pending</option>
                        <option>In Progress</option>
                        <option>Resolved</option>
                      </select>
                      <button onClick={() => handleDelete(r._id)} className="text-red-600">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-between">
        <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-teal-600 text-white rounded disabled:bg-gray-300">Prev</button>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-teal-600 text-white rounded disabled:bg-gray-300">Next</button>
        </div>
      </div>
    </motion.section>
  );
}