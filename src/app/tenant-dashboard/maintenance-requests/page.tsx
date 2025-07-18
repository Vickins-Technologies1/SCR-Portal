"use client";

import React, { useState, useEffect } from "react";
import Cookies from "js-cookie";
import { Plus, X } from "lucide-react";

interface Request {
  _id?: string;
  title: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved";
  date: string;
}

export default function MaintenancePage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const tenantId = Cookies.get("userId");

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch(`/api/tenant/maintenance?tenantId=${tenantId}`);
        const data = await res.json();
        setRequests(data?.requests || []);
      } catch (err) {
        console.error("Failed to fetch maintenance requests:", err);
      }
    };
    if (tenantId) fetchRequests();
  }, [tenantId]);

  const handleSubmit = async () => {
    if (!title || !description) return alert("Please fill in all fields");
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, title, description }),
      });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => [data.request, ...prev]);
        setTitle("");
        setDescription("");
        setIsModalOpen(false);
      } else {
        alert("Submission failed: " + data.message);
      }
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-1">Maintenance Requests</h1>
        <p>Submit issues for repair and track their progress in real time.</p>
      </section>

      {/* Add Request Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#03a678] text-white rounded-md hover:bg-[#02956a] shadow transition"
        >
          <Plus size={18} />
          New Request
        </button>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.length > 0 ? (
              requests.map((req) => (
                <tr key={req._id}>
                  <td className="px-4 py-2">{new Date(req.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 font-medium">{req.title}</td>
                  <td className="px-4 py-2">{req.description}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        req.status === "Pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : req.status === "In Progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                  No maintenance requests submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-600 hover:text-red-500"
              onClick={() => setIsModalOpen(false)}
            >
              <X />
            </button>

            <h2 className="text-xl font-bold mb-4 text-gray-800">New Maintenance Request</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g. Leaking Tap"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="text-right">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-[#03a678] text-white px-4 py-2 rounded hover:bg-[#02956a]"
                >
                  {loading ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}