"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Pencil, Trash2, Plus, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number }[];
  createdAt: string;
}

interface SortConfig {
  key: "name" | "address" | "createdAt"; // Restrict to string properties
  direction: "asc" | "desc";
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [unitTypes, setUnitTypes] = useState<{ type: string; price: string; deposit: string }[]>([
    { type: "", price: "", deposit: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
    }
  }, [router]);

  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchProperties();
    }
  }, [userId, role, fetchProperties]);

  const resetForm = useCallback(() => {
    setPropertyName("");
    setAddress("");
    setUnitTypes([{ type: "", price: "", deposit: "" }]);
    setFormErrors({});
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setModalMode("add");
    setEditingPropertyId(null);
    setIsModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback(
    (property: Property) => {
      setModalMode("edit");
      setEditingPropertyId(property._id);
      setPropertyName(property.name);
      setAddress(property.address);
      setUnitTypes(
        property.unitTypes.map((u) => ({
          type: u.type,
          price: u.price.toString(),
          deposit: u.deposit.toString(),
        }))
      );
      setFormErrors({});
      setIsModalOpen(true);
    },
    []
  );

  const handleDelete = useCallback((id: string) => {
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!propertyToDelete) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/properties/${propertyToDelete}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        fetchProperties();
      } else {
        setError(data.message || "Failed to delete property.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setPropertyToDelete(null);
    }
  }, [propertyToDelete, fetchProperties]);

  const validateForm = useCallback(() => {
    const errors: { [key: string]: string | undefined } = {};
    if (!propertyName.trim()) errors.propertyName = "Property name is required";
    if (!address.trim()) errors.address = "Address is required";
    unitTypes.forEach((unit, index) => {
      if (!unit.type.trim()) errors[`unitType_${index}`] = `Unit type ${index + 1} is required`;
      if (!unit.price || isNaN(parseFloat(unit.price)) || parseFloat(unit.price) < 0)
        errors[`unitPrice_${index}`] = `Price for unit ${index + 1} must be a non-negative number`;
      if (!unit.deposit || isNaN(parseFloat(unit.deposit)) || parseFloat(unit.deposit) < 0)
        errors[`unitDeposit_${index}`] = `Deposit for unit ${index + 1} must be a non-negative number`;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [propertyName, address, unitTypes]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateForm()) return;
      if (!userId) {
        setError("User ID is missing.");
        return;
      }
      setIsLoading(true);
      setError(null);

      const propertyData = {
        name: propertyName,
        address,
        unitTypes: unitTypes.map((u) => ({
          type: u.type,
          price: parseFloat(u.price) || 0,
          deposit: parseFloat(u.deposit) || 0,
        })),
        ownerId: userId,
      };

      try {
        const url = modalMode === "add" ? "/api/properties" : `/api/properties/${editingPropertyId}`;
        const method = modalMode === "add" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(propertyData),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          resetForm();
          fetchProperties();
        } else {
          setError(data.message || `Failed to ${modalMode === "add" ? "add" : "update"} property.`);
        }
      } catch {
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
      }
    },
    [userId, modalMode, editingPropertyId, propertyName, address, unitTypes, fetchProperties, resetForm, validateForm]
  );

  const handleSort = useCallback((key: "name" | "address" | "createdAt") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedProperties = [...properties].sort((a, b) => {
        if (key === "createdAt") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        return direction === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setProperties(sortedProperties);
      return { key, direction };
    });
  }, [properties]);

  const getSortIcon = useCallback((key: "name" | "address" | "createdAt") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const addUnitType = useCallback(() => {
    setUnitTypes((prev) => [...prev, { type: "", price: "", deposit: "" }]);
  }, []);

  const updateUnitType = useCallback((index: number, field: string, value: string) => {
    setUnitTypes((prev) =>
      prev.map((unit, i) =>
        i === index ? { ...unit, [field]: value } : unit
      )
    );
  }, []);

  const removeUnitType = useCallback((index: number) => {
    setUnitTypes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <Home className="text-[#1e3a8a]" />
            Manage Properties
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          <div className="flex justify-end mb-6">
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium ${
                isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#1e3a8a] hover:bg-[#1e40af]"
              }`}
              disabled={isLoading}
              aria-label="Add new property"
            >
              <Plus className="h-5 w-5" />
              Add Property
            </button>
          </div>
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1e3a8a]"></div>
              <span className="ml-2">Loading properties...</span>
            </div>
          ) : properties.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No properties found. Add a property to get started.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("name")}
                    >
                      Name {getSortIcon("name")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("address")}
                    >
                      Address {getSortIcon("address")}
                    </th>
                    <th className="px-4 py-3 text-left">Unit Types</th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("createdAt")}
                    >
                      Created At {getSortIcon("createdAt")}
                    </th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => (
                    <tr
                      key={p._id}
                      className="border-t hover:bg-gray-50 transition cursor-pointer"
                      onClick={() => router.push(`/property-owner-dashboard/properties/${p._id}`)}
                    >
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3">{p.address}</td>
                      <td className="px-4 py-3">
                        {p.unitTypes.map((u) => u.type).join(", ") || "N/A"}
                      </td>
                      <td className="px-4 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td
                        className="px-4 py-3 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-[#1e3a8a] hover:text-[#1e40af] transition"
                          title="Edit Property"
                          aria-label={`Edit property ${p.name}`}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p._id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete Property"
                          aria-label={`Delete property ${p.name}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Modal
            title={modalMode === "add" ? "Add Property" : "Edit Property"}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              resetForm();
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Property Name</label>
                <input
                  placeholder="Enter property name"
                  value={propertyName}
                  onChange={(e) => {
                    setPropertyName(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      propertyName: e.target.value.trim() ? undefined : "Property name is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition ${
                    formErrors.propertyName ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {formErrors.propertyName && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.propertyName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <input
                  placeholder="Enter address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      address: e.target.value.trim() ? undefined : "Address is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition ${
                    formErrors.address ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {formErrors.address && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.address}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit Types</label>
                {unitTypes.map((unit, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      placeholder="Unit type (e.g., 1-Bedroom)"
                      value={unit.type}
                      onChange={(e) => updateUnitType(index, "type", e.target.value)}
                      className={`flex-1 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition ${
                        formErrors[`unitType_${index}`] ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    <input
                      placeholder="Price ($/month)"
                      value={unit.price}
                      onChange={(e) => updateUnitType(index, "price", e.target.value)}
                      type="number"
                      className={`w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition ${
                        formErrors[`unitPrice_${index}`] ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    <input
                      placeholder="Deposit ($)"
                      value={unit.deposit}
                      onChange={(e) => updateUnitType(index, "deposit", e.target.value)}
                      type="number"
                      className={`w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition ${
                        formErrors[`unitDeposit_${index}`] ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {unitTypes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUnitType(index)}
                        className="text-red-600 hover:text-red-800 transition"
                        aria-label={`Remove unit type ${index + 1}`}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
                {unitTypes.map((_, index) => (
                  <div key={index} className="space-y-1">
                    {formErrors[`unitType_${index}`] && (
                      <p className="text-red-500 text-xs">{formErrors[`unitType_${index}`]}</p>
                    )}
                    {formErrors[`unitPrice_${index}`] && (
                      <p className="text-red-500 text-xs">{formErrors[`unitPrice_${index}`]}</p>
                    )}
                    {formErrors[`unitDeposit_${index}`] && (
                      <p className="text-red-500 text-xs">{formErrors[`unitDeposit_${index}`]}</p>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addUnitType}
                  className="text-[#1e3a8a] hover:text-[#1e40af] transition text-sm"
                  aria-label="Add another unit type"
                >
                  + Add Unit Type
                </button>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                  aria-label="Cancel property form"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || Object.values(formErrors).some((v) => v !== undefined)}
                  className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 ${
                    isLoading || Object.values(formErrors).some((v) => v !== undefined)
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-[#1e3a8a] hover:bg-[#1e40af]"
                  }`}
                  aria-label={modalMode === "add" ? "Add property" : "Update property"}
                >
                  {isLoading && (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  )}
                  {modalMode === "add" ? "Add Property" : "Update Property"}
                </button>
              </div>
            </form>
          </Modal>
          <Modal
            title="Confirm Delete"
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
          >
            <p className="mb-6 text-gray-700">
              Are you sure you want to delete this property? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                aria-label="Cancel delete property"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2"
                disabled={isLoading}
                aria-label="Confirm delete property"
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                Delete
              </button>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}