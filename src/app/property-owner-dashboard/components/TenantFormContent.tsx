// src/components/TenantFormContent.tsx
"use client";

import React, { useState, useEffect } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  uniqueType?: string;
  managementType: "RentCollection" | "FullManagement";
  managementFee?: number;
}

interface ClientProperty {
  _id: string;
  name: string;
  address?: string;
  unitTypes: UnitType[];
}

interface TenantFormContentProps {
  mode: "add" | "edit";
  initialData: {
    name?: string;
    email?: string;
    phone?: string;
    propertyId?: string;
    unitIdentifier?: string;
    houseNumber?: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
    [key: string]: any;
  };
  properties: ClientProperty[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  csrfToken: string;
  tenantsCount?: number;
}

export default function TenantFormContent({
  mode,
  initialData,
  properties,
  onSubmit,
  onCancel,
  isLoading,
}: TenantFormContentProps) {
  const [formData, setFormData] = useState({
    name: initialData.name || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    password: mode === "add" ? "" : "__________",
    propertyId: initialData.propertyId || "",
    unitIdentifier: initialData.unitIdentifier || "",
    houseNumber: initialData.houseNumber || "",
    leaseStartDate: initialData.leaseStartDate?.split("T")[0] || "",
    leaseEndDate: initialData.leaseEndDate?.split("T")[0] || "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedProperty = properties.find((p) => p._id === formData.propertyId);

  // CRITICAL FIX: Generate uniqueType on the fly for old properties
  const enrichedUnitTypes = selectedProperty?.unitTypes.map((unit, index) => ({
    ...unit,
    uniqueType: unit.uniqueType || `${unit.type}-${index}`,
  }));

  // Now correctly find the selected unit config
  const selectedUnitConfig = enrichedUnitTypes?.find(
    (u) => u.uniqueType === formData.unitIdentifier
  );

  // Reset unitIdentifier if property changes and current one no longer exists
  useEffect(() => {
    if (selectedProperty && formData.unitIdentifier) {
      const exists = enrichedUnitTypes?.some((u) => u.uniqueType === formData.unitIdentifier);
      if (!exists) {
        setFormData((prev) => ({ ...prev, unitIdentifier: "" }));
      }
    }
  }, [formData.propertyId, selectedProperty, enrichedUnitTypes]);

  // Safe label generator
  type UnitWithUnique = UnitType & { uniqueType: string };
  const getUnitDisplayLabel = (unit: UnitWithUnique): string => {
    const type = unit.type || "Unknown";
    const price = unit.price ?? 0;
    const deposit = unit.deposit ?? 0;
    const quantity = unit.quantity ?? 0;
    const uniqueType = unit.uniqueType || "unknown-0";

    const base = `${type} - Ksh ${price.toLocaleString()}/mo`;
    const depositText = deposit > 0 ? ` | Deposit: Ksh ${deposit.toLocaleString()}` : "";
    const availability = quantity > 0 ? ` (${quantity} available)` : " (Sold Out)";

    const sameTypeCount = selectedProperty?.unitTypes.filter((u) => u.type === type).length || 0;
    const configTag = sameTypeCount > 1
      ? ` [Config ${uniqueType.split("-").pop() || "0"}]`
      : "";

    return `${base}${depositText}${availability}${configTag}`;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()))
      newErrors.email = "Invalid email format";
    if (!formData.phone.trim()) newErrors.phone = "Phone is required";
    if (!/^\+?\d{10,15}$/.test(formData.phone.trim()))
      newErrors.phone = "Invalid phone number";
    if (mode === "add" && !formData.password.trim())
      newErrors.password = "Password is required";
    if (!formData.propertyId) newErrors.propertyId = "Property is required";
    if (!formData.unitIdentifier) newErrors.unitIdentifier = "Unit type is required";
    if (selectedUnitConfig && selectedUnitConfig.quantity <= 0)
      newErrors.unitIdentifier = "This unit is fully booked";
    if (!formData.houseNumber.trim()) newErrors.houseNumber = "House number is required";
    if (!formData.leaseStartDate) newErrors.leaseStartDate = "Start date required";
    if (!formData.leaseEndDate) newErrors.leaseEndDate = "End date required";
    if (new Date(formData.leaseEndDate) <= new Date(formData.leaseStartDate))
      newErrors.leaseEndDate = "End date must be after start date";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    await onSubmit({
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      password: mode === "add" ? formData.password : undefined,
      propertyId: formData.propertyId,
      unitIdentifier: formData.unitIdentifier,
      houseNumber: formData.houseNumber.trim(),
      leaseStartDate: formData.leaseStartDate,
      leaseEndDate: formData.leaseEndDate,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
            errors.name ? "border-red-500" : "border-gray-300"
          }`}
          placeholder="John Doe"
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Email & Phone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="john@example.com"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+254712345678"
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
              errors.phone ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
        </div>
      </div>

      {/* Password */}
      {mode === "add" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={`w-full px-4 py-2.5 pr-12 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
                errors.password ? "border-red-500" : "border-gray-300"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
        </div>
      )}

      {/* Property */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Property <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.propertyId}
          onChange={(e) => {
            setFormData({ ...formData, propertyId: e.target.value, unitIdentifier: "" });
            setErrors((prev) => ({ ...prev, propertyId: "", unitIdentifier: "" }));
          }}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
            errors.propertyId ? "border-red-500" : "border-gray-300"
          }`}
        >
          <option value="">Select Property</option>
          {properties.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} - {p.address || "No address"}
            </option>
          ))}
        </select>
        {errors.propertyId && <p className="text-red-500 text-xs mt-1">{errors.propertyId}</p>}
      </div>

      {/* Unit Type — FINAL WORKING VERSION */}
      {formData.propertyId && selectedProperty && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Unit Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.unitIdentifier}
            onChange={(e) => setFormData({ ...formData, unitIdentifier: e.target.value })}
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
              errors.unitIdentifier ? "border-red-500" : "border-gray-300"
            }`}
          >
            <option value="">Select unit type</option>
            {enrichedUnitTypes
              ?.filter((unit) => {
                const isSelected = unit.uniqueType === initialData.unitIdentifier;
                return unit.quantity > 0 || isSelected;
              })
              .map((unit) => {
                const isSoldOut = unit.quantity <= 0 && unit.uniqueType !== initialData.unitIdentifier;

                return (
                  <option
                    key={unit.uniqueType}
                    value={unit.uniqueType}
                    disabled={isSoldOut}
                  >
                    {getUnitDisplayLabel(unit)}
                    {isSoldOut && " [Sold Out]"}
                  </option>
                );
              })}
          </select>
          {errors.unitIdentifier && (
            <p className="text-red-500 text-xs mt-1">{errors.unitIdentifier}</p>
          )}
        </div>
      )}

      {/* Selected Unit Summary */}
      {selectedUnitConfig && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
          <h4 className="font-semibold text-gray-800 mb-3">Selected Unit</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Type:</span>
              <p className="font-bold text-lg text-[#012a4a]">{selectedUnitConfig.type}</p>
            </div>
            <div>
              <span className="text-gray-600">Config:</span>
              <p className="font-bold text-lg text-[#012a4a]">
                {selectedUnitConfig.uniqueType.split("-").pop()}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Rent:</span>
              <p className="font-bold text-xl text-green-600">
                Ksh {selectedUnitConfig.price.toLocaleString()}/mo
              </p>
            </div>
            <div>
              <span className="text-gray-600">Deposit:</span>
              <p className="font-bold text-xl text-green-600">
                Ksh {selectedUnitConfig.deposit.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Available: {selectedUnitConfig.quantity} unit(s)
          </p>
        </div>
      )}

      {/* House Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          House / Unit Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.houseNumber}
          onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
          placeholder="e.g. A12, 101, Villa 5"
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
            errors.houseNumber ? "border-red-500" : "border-gray-300"
          }`}
        />
        {errors.houseNumber && <p className="text-red-500 text-xs mt-1">{errors.houseNumber}</p>}
      </div>

      {/* Lease Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lease Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.leaseStartDate}
            onChange={(e) => setFormData({ ...formData, leaseStartDate: e.target.value })}
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
              errors.leaseStartDate ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.leaseStartDate && <p className="text-red-500 text-xs mt-1">{errors.leaseStartDate}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lease End Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.leaseEndDate}
            onChange={(e) => setFormData({ ...formData, leaseEndDate: e.target.value })}
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#012a4a] transition ${
              errors.leaseEndDate ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.leaseEndDate && <p className="text-red-500 text-xs mt-1">{errors.leaseEndDate}</p>}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !selectedUnitConfig}
          className="px-8 py-2.5 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
        >
          {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>}
          {mode === "add" ? "Add Tenant" : "Update Tenant"}
        </button>
      </div>
    </form>
  );
}