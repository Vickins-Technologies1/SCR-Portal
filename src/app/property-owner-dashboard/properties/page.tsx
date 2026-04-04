"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Pencil, Trash2, Plus, ArrowUpDown, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import PriceOverrideModal from "../components/PriceOverrideModal";
import { usePermissions } from "@/hooks/usePermissions";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number; managementType: "RentCollection" | "FullManagement"; managementFee: number }[];
  billingType?: "RentCollection" | "FullManagement";
  status: "Active" | "Inactive";
  rentPaymentDate: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
  createdAt: string;
}

const UNIT_TYPES = [
  {
    type: "Single",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Bedsitter",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "1-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "2-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "3-Bedroom",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Duplex",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Commercial",
    pricing: {
      RentCollection: [
        { range: [1, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
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
  const perm = usePermissions();
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [overrideProperty, setOverrideProperty] = useState<Property | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [rentPaymentDate, setRentPaymentDate] = useState<string>("");
  const [penaltyAmount, setPenaltyAmount] = useState<string>("");
  const [penaltyFrequency, setPenaltyFrequency] = useState<"" | "daily" | "weekly">("");
  const [unitTypes, setUnitTypes] = useState<
    { type: string; price: string; deposit: string; quantity: string }[]
  >([{ type: "", price: "", deposit: "", quantity: "" }]);
  const [billingType, setBillingType] = useState<"RentCollection" | "FullManagement">("RentCollection");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  const canViewProperties = perm.hasPermission("properties:view");
  const canEditProperties = perm.hasPermission("properties:edit");
  const canListProperties = perm.hasPermission("properties:list_new");

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

  // Auth check + determine effective owner
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    setUserId(uid || null);
    setRole(userRole || null);

    let ownerIdToUse: string | null = null;

    if (userRole === "propertyOwner") {
      ownerIdToUse = uid || null;
    } else if (userRole === "teamMember") {
      // Use ownerId cookie set during login (preferred)
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      setError("Unauthorized. Please log in as a property owner or team member.");
      router.push("/");
      return;
    }

    if (userRole === "teamMember" && !canViewProperties) {
      setError("Access restricted. You do not have permission to view properties.");
      router.replace("/property-owner-dashboard");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router, canViewProperties]);

  const fetchProperties = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(effectiveOwnerId)}`, {
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
  }, [effectiveOwnerId, csrfToken]);

  useEffect(() => {
    if (effectiveOwnerId && csrfToken) {
      fetchProperties();
    }
  }, [effectiveOwnerId, csrfToken, fetchProperties]);

  const resetForm = useCallback(() => {
    setPropertyName("");
    setAddress("");
    setStatus("Active");
    setRentPaymentDate("");
    setPenaltyAmount("");
    setPenaltyFrequency("");
    setUnitTypes([{ type: "", price: "", deposit: "", quantity: "" }]);
    setBillingType("RentCollection");
    setFormErrors({});
    setEditingPropertyId(null);
  }, []);

  const openAddModal = useCallback(() => {
    if (!canListProperties) return;
    resetForm();
    setModalMode("add");
    setIsModalOpen(true);
  }, [resetForm, canListProperties]);

  const openEditModal = useCallback(
    (property: Property) => {
      if (!canEditProperties) return;
      setModalMode("edit");
      setEditingPropertyId(property._id);
      setPropertyName(property.name);
      setAddress(property.address);
      setStatus(property.status);
      setRentPaymentDate(property.rentPaymentDate.toString());
      setPenaltyAmount(property.penaltyAmount ? property.penaltyAmount.toString() : "");
      setPenaltyFrequency(property.penaltyFrequency ?? "");
      setUnitTypes(
        property.unitTypes.map((u) => ({
          type: u.type,
          price: u.price.toString(),
          deposit: u.deposit.toString(),
          quantity: u.quantity.toString(),
        }))
      );
      setBillingType(property.billingType || property.unitTypes?.[0]?.managementType || "RentCollection");
      setFormErrors({});
      setIsModalOpen(true);
    },
    [canEditProperties]
  );

  const handleDelete = useCallback((id: string) => {
    if (!canEditProperties) return;
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  }, [canEditProperties]);

  const openOverrideModal = useCallback((property: Property) => {
    if (!canEditProperties) return;
    setOverrideProperty(property);
    setIsOverrideModalOpen(true);
  }, [canEditProperties]);

  const confirmDelete = useCallback(async () => {
    if (!canEditProperties) {
      setIsDeleteModalOpen(false);
      return;
    }
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
  }, [propertyToDelete, fetchProperties, csrfToken, canEditProperties]);

  const validateForm = useCallback(() => {
    const errors: { [key: string]: string | undefined } = {};
    if (!propertyName.trim()) errors.propertyName = "Property name is required";
    if (!address.trim()) errors.address = "Address is required";
    if (!rentPaymentDate || isNaN(parseInt(rentPaymentDate)) || parseInt(rentPaymentDate) < 1 || parseInt(rentPaymentDate) > 28)
      errors.rentPaymentDate = "Rent payment date must be a number between 1 and 28";
    const parsedPenaltyAmount = penaltyAmount.trim() === "" ? 0 : parseFloat(penaltyAmount);
    if (Number.isNaN(parsedPenaltyAmount) || parsedPenaltyAmount < 0) {
      errors.penaltyAmount = "Penalty amount must be a non-negative number";
    }
    if (parsedPenaltyAmount > 0 && !penaltyFrequency) {
      errors.penaltyFrequency = "Select daily or weekly for penalty frequency";
    }
    if (penaltyFrequency && parsedPenaltyAmount <= 0) {
      errors.penaltyAmount = "Enter a penalty amount greater than 0";
    }
    if (unitTypes.length === 0 || unitTypes.every((unit) => !unit.type || parseInt(unit.quantity) === 0))
      errors.unitTypes = "At least one valid unit type with non-zero quantity is required";

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
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [propertyName, address, rentPaymentDate, penaltyAmount, penaltyFrequency, unitTypes]);
  const calculateTotalUnits = useCallback(() => {
    return unitTypes.reduce((sum, unit) => sum + (parseInt(unit.quantity) || 0), 0);
  }, [unitTypes]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateForm()) return;
      if (!userId || !effectiveOwnerId || !csrfToken) {
        setError("User ID, owner ID, or CSRF token is missing.");
        return;
      }

      if (modalMode === "add" && !canListProperties) {
        setError("You do not have permission to add properties.");
        return;
      }
      if (modalMode === "edit" && !canEditProperties) {
        setError("You do not have permission to edit properties.");
        return;
      }

      setIsLoading(true);
      setError(null);

      const propertyData = {
        name: propertyName,
        address,
        status,
        rentPaymentDate: parseInt(rentPaymentDate),
        penaltyAmount: penaltyAmount.trim() === "" ? 0 : parseFloat(penaltyAmount),
        penaltyFrequency: penaltyFrequency || null,
        unitTypes: unitTypes.map((u) => ({
          type: u.type,
          price: parseFloat(u.price) || 0,
          deposit: parseFloat(u.deposit) || 0,
          quantity: parseInt(u.quantity) || 0,
          managementType: billingType,
        })),
        billingType,
        ownerId: effectiveOwnerId,
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
    [userId, effectiveOwnerId, modalMode, editingPropertyId, propertyName, address, status, rentPaymentDate, penaltyAmount, penaltyFrequency, unitTypes, billingType, fetchProperties, resetForm, validateForm, csrfToken, canListProperties, canEditProperties]
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
    setUnitTypes((prev) => [...prev, { type: "", price: "", deposit: "", quantity: "" }]);
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

  const fieldBase =
    "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm sm:text-base text-foreground shadow-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition";
  const fieldError = "border-red-500 focus:border-red-500 focus:ring-red-200/70";
  const labelBase = "block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground";
  const sectionBase = "rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm";
  const sectionTitle = "text-sm sm:text-base font-semibold text-foreground";
  const sectionSubtitle = "text-xs sm:text-sm text-muted-foreground";

  return (
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Manage Properties</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Organize listings, unit types, and rent schedules in one place.
                  </p>
                </div>
              </div>
              {canListProperties && (
                <button
                  onClick={openAddModal}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-white ${isLoading || !csrfToken ? "bg-gray-300 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"}`}
                  disabled={isLoading || !csrfToken}
                  aria-label="Add new property"
                >
                  <Plus className="h-4 w-4" />
                  Add Property
                </button>
              )}
            </div>
          </motion.section>
          {error && (
            <motion.div
              className="bg-red-100 text-red-700 p-3 rounded-xl shadow text-xs sm:text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          {isLoading ? (
            <motion.div
              className="text-center text-muted-foreground text-xs sm:text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span className="ml-2">Loading properties...</span>
            </motion.div>
          ) : sortedProperties.length === 0 ? (
            <motion.div
              className="surface-card rounded-2xl p-6 text-muted-foreground text-center text-xs sm:text-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              No properties found. Add a property to get started.
            </motion.div>
          ) : (
            <div className="table-shell">
              <div className="table-scroll">
              <table className="min-w-full table-auto">
                <thead>
                  <tr>
                    {["name", "address", "status", "rentPaymentDate", "createdAt"].map((key) => (
                      <th
                        key={key}
                        className="cursor-pointer hover:bg-gray-100/70 transition"
                        onClick={() => handleSort(key as "name" | "address" | "createdAt" | "status" | "rentPaymentDate")}
                      >
                        {key === "rentPaymentDate" ? "Rent Due Day" : key[0].toUpperCase() + key.slice(1)} {getSortIcon(key as "name" | "address" | "createdAt" | "status" | "rentPaymentDate")}
                      </th>
                    ))}
                    <th>Unit Types</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProperties.map((p, index) => (
                    <motion.tr
                      key={p._id}
                      className="hover:bg-primary/5 transition cursor-pointer"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      onClick={() => router.push(`/property-owner-dashboard/properties/${p._id}`)}
                    >
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3">{p.address}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${p.status === "Active" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-700"
                            }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{p.rentPaymentDate}</td>
                      <td className="px-4 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {p.unitTypes.map((u) => `${u.type} (x${u.quantity})`).join(", ") || "N/A"}
                      </td>
                      <td
                        className="px-4 py-3 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEditProperties && (
                          <>
                          <button
                            onClick={() => openOverrideModal(p)}
                            className="text-primary hover:text-primary-hover transition"
                            title="Schedule Price Change"
                            aria-label={`Schedule price change for ${p.name}`}
                          >
                            <Calendar className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="text-primary hover:text-primary-hover transition"
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
                          </>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              </div>
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
                className="bg-gradient-to-br from-white via-white to-primary/5"
              >
                                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="rounded-2xl border border-border bg-white/80 p-4 sm:p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Property intake</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Capture accurate property details so billing and unit management stay consistent.
                        </p>
                      </div>
                      <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Required fields
                      </div>
                    </div>
                  </div>

                  <section className={sectionBase}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className={sectionTitle}>Property Basics</p>
                        <p className={sectionSubtitle}>Name, address, and availability status.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="property-name" className={labelBase}>
                          Property Name
                        </label>
                        <input
                          id="property-name"
                          placeholder="Eg. Cedar Heights"
                          value={propertyName}
                          onChange={(e) => {
                            setPropertyName(e.target.value);
                            setFormErrors((prev) => ({
                              ...prev,
                              propertyName: e.target.value.trim() ? undefined : "Property name is required",
                            }));
                          }}
                          required
                          className={`${fieldBase} ${formErrors.propertyName ? fieldError : ""}`}
                        />
                        {formErrors.propertyName && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.propertyName}</p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="property-address" className={labelBase}>
                          Address
                        </label>
                        <input
                          id="property-address"
                          placeholder="Street, neighborhood, and city"
                          value={address}
                          onChange={(e) => {
                            setAddress(e.target.value);
                            setFormErrors((prev) => ({
                              ...prev,
                              address: e.target.value.trim() ? undefined : "Address is required",
                            }));
                          }}
                          required
                          className={`${fieldBase} ${formErrors.address ? fieldError : ""}`}
                        />
                        {formErrors.address && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.address}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="property-status" className={labelBase}>
                          Status
                        </label>
                        <select
                          id="property-status"
                          value={status}
                          onChange={(e) => setStatus(e.target.value as "Active" | "Inactive")}
                          className={fieldBase}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rent-date" className={labelBase}>
                          Rent Payment Day
                        </label>
                        <input
                          id="rent-date"
                          placeholder="1 - 28"
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
                          className={`${fieldBase} ${formErrors.rentPaymentDate ? fieldError : ""}`}
                        />
                        {formErrors.rentPaymentDate && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.rentPaymentDate}</p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className={sectionBase}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className={sectionTitle}>Billing & Policies</p>
                        <p className={sectionSubtitle}>Set the billing plan and late payment penalties.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="billing-plan" className={labelBase}>
                          Billing Plan
                        </label>
                        <select
                          id="billing-plan"
                          value={billingType}
                          onChange={(e) => setBillingType(e.target.value as "RentCollection" | "FullManagement")}
                          className={fieldBase}
                        >
                          <option value="RentCollection">Software Leasing (1% of expected income)</option>
                          <option value="FullManagement">Full Property Management</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="penalty-amount" className={labelBase}>
                          Late Payment Penalty
                        </label>
                        <input
                          id="penalty-amount"
                          placeholder="Penalty amount (Ksh)"
                          value={penaltyAmount}
                          onChange={(e) => {
                            setPenaltyAmount(e.target.value);
                            setFormErrors((prev) => ({
                              ...prev,
                              penaltyAmount: undefined,
                            }));
                          }}
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${fieldBase} ${formErrors.penaltyAmount ? fieldError : ""}`}
                        />
                        {formErrors.penaltyAmount && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.penaltyAmount}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="penalty-frequency" className={labelBase}>
                          Penalty Frequency
                        </label>
                        <select
                          id="penalty-frequency"
                          value={penaltyFrequency}
                          onChange={(e) => {
                            setPenaltyFrequency(e.target.value as "" | "daily" | "weekly");
                            setFormErrors((prev) => ({
                              ...prev,
                              penaltyFrequency: undefined,
                            }));
                          }}
                          className={`${fieldBase} ${formErrors.penaltyFrequency ? fieldError : ""}`}
                        >
                          <option value="">Select frequency</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                        {formErrors.penaltyFrequency && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.penaltyFrequency}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Optional: penalties only apply when rent is overdue.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className={sectionBase}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className={sectionTitle}>Unit Types</p>
                        <p className={sectionSubtitle}>Define the unit mix, pricing, and deposits.</p>
                      </div>
                      <button
                        type="button"
                        onClick={addUnitType}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition"
                        aria-label="Add another unit type"
                      >
                        + Add Unit Type
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        <span>Unit Type</span>
                        <span>Price</span>
                        <span>Deposit</span>
                        <span>Quantity</span>
                        <span></span>
                      </div>
                      {unitTypes.map((unit, index) => (
                        <div key={index} className="space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-end">
                            <div>
                              <span className="md:hidden text-xs font-semibold text-muted-foreground">Unit Type</span>
                              <select
                                value={unit.type}
                                onChange={(e) => updateUnitType(index, "type", e.target.value)}
                                className={`${fieldBase} ${formErrors[`unitType_${index}`] ? fieldError : ""}`}
                              >
                                <option value="" disabled>
                                  Select unit type
                                </option>
                                {UNIT_TYPES.map((ut) => (
                                  <option key={ut.type} value={ut.type}>
                                    {ut.type} {unitTypes.filter((u) => u.type === ut.type).length > 1 ? `#${index + 1}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <span className="md:hidden text-xs font-semibold text-muted-foreground">Price</span>
                              <input
                                placeholder="Ksh/month"
                                value={unit.price}
                                onChange={(e) => updateUnitType(index, "price", e.target.value)}
                                type="number"
                                min="0"
                                step="0.01"
                                className={`${fieldBase} ${formErrors[`unitPrice_${index}`] ? fieldError : ""}`}
                              />
                            </div>
                            <div>
                              <span className="md:hidden text-xs font-semibold text-muted-foreground">Deposit</span>
                              <input
                                placeholder="Ksh"
                                value={unit.deposit}
                                onChange={(e) => updateUnitType(index, "deposit", e.target.value)}
                                type="number"
                                min="0"
                                step="0.01"
                                className={`${fieldBase} ${formErrors[`unitDeposit_${index}`] ? fieldError : ""}`}
                              />
                            </div>
                            <div>
                              <span className="md:hidden text-xs font-semibold text-muted-foreground">Quantity</span>
                              <input
                                placeholder="Units"
                                value={unit.quantity}
                                onChange={(e) => updateUnitType(index, "quantity", e.target.value)}
                                type="number"
                                min="0"
                                step="1"
                                className={`${fieldBase} ${formErrors[`unitQuantity_${index}`] ? fieldError : ""}`}
                              />
                            </div>
                            {unitTypes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeUnitType(index)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
                                aria-label={`Remove unit type ${index + 1}`}
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                          {(formErrors[`unitType_${index}`] ||
                            formErrors[`unitPrice_${index}`] ||
                            formErrors[`unitDeposit_${index}`] ||
                            formErrors[`unitQuantity_${index}`]) && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs text-red-500">
                              <div>{formErrors[`unitType_${index}`]}</div>
                              <div>{formErrors[`unitPrice_${index}`]}</div>
                              <div>{formErrors[`unitDeposit_${index}`]}</div>
                              <div>{formErrors[`unitQuantity_${index}`]}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {formErrors.unitTypes && (
                      <p className="text-red-500 text-xs mt-2">{formErrors.unitTypes}</p>
                    )}

                    <div className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs sm:text-sm text-muted-foreground">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p>
                          <span className="text-foreground font-semibold">Total Units:</span> {calculateTotalUnits()}
                        </p>
                        <p>
                          <span className="text-foreground font-semibold">Billing Plan:</span>{" "}
                          {billingType === "RentCollection"
                            ? "Software leasing (1% of expected income)"
                            : "Full management (admin-set % of expected income)"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        resetForm();
                      }}
                      className="px-4 py-2 rounded-xl border border-border bg-white hover:bg-muted transition text-sm sm:text-base font-semibold text-foreground"
                      aria-label="Cancel property form"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || Object.values(formErrors).some((v) => v !== undefined) || !csrfToken}
                      className={`px-5 py-2 text-white rounded-xl transition flex items-center justify-center gap-2 text-sm sm:text-base font-semibold ${isLoading || Object.values(formErrors).some((v) => v !== undefined) || !csrfToken
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-primary hover:bg-primary-hover"
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
          <PriceOverrideModal
            isOpen={isOverrideModalOpen}
            onClose={() => {
              setIsOverrideModalOpen(false);
              setOverrideProperty(null);
            }}
            property={overrideProperty}
            csrfToken={csrfToken}
            canEdit={canEditProperties}
          />
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
























































