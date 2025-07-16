"use client";

import React, { useState, useEffect } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Building2, Plus, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

type UnitType = {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
};

type Property = {
  _id: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  status: string;
  ownerId: string;
  createdAt: string;
};

interface SortConfig {
  key: "name" | "address" | "createdAt";
  direction: "asc" | "desc";
}

const useAuth = () => {
  if (typeof window === "undefined") {
    console.log("useAuth: Running server-side, returning null");
    return { userId: null, role: null };
  }
  const userId = Cookies.get("userId") || null;
  const role = Cookies.get("role") || null;
  console.log("useAuth: Cookies read:", { userId, role });
  return { userId, role };
};

export default function PropertiesPage() {
  const { userId, role } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([{ type: "", quantity: 0, price: 0, deposit: 0 }]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});

  useEffect(() => {
    if (!userId || role !== "propertyOwner") {
      console.log("useEffect: Unauthorized, redirecting to /");
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
      return;
    }
    fetchProperties();
  }, [userId, role, router]);

  const fetchProperties = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/properties?userId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchProperties response:", data);
      if (data.success) {
        const validProperties = data.properties?.map((property: Property) => ({
          ...property,
          unitTypes: property.unitTypes.map((unit: UnitType) => ({
            ...unit,
            price: unit.price ?? 0,
            deposit: unit.deposit ?? 0,
          })),
        })) || [];
        setProperties(validProperties);
      } else {
        setError(data.message || "Failed to fetch properties");
      }
    } catch (err) {
      console.error("Fetch properties error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const errors: { [key: string]: string | undefined } = {};
    if (!propertyName.trim()) errors.propertyName = "Property name is required";
    if (!propertyAddress.trim()) errors.propertyAddress = "Property address is required";
    unitTypes.forEach((unit, index) => {
      if (!unit.type.trim()) errors[`unitType${index}`] = `Unit type ${index + 1} name is required`;
      if (unit.quantity < 0) errors[`unitQuantity${index}`] = `Unit ${index + 1} quantity must be non-negative`;
      if (unit.price < 0) errors[`unitPrice${index}`] = `Unit ${index + 1} price must be non-negative`;
      if (unit.deposit < 0) errors[`unitDeposit${index}`] = `Unit ${index + 1} deposit must be non-negative`;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUnitTypeChange = (index: number, field: keyof UnitType, value: string | number) => {
    const updatedUnitTypes = [...unitTypes];
    let parsedValue: string | number;
    
    if (field === "type") {
      parsedValue = typeof value === "string" ? value : "";
    } else {
      // For quantity, price, deposit: ensure value is a number
      parsedValue = typeof value === "string" ? (parseFloat(value) || 0) : value;
      if (isNaN(parsedValue)) parsedValue = 0;
    }

    updatedUnitTypes[index] = {
      ...updatedUnitTypes[index],
      [field]: parsedValue,
    };
    setUnitTypes(updatedUnitTypes);

    // Validate immediately
    const errors = { ...formErrors };
    const key = `unit${field.charAt(0).toUpperCase() + field.slice(1)}${index}`;
    if (field === "type" && typeof parsedValue === "string" && !parsedValue.trim()) {
      errors[key] = `Unit type ${index + 1} name is required`;
    } else if (field !== "type" && typeof parsedValue === "number" && parsedValue < 0) {
      errors[key] = `Unit ${index + 1} ${field} must be non-negative`;
    } else {
      delete errors[key];
    }
    setFormErrors(errors);
  };

  const addUnitType = () => {
    setUnitTypes([...unitTypes, { type: "", quantity: 0, price: 0, deposit: 0 }]);
  };

  const removeUnitType = (index: number) => {
    if (unitTypes.length > 1) {
      setUnitTypes(unitTypes.filter((_, i) => i !== index));
      const errors = { ...formErrors };
      ["type", "quantity", "price", "deposit"].forEach((field) => {
        delete errors[`unit${field.charAt(0).toUpperCase() + field.slice(1)}${index}`];
      });
      setFormErrors(errors);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError("User not authenticated. Please log in.");
      router.push("/");
      return;
    }
    if (!validateForm()) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: propertyName,
          address: propertyAddress,
          unitTypes,
          status: "vacant",
          ownerId: userId,
        }),
      });
      const data = await response.json();
      console.log("Add property response:", data);
      if (data.success) {
        setSuccessMessage("Property added successfully!");
        setIsModalOpen(false);
        setPropertyName("");
        setPropertyAddress("");
        setUnitTypes([{ type: "", quantity: 0, price: 0, deposit: 0 }]);
        setFormErrors({});
        fetchProperties();
      } else {
        setError(data.message || "Failed to add property");
      }
    } catch (err) {
      console.error("Add property error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (key: "name" | "address" | "createdAt") => {
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
  };

  const getSortIcon = (key: "name" | "address" | "createdAt") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-3xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <Building2 className="text-[#1e3a8a]" />
            Manage Properties
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {successMessage}
            </div>
          )}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-[#1e3a8a] text-white px-4 py-2 rounded-lg hover:bg-[#1e40af] transition shadow"
              disabled={isLoading}
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
              <table className="min-w-full table-auto text-sm">
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
                    <th className="px-4 py-3 text-left">Total Units</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("createdAt")}
                    >
                      Created At {getSortIcon("createdAt")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((property) => (
                    <tr key={property._id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">{property.name}</td>
                      <td className="px-4 py-3">{property.address}</td>
                      <td className="px-4 py-3">
                        {property.unitTypes.length > 0 ? (
                          <ul className="list-disc ml-4">
                            {property.unitTypes.map((unit, index) => (
                              <li key={index}>
                                {unit.type}: {unit.quantity} units at Ksh.{unit.price.toFixed(2)}/month, Ksh.
                                {unit.deposit.toFixed(2)} deposit
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "N/A"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {property.unitTypes.reduce((sum, unit) => sum + unit.quantity, 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                            property.status === "occupied"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {property.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{new Date(property.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Modal
  title="Add Property"
  isOpen={isModalOpen}
  onClose={() => {
    setIsModalOpen(false);
    setPropertyName("");
    setPropertyAddress("");
    setUnitTypes([{ type: "", quantity: 0, price: 0, deposit: 0 }]);
    setFormErrors({});
  }}
>
  <form onSubmit={handleSubmit} className="space-y-4">
    <div>
      <label className="block text-sm font-semibold text-gray-700">Property Name</label>
<input
  type="text"
  value={propertyName}
  onChange={(e) => setPropertyName(e.target.value)}
  className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition ${
    formErrors.propertyName ? "border-red-500" : "border-gray-300"
  }`}
  required
  placeholder="e.g., Green Valley Apartments"
/>
{formErrors.propertyName && (
  <p className="text-red-500 text-xs mt-1">{formErrors.propertyName}</p>
)}

    </div>

    <div>
      <label className="block text-sm font-semibold text-gray-700">Property Address</label>
<input
  type="text"
  value={propertyAddress}
  onChange={(e) => setPropertyAddress(e.target.value)}
  className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition ${
    formErrors.propertyAddress ? "border-red-500" : "border-gray-300"
  }`}
  required
  placeholder="e.g., 123 Main St, Nairobi"
/>
{formErrors.propertyAddress && (
  <p className="text-red-500 text-xs mt-1">{formErrors.propertyAddress}</p>
)}

    </div>

    <div>
      <label className="block text-sm font-semibold text-gray-700">Unit Types</label>
      {unitTypes.map((unit, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2 items-end">
          <div>
            <input
              type="text"
              placeholder="Unit Type"
              value={unit.type}
              onChange={(e) => handleUnitTypeChange(index, "type", e.target.value)}
              className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 transition ${
                formErrors[`unitType${index}`] ? "border-red-500" : "border-gray-300"
              }`}
              required
            />
            {formErrors[`unitType${index}`] && (
              <p className="text-red-500 text-xs mt-1">{formErrors[`unitType${index}`]}</p>
            )}
          </div>

          <div>
            <input
              type="number"
              placeholder="Quantity"
              value={unit.quantity || ""}
              onChange={(e) => handleUnitTypeChange(index, "quantity", e.target.value)}
              className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 transition ${
                formErrors[`unitQuantity${index}`] ? "border-red-500" : "border-gray-300"
              }`}
              required
              min="0"
            />
          </div>

          <div>
            <input
              type="number"
              placeholder="Price ($/month)"
              value={unit.price || ""}
              onChange={(e) => handleUnitTypeChange(index, "price", e.target.value)}
              className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 transition ${
                formErrors[`unitPrice${index}`] ? "border-red-500" : "border-gray-300"
              }`}
              required
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <input
              type="number"
              placeholder="Deposit ($)"
              value={unit.deposit || ""}
              onChange={(e) => handleUnitTypeChange(index, "deposit", e.target.value)}
              className={`w-full border px-3 py-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-600 transition ${
                formErrors[`unitDeposit${index}`] ? "border-red-500" : "border-gray-300"
              }`}
              required
              min="0"
              step="0.01"
            />
          </div>

          {unitTypes.length > 1 && (
            <button
              type="button"
              onClick={() => removeUnitType(index)}
              className="text-red-600 hover:text-red-800 transition"
              aria-label={`Remove unit type ${index + 1}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addUnitType}
        className="text-blue-700 hover:underline text-sm mt-2 flex items-center gap-1 font-medium"
      >
        <Plus className="h-4 w-4" />
        Add Another Unit Type
      </button>
    </div>

    <div className="flex justify-end gap-3 pt-4">
      <button
        type="button"
        onClick={() => {
          setIsModalOpen(false);
          setPropertyName("");
          setPropertyAddress("");
          setUnitTypes([{ type: "", quantity: 0, price: 0, deposit: 0 }]);
          setFormErrors({});
        }}
        className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 hover:bg-gray-400 transition"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={isLoading || Object.keys(formErrors).length > 0}
        className="px-6 py-2 bg-gradient-to-r from-blue-700 to-blue-900 text-white rounded-lg font-medium hover:from-blue-800 hover:to-blue-950 transition flex items-center gap-2 disabled:opacity-50"
      >
        {isLoading && (
          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
        )}
        Add Property
      </button>
    </div>
  </form>
</Modal>

        </main>
      </div>
    </div>
  );
}