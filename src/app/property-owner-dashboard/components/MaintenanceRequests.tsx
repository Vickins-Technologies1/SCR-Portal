"use client";

import { useState, useEffect } from "react";
import { Wrench, Filter, Trash2 } from "lucide-react";
import { Property } from "../../../types/property";
import Cookies from "js-cookie";
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

interface MaintenanceRequestsProps {
  userId: string;
  csrfToken: string;
  properties: Property[];
}

export default function MaintenanceRequests({ userId, csrfToken, properties }: MaintenanceRequestsProps) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const requestsPerPage = 5;
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user role from cookies
    const userRole = Cookies.get("role");
    setRole(userRole ?? null);
  }, []);

  useEffect(() => {
    const fetchMaintenanceRequests = async () => {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const res = await fetch(
          `/api/tenants/maintenance?userId=${encodeURIComponent(userId)}&page=${currentPage}&limit=${requestsPerPage}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            credentials: "include",
          }
        );

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Fetch failed for /api/tenants/maintenance: ${res.status} ${text.slice(0, 50)}`);
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to fetch maintenance requests");

        setRequests(data.data.requests);
        setTotalPages(Math.ceil(data.data.total / requestsPerPage));
        console.log("Maintenance requests fetched:", data.data.requests);
      } catch (err) {
        console.error("Maintenance requests fetch error:", err);
        setError(`Failed to load maintenance requests: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId && csrfToken) {
      fetchMaintenanceRequests();
    }
  }, [userId, csrfToken, currentPage]);

  const handleStatusUpdate = async (requestId: string, newStatus: "Pending" | "In Progress" | "Resolved") => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/tenants/maintenance/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to update status: ${res.status} ${text.slice(0, 50)}`);
      }

      const data = await res.json();
      if (data.success) {
        setRequests((prev) =>
          prev.map((req) => (req._id === requestId ? { ...req, status: newStatus } : req))
        );
        setSuccessMessage("Status updated successfully!");
      } else {
        throw new Error(data.message || "Failed to update status");
      }
    } catch (err) {
      console.error("Status update error:", err);
      setError(`Failed to update status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/tenants/maintenance/${requestId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete request: ${res.status} ${text.slice(0, 50)}`);
      }

      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((req) => req._id !== requestId));
        setSuccessMessage("Maintenance request deleted successfully!");
      } else {
        throw new Error(data.message || "Failed to delete request");
      }
    } catch (err) {
      console.error("Delete request error:", err);
      setError(`Failed to delete request: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRequests = statusFilter === "All" ? requests : requests.filter((req) => req.status === statusFilter);

  const getPropertyName = (propertyId: string) => {
    const property = properties.find((p) => p._id === propertyId);
    return property ? property.name : "Unknown Property";
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <motion.section
      className="mb-6 sm:mb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-teal-600" /> Maintenance Requests
        </h2>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm sm:text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="All">All</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
          <Filter className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {error && (
        <motion.div
          className="mb-4 sm:mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Wrench className="h-5 w-5" /> {error}
        </motion.div>
      )}
      {successMessage && (
        <motion.div
          className="mb-4 sm:mb-6 bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Wrench className="h-5 w-5" /> {successMessage}
        </motion.div>
      )}
      {isLoading && (
        <motion.div
          className="mb-4 sm:mb-6 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-teal-600"></div>
          Loading maintenance requests...
        </motion.div>
      )}
      {!isLoading && filteredRequests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm text-gray-600 text-sm sm:text-base">
          No maintenance requests found.
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Title", "Description", "Status", "Urgency", "Tenant", "Property", "Date", ...(role === "propertyOwner" ? ["Actions"] : [])].map((header) => (
                    <th
                      key={header}
                      className="px-4 sm:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRequests.map((request) => (
                  <tr key={request._id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-900">
                      {request.title}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm sm:text-base text-gray-500 max-w-xs truncate">
                      {request.description}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full ${
                          request.status === "Pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : request.status === "In Progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-500">
                      <span
                        className={`inline-block px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full ${
                          request.urgency === "low"
                            ? "bg-green-100 text-green-800"
                            : request.urgency === "medium"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {request.urgency.charAt(0).toUpperCase() + request.urgency.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-500">
                      {request.tenantName || "Unknown Tenant"}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-500">
                      {getPropertyName(request.propertyId)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base text-gray-500">
                      {new Date(request.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    {role === "propertyOwner" && (
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm sm:text-base">
                        <div className="flex gap-2">
                          <select
                            value={request.status}
                            onChange={(e) => handleStatusUpdate(request._id, e.target.value as "Pending" | "In Progress" | "Resolved")}
                            className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            disabled={isLoading}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                          <button
                            onClick={() => handleDeleteRequest(request._id)}
                            disabled={isLoading}
                            className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                            title="Delete Request"
                          >
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
          {/* Pagination Controls */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * requestsPerPage + 1} to{" "}
              {Math.min(currentPage * requestsPerPage, (currentPage - 1) * requestsPerPage + filteredRequests.length)} of{" "}
              {requests.length} requests
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="px-3 py-1 bg-teal-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-teal-700 transition-colors"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 rounded-lg ${
                      currentPage === page
                        ? "bg-teal-600 text-white"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                    }`}
                    disabled={isLoading}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
                className="px-3 py-1 bg-teal-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-teal-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}