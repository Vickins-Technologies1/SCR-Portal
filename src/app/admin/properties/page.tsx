"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Building2, ArrowUpDown, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface User {
  _id: string;
  email: string;
  role: "tenant" | "propertyOwner" | "admin";
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: string; managementFee: number }[];
}

interface SortConfig {
  key: keyof Property | "ownerEmail";
  direction: "asc" | "desc";
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "admin") {
      setError("Unauthorized. Please log in as an admin.");
      router.push("/admin/login");
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [propertiesRes, usersRes] = await Promise.all([
        fetch("/api/admin/properties", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/users", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
      ]);
      const [propertiesData, usersData] = await Promise.all([propertiesRes.json(), usersRes.json()]);
      if (propertiesData.success && usersData.success) {
        setProperties(propertiesData.properties || []);
        setPropertyOwners(usersData.users.filter((u: User) => u.role === "propertyOwner") || []);
      } else {
        setError("Failed to fetch data.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") {
      fetchData();
    }
  }, [userId, role, fetchData]);

  const handleSort = useCallback((key: keyof Property | "ownerEmail") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...properties].sort((a, b) => {
        if (key === "ownerEmail") {
          const aEmail = propertyOwners.find((u) => u._id === a.ownerId)?.email || "";
          const bEmail = propertyOwners.find((u) => u._id === b.ownerId)?.email || "";
          return direction === "asc" ? aEmail.localeCompare(bEmail) : bEmail.localeCompare(aEmail);
        }
        return direction === "asc"
          ? String(a[key] ?? "").localeCompare(String(b[key] ?? ""))
          : String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
      });
      setProperties(sorted);
      return { key, direction };
    });
  }, [properties, propertyOwners]);

  const getSortIcon = useCallback((key: keyof Property | "ownerEmail") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="inline ml-1 h-4 w-4" />
    ) : (
      <ChevronDown className="inline ml-1 h-4 w-4" />);
  }, [sortConfig]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this property?")) return;
    
    try {
      const res = await fetch(`/api/admin/properties/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(properties.filter((property) => property._id !== id));
      } else {
        setError(data.message || "Failed to delete property.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  };

  const handleEdit = (property: Property) => {
    setEditProperty(property);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProperty) return;

    try {
      const res = await fetch(`/api/admin/properties/${editProperty._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editProperty.name,
          ownerId: editProperty.ownerId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProperties(
          properties.map((property) =>
            property._id === editProperty._id ? { ...property, ...editProperty } : property
          )
        );
        setShowEditModal(false);
        setEditProperty(null);
      } else {
        setError(data.message || "Failed to update property.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <Building2 className="text-[#012a4a] h-6 w-6" />
            Properties
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-md">
                <thead className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold cursor-pointer" onClick={() => handleSort("name")}>
                      Property Name {getSortIcon("name")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold cursor-pointer" onClick={() => handleSort("ownerEmail")}>
                      Owner Email {getSortIcon("ownerEmail")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Unit Types</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-4 text-center text-gray-600">
                        No properties found.
                      </td>
                    </tr>
                  ) : (
                    properties.map((p, index) => (
                      <React.Fragment key={p._id}>
                        <tr className="border-b border-gray-200 hover:bg-gray-50 animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                          <td className="py-3 px-4 text-sm text-gray-800">{p.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {propertyOwners.find((u) => u._id === p.ownerId)?.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {p.unitTypes.length > 0 ? (
                              <button
                                className="text-[#012a4a] hover:text-[#014a7a]"
                                onClick={() => toggleExpand(p._id)}
                              >
                                {expanded.includes(p._id) ? (
                                  <ChevronUp className="h-5 w-5" />
                                ) : (
                                  <ChevronDown className="h-5 w-5" />
                                )}
                              </button>
                            ) : (
                              <span>No units</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div className="flex gap-2">
                              <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800">
                                <Edit className="h-5 w-5" />
                              </button>
                              <button onClick={() => handleDelete(p._id)} className="text-red-600 hover:text-red-800">
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded.includes(p._id) && (
                          <tr className="bg-gray-50">
                            <td colSpan={4} className="py-4 px-4">
                              <h4 className="text-sm font-semibold text-gray-800">Unit Types</h4>
                              {p.unitTypes.length === 0 ? (
                                <p className="text-sm text-gray-600">No unit types</p>
                              ) : (
                                <ul className="list-disc pl-5 text-sm text-gray-600">
                                  {p.unitTypes.map((u) => (
                                    <li key={u.type}>
                                      {u.type} (Price: Ksh {u.price.toFixed(2)}, Fee: Ksh {u.managementFee.toFixed(2)})
                                    </li>
                                  ))}
                                </ul>
                              )}
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
          {showEditModal && editProperty && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Edit Property</h2>
                <form onSubmit={handleUpdate}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Property Name</label>
                    <input
                      type="text"
                      value={editProperty.name}
                      onChange={(e) => setEditProperty({ ...editProperty, name: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Owner</label>
                    <select
                      value={editProperty.ownerId}
                      onChange={(e) => setEditProperty({ ...editProperty, ownerId: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                    >
                      <option value="">Select Owner</option>
                      {propertyOwners.map((owner) => (
                        <option key={owner._id} value={owner._id}>
                          {owner.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.5s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          text-align: left;
          vertical-align: middle;
        }
        th {
          font-weight: 600;
        }
        tr {
          transition: background-color 0.2s;
        }
      `}</style>
    </div>
  );
}