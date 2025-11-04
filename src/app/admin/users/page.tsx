"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Users, ArrowUpDown, ChevronDown, ChevronUp, Edit, Trash2, Plus } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface PropertyOwner {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  createdAt: string;
  properties: any[];
  payments: any[];
  invoices: any[];
}

interface SortConfig {
  key: keyof PropertyOwner;
  direction: "asc" | "desc";
}

export default function UsersPage() {
  const router = useRouter();
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editUser, setEditUser] = useState<PropertyOwner | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newOwner, setNewOwner] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "admin") {
      setError("Unauthorized. Please log in as an admin.");
      router.push("/login");
    }
  }, [router]);

  const fetchPropertyOwners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/property-owners", {
        method: "GET",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPropertyOwners(data.propertyOwners || []);
      } else {
        setError(data.message || "Failed to fetch owners.");
      }
    } catch {
      setError("Server connection failed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") fetchPropertyOwners();
  }, [userId, role, fetchPropertyOwners]);

  const handleSort = (key: keyof PropertyOwner) => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...propertyOwners].sort((a, b) => {
        const A = String(a[key] ?? "").toLowerCase();
        const B = String(b[key] ?? "").toLowerCase();
        return direction === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      });
      setPropertyOwners(sorted);
      return { key, direction };
    });
  };

  const getSortIcon = (key: keyof PropertyOwner) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? <ChevronUp className="inline ml-1 h-4 w-4" /> : <ChevronDown className="inline ml-1 h-4 w-4" />;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this owner?")) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPropertyOwners(propertyOwners.filter((o) => o._id !== id));
      } else {
        setError(data.message);
      }
    } catch {
      setError("Delete failed.");
    }
  };

  const handleEdit = (owner: PropertyOwner) => {
    setEditUser(owner);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    try {
      const res = await fetch(`/api/admin/property-owners/${editUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editUser.name,
          email: editUser.email,
          phone: editUser.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPropertyOwners(propertyOwners.map((o) => (o._id === editUser._id ? { ...o, ...editUser } : o)));
        setShowEditModal(false);
        setEditUser(null);
      } else {
        setError(data.message);
      }
    } catch {
      setError("Update failed.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/property-owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newOwner),
      });
      const data = await res.json();

      if (data.success) {
        setPropertyOwners([data.propertyOwner, ...propertyOwners]);
        setShowCreateModal(false);
        setNewOwner({ name: "", email: "", phone: "", password: "" });
      } else {
        setCreateError(data.message || "Create failed");
      }
    } catch {
      setCreateError("Server error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Users className="text-[#012a4a] h-6 w-6" />
              Property Owners
            </h1>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition flex items-center gap-2 shadow-md"
            >
              <Plus className="h-4 w-4" />
              Add New Owner
            </button>
          </div>

          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-md">
                <thead className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold cursor-pointer" onClick={() => handleSort("name")}>
                      Name {getSortIcon("name")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold cursor-pointer" onClick={() => handleSort("email")}>
                      Email {getSortIcon("email")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold cursor-pointer" onClick={() => handleSort("phone")}>
                      Phone {getSortIcon("phone")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Created</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyOwners.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No property owners yet.
                      </td>
                    </tr>
                  ) : (
                    propertyOwners.map((owner, i) => (
                      <React.Fragment key={owner._id}>
                        <tr className="border-b hover:bg-gray-50" style={{ animationDelay: `${i * 80}ms` }}>
                          <td className="py-3 px-4 text-sm">{owner.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{owner.email}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{owner.phone}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {new Date(owner.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div className="flex gap-2">
                              <button onClick={() => handleEdit(owner)} className="text-blue-600 hover:text-blue-800">
                                <Edit className="h-5 w-5" />
                              </button>
                              <button onClick={() => handleDelete(owner._id)} className="text-red-600 hover:text-red-800">
                                <Trash2 className="h-5 w-5" />
                              </button>
                              <button onClick={() => toggleExpand(owner._id)}>
                                {expanded.includes(owner._id) ? (
                                  <ChevronUp className="h-5 w-5 text-[#012a4a]" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-[#012a4a]" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded.includes(owner._id) && (
                          <tr className="bg-gray-50">
                            <td colSpan={5} className="py-4 px-6">
                              <div className="space-y-3 text-sm">
                                <div>
                                  <strong>Properties:</strong> {owner.properties.length}
                                </div>
                                <div>
                                  <strong>Payments:</strong> {owner.payments.length}
                                </div>
                                <div>
                                  <strong>Invoices:</strong> {owner.invoices.length}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <h2 className="text-2xl font-bold mb-4">Add New Owner</h2>
                {createError && (
                  <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{createError}</div>
                )}
                <form onSubmit={handleCreate}>
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    value={newOwner.name}
                    onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-3"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    required
                    value={newOwner.email}
                    onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-3"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    required
                    value={newOwner.phone}
                    onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-3"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 chars)"
                    required
                    minLength={6}
                    value={newOwner.password}
                    onChange={(e) => setNewOwner({ ...newOwner, password: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-4"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateError(null);
                        setNewOwner({ name: "", email: "", phone: "", password: "" });
                      }}
                      className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Create Owner
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {showEditModal && editUser && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <h2 className="text-2xl font-bold mb-4">Edit Owner</h2>
                <form onSubmit={handleUpdate}>
                  <input
                    type="text"
                    value={editUser.name}
                    onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-3"
                  />
                  <input
                    type="email"
                    value={editUser.email}
                    onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-3"
                  />
                  <input
                    type="tel"
                    value={editUser.phone}
                    onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                    className="w-full p-3 border rounded-lg mb-4"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}