"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Pencil, Trash2, Plus, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number; managementType: "RentCollection" | "FullManagement"; managementFee: number }[];
  status: "Active" | "Inactive";
  rentPaymentDate: number;
  createdAt: string;
}

const UNIT_TYPES = [
  {
    type: "Single",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Bedsitter",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 5000 },
        { range: [51, 100], fee: 8000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "1-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "2-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "3-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Duplex",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Commercial",
    pricing: {
      RentCollection: [
        { range: [1, 15], fee: 5000 },
        { range: [16, 25], fee: 8000 },
        { range: [26, Infinity], fee: 15000 },
      ],
      FullManagement: 0,
    },
  },
];

interface SortConfig {
  key: "name" | "address" | "createdAt" | "status" | "rentPaymentDate";
  direction: "asc" | "desc";
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [rentPaymentDate, setRentPaymentDate] = useState<string>("");
  const [unitTypes, setUnitTypes] = useState<
    { type: string; price: string; deposit: string; quantity: string; managementType: "RentCollection" | "FullManagement" }[]
  >([{ type: "", price: "", deposit: "", quantity: "", managementType: "RentCollection" }]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  // Fetch CSRF token on mount
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        } else {
          setError("Failed to fetch CSRF token.");
        }
      } catch {
        setError("Failed to connect to the server for CSRF token.");
      }
    };

    fetchCsrfToken();
  }, []);

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
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken && { "x-csrf-token": csrfToken }),
        },
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
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      fetchProperties();
    }
  }, [userId, role, csrfToken, fetchProperties]);

  const resetForm = useCallback(() => {
    setPropertyName("");
    setAddress("");
    setStatus("Active");
    setRentPaymentDate("");
    setUnitTypes([{ type: "", price: "", deposit: "", quantity: "", managementType: "RentCollection" }]);
    setFormErrors({});
    setEditingPropertyId(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setModalMode("add");
    setIsModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback(
    (property: Property) => {
      setModalMode("edit");
      setEditingPropertyId(property._id);
      setPropertyName(property.name);
      setAddress(property.address);
      setStatus(property.status);
      setRentPaymentDate(property.rentPaymentDate.toString());
      setUnitTypes(
        property.unitTypes.map((u) => ({
          type: u.type,
          price: u.price.toString(),
          deposit: u.deposit.toString(),
          quantity: u.quantity.toString(),
          managementType: u.managementType,
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
    if (!propertyToDelete || !csrfToken) {
      setError("Missing property ID or CSRF token.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/properties/${propertyToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ csrfToken }),
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
  }, [propertyToDelete, fetchProperties, csrfToken]);

  const validateForm = useCallback(() => {
    const errors: { [key: string]: string | undefined } = {};
    if (!propertyName.trim()) errors.propertyName = "Property name is required";
    if (!address.trim()) errors.address = "Address is required";
    if (!rentPaymentDate || isNaN(parseInt(rentPaymentDate)) || parseInt(rentPaymentDate) < 1 || parseInt(rentPaymentDate) > 28)
      errors.rentPaymentDate = "Rent payment date must be a number between 1 and 28";

    unitTypes.forEach((unit, index) => {
      if (!unit.type || !UNIT_TYPES.find((ut) => ut.type === unit.type)) {
        errors[`unitType_${index}`] = `Unit type ${index + 1} must be selected from the list`;
      }
      if (!unit.price || isNaN(parseFloat(unit.price)) || parseFloat(unit.price) < 0)
        errors[`unitPrice_${index}`] = `Price for unit ${index + 1} must be a non-negative number`;
      if (!unit.deposit || isNaN(parseFloat(unit.deposit)) || parseFloat(unit.deposit) < 0)
        errors[`unitDeposit_${index}`] = `Deposit for unit ${index + 1} must be a non-negative number`;
      if (!unit.quantity || isNaN(parseInt(unit.quantity)) || parseInt(unit.quantity) < 0)
        errors[`unitQuantity_${index}`] = `Quantity for unit ${index + 1} must be a non-negative integer`;
      if (!unit.managementType)
        errors[`unitManagementType_${index}`] = `Management type for unit ${index + 1} is required`;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [propertyName, address, rentPaymentDate, unitTypes]);


  const getManagementFee = (unitType: string, managementType: "RentCollection" | "FullManagement", quantity: string): string => {
    const unit = UNIT_TYPES.find((ut) => ut.type === unitType);
    if (!unit) return "0 Ksh/mo";
    const parsedQuantity = parseInt(quantity) || 0;
    const pricing = unit.pricing[managementType];
    if (typeof pricing === "number") return `${pricing} Ksh/mo`;
    for (const tier of pricing) {
      const [min, max] = tier.range;
      if (parsedQuantity >= min && parsedQuantity <= max) {
        return `${tier.fee} Ksh/mo`;
      }
    }
    return "0 Ksh/mo";
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateForm()) return;
      if (!userId || !csrfToken) {
        setError("User ID or CSRF token is missing.");
        return;
      }
      setIsLoading(true);
      setError(null);

      const propertyData = {
        name: propertyName,
        address,
        status,
        rentPaymentDate: parseInt(rentPaymentDate),
        unitTypes: unitTypes.map((u) => ({
          type: u.type,
          price: parseFloat(u.price) || 0,
          deposit: parseFloat(u.deposit) || 0,
          quantity: parseInt(u.quantity) || 0,
          managementType: u.managementType,
        })),
        ownerId: userId,
        csrfToken,
      };

      try {
        const url = modalMode === "add" ? "/api/properties" : `/api/properties/${editingPropertyId}`;
        const method = modalMode === "add" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
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
    [userId, modalMode, editingPropertyId, propertyName, address, status, rentPaymentDate, unitTypes, fetchProperties, resetForm, validateForm, csrfToken]
  );

  const sortedProperties = useMemo(() => {
    const sorted = [...properties];
    const { key, direction } = sortConfig;
    sorted.sort((a, b) => {
      if (key === "createdAt") {
        return direction === "asc"
          ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
          : new Date(b[key]).getTime() - new Date(a[key]).getTime();
      }
      if (key === "rentPaymentDate") {
        return direction === "asc"
          ? a[key] - b[key]
          : b[key] - a[key];
      }
      return direction === "asc"
        ? a[key].localeCompare(b[key])
        : b[key].localeCompare(a[key]);
    });
    return sorted;
  }, [properties, sortConfig]);

  const handleSort = useCallback((key: "name" | "address" | "createdAt" | "status" | "rentPaymentDate") => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const getSortIcon = useCallback((key: "name" | "address" | "createdAt" | "status" | "rentPaymentDate") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const addUnitType = useCallback(() => {
    setUnitTypes((prev) => [...prev, { type: "", price: "", deposit: "", quantity: "", managementType: "RentCollection" }]);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <motion.div
            className="flex justify-between items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Home className="text-[#012a4a]" />
              Manage Properties
            </h1>
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium ${isLoading || !csrfToken ? "bg-gray-400 cursor-not-allowed" : "bg-[#012a4a] hover:bg-[#014a7a]"
                }`}
              disabled={isLoading || !csrfToken}
              aria-label="Add new property"
            >
              <Plus className="h-5 w-5" />
              Add Property
            </button>
          </motion.div>
          {error && (
            <motion.div
              className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          {isLoading ? (
            <motion.div
              className="text-center text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading properties...</span>
            </motion.div>
          ) : sortedProperties.length === 0 ? (
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              No properties found. Add a property to get started.
            </motion.div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    {["name", "address", "status", "rentPaymentDate", "createdAt"].map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleSort(key as "name" | "address" | "createdAt" | "status" | "rentPaymentDate")}
                      >
                        {key === "rentPaymentDate" ? "Rent Due Day" : key[0].toUpperCase() + key.slice(1)} {getSortIcon(key as "name" | "address" | "createdAt" | "status" | "rentPaymentDate")}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left">Unit Types</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProperties.map((p, index) => (
                    <motion.tr
                      key={p._id}
                      className="border-t hover:bg-gray-50 transition cursor-pointer"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      onClick={() => router.push(`/property-owner-dashboard/properties/${p._id}`)}
                    >
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3">{p.address}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${p.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                            }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{p.rentPaymentDate}</td>
                      <td className="px-4 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {p.unitTypes.map((u) => `${u.type} (x${u.quantity}, ${u.managementFee} Ksh/mo)`).join(", ") || "N/A"}
                      </td>
                      <td
                        className="px-4 py-3 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-[#012a4a] hover:text-[#014a7a] transition"
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
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AnimatePresence>
            {isModalOpen && (
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
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors.propertyName ? "border-red-500" : "border-gray-300"
                        } text-sm sm:text-base`}
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
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors.address ? "border-red-500" : "border-gray-300"
                        } text-sm sm:text-base`}
                    />
                    {formErrors.address && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.address}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Rent Payment Date (Day of Month)</label>
                    <input
                      placeholder="Enter day (1-28)"
                      value={rentPaymentDate}
                      onChange={(e) => {
                        setRentPaymentDate(e.target.value);
                        setFormErrors((prev) => ({
                          ...prev,
                          rentPaymentDate:
                            e.target.value && !isNaN(parseInt(e.target.value)) && parseInt(e.target.value) >= 1 && parseInt(e.target.value) <= 28
                              ? undefined
                              : "Rent payment date must be a number between 1 and 28",
                        }));
                      }}
                      type="number"
                      min="1"
                      max="28"
                      required
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors.rentPaymentDate ? "border-red-500" : "border-gray-300"
                        } text-sm sm:text-base`}
                    />
                    {formErrors.rentPaymentDate && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.rentPaymentDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "Active" | "Inactive")}
                      className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition border-gray-300 text-sm sm:text-base"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unit Types</label>
                    {unitTypes.map((unit, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4 sm:mb-2"
                      >
                        <div className="flex items-center w-full sm:flex-1">
                          <select
                            value={unit.type}
                            onChange={(e) => updateUnitType(index, "type", e.target.value)}
                            className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors[`unitType_${index}`] ? "border-red-500" : "border-gray-300"
                              } text-sm sm:text-base`}
                          >
                            <option value="" disabled>
                              Select unit type
                            </option>
                            {UNIT_TYPES.map((ut) => (
                              <option key={ut.type} value={ut.type}>
                                {ut.type} {unitTypes.filter(u => u.type === ut.type).length > 1 ? `#${index + 1}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          placeholder="Price (Ksh/month)"
                          value={unit.price}
                          onChange={(e) => updateUnitType(index, "price", e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-full sm:w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors[`unitPrice_${index}`] ? "border-red-500" : "border-gray-300"
                            } text-sm sm:text-base`}
                        />
                        <input
                          placeholder="Deposit (Ksh)"
                          value={unit.deposit}
                          onChange={(e) => updateUnitType(index, "deposit", e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-full sm:w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors[`unitDeposit_${index}`] ? "border-red-500" : "border-gray-300"
                            } text-sm sm:text-base`}
                        />
                        <input
                          placeholder="Quantity"
                          value={unit.quantity}
                          onChange={(e) => updateUnitType(index, "quantity", e.target.value)}
                          type="number"
                          min="0"
                          step="1"
                          className={`w-full sm:w-20 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors[`unitQuantity_${index}`] ? "border-red-500" : "border-gray-300"
                            } text-sm sm:text-base`}
                        />
                        <select
                          value={unit.managementType}
                          onChange={(e) => updateUnitType(index, "managementType", e.target.value)}
                          className={`w-full sm:w-40 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${formErrors[`unitManagementType_${index}`] ? "border-red-500" : "border-gray-300"
                            } text-sm sm:text-base`}
                        >
                          <option value="RentCollection">
                            Rent Collection ({getManagementFee(unit.type, "RentCollection", unit.quantity)})
                          </option>
                          <option value="FullManagement">
                            Full Management ({getManagementFee(unit.type, "FullManagement", unit.quantity)})
                          </option>
                        </select>
                        {unitTypes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeUnitType(index)}
                            className="text-red-600 hover:text-red-800 transition self-start sm:self-center"
                            aria-label={`Remove unit type ${index + 1}`}
                          >
                            <Trash2 className="h-6 w-6 sm:h-5 sm:w-5" />
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
                        {formErrors[`unitQuantity_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitQuantity_${index}`]}</p>
                        )}
                        {formErrors[`unitManagementType_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitManagementType_${index}`]}</p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addUnitType}
                      className="text-[#012a4a] hover:text-[#014a7a] transition text-sm"
                      aria-label="Add another unit type"
                    >
                      + Add Unit Type
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        resetForm();
                      }}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                      aria-label="Cancel property form"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || Object.values(formErrors).some((v) => v !== undefined) || !csrfToken}
                      className={`px-4 py-2 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm sm:text-base ${isLoading || Object.values(formErrors).some((v) => v !== undefined) || !csrfToken
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-[#012a4a] hover:bg-[#014a7a]"
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
            )}
            {isDeleteModalOpen && (
              <Modal
                title="Confirm Delete"
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
              >
                <p className="mb-6 text-gray-700 text-sm sm:text-base">
                  Are you sure you want to delete this property? This action cannot be undone.
                </p>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                    aria-label="Cancel delete property"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 text-sm sm:text-base"
                    disabled={isLoading || !csrfToken}
                    aria-label="Confirm delete property"
                  >
                    {isLoading && (
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    )}
                    Delete
                  </button>
                </div>
              </Modal>
            )}
          </AnimatePresence>
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}