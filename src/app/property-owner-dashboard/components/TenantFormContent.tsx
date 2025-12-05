// components/TenantFormContent.tsx
"use client";

import React, { useState, useEffect } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

interface TenantFormContentProps {
  mode: "add" | "edit";
  initialData: any;
  properties: any[];
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
  csrfToken,
  tenantsCount = 0,
}: TenantFormContentProps) {
  const [formData, setFormData] = useState({
    name: initialData.name || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    password: "",
    propertyId: initialData.propertyId || "",
    unitType: initialData.unitType || "",
    price: initialData.price?.toString() || "",
    deposit: initialData.deposit?.toString() || "",
    houseNumber: initialData.houseNumber || "",
    leaseStartDate: initialData.leaseStartDate || "",
    leaseEndDate: initialData.leaseEndDate || "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-fill price & deposit when unit type changes
  useEffect(() => {
    if (formData.propertyId && formData.unitType) {
      const property = properties.find(p => p._id === formData.propertyId);
      const unit = property?.unitTypes.find((u: any) => u.type === formData.unitType);
      if (unit) {
        setFormData(prev => ({
          ...prev,
          price: unit.price.toString(),
          deposit: unit.deposit.toString(),
        }));
      }
    }
  }, [formData.propertyId, formData.unitType, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.phone.trim()) newErrors.phone = "Phone is required";
    if (mode === "add" && !formData.password.trim()) newErrors.password = "Password is required";
    if (!formData.propertyId) newErrors.propertyId = "Property is required";
    if (!formData.unitType) newErrors.unitType = "Unit type is required";
    if (!formData.houseNumber.trim()) newErrors.houseNumber = "House number is required";
    if (!formData.leaseStartDate) newErrors.leaseStartDate = "Start date is required";
    if (!formData.leaseEndDate) newErrors.leaseEndDate = "End date is required";
    if (new Date(formData.leaseEndDate) <= new Date(formData.leaseStartDate))
      newErrors.leaseEndDate = "End date must be after start date";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({
      ...formData,
      price: parseFloat(formData.price) || 0,
      deposit: parseFloat(formData.deposit) || 0,
      password: formData.password || undefined,
    });
  };

  const selectedProperty = properties.find(p => p._id === formData.propertyId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name, Email, Phone */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Full Name</label>
        <input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`w-full border px-3 py-2 rounded-lg ${errors.name ? "border-red-500" : "border-gray-300"}`}
          required
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={`w-full border px-3 py-2 rounded-lg ${errors.email ? "border-red-500" : "border-gray-300"}`}
          required
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Phone</label>
        <input
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+2547..."
          className={`w-full border px-3 py-2 rounded-lg ${errors.phone ? "border-red-500" : "border-gray-300"}`}
          required
        />
        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
      </div>

      {mode === "add" && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={`w-full border px-3 py-2 rounded-lg ${errors.password ? "border-red-500" : "border-gray-300"}`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {/* Property & Unit Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Property</label>
        <select
          value={formData.propertyId}
          onChange={(e) => {
            setFormData({ ...formData, propertyId: e.target.value, unitType: "" });
            setErrors({});
          }}
          className={`w-full border px-3 py-2 rounded-lg ${errors.propertyId ? "border-red-500" : "border-gray-300"}`}
        >
          <option value="">Select Property</option>
          {properties.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {formData.propertyId && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Unit Type</label>
          <select
            value={formData.unitType}
            onChange={(e) => setFormData({ ...formData, unitType: e.target.value })}
            className={`w-full border px-3 py-2 rounded-lg ${errors.unitType ? "border-red-500" : "border-gray-300"}`}
          >
            <option value="">Select Unit Type</option>
            {selectedProperty?.unitTypes.map((u: any) => (
              <option key={u.uniqueType} value={u.type}>
                {u.type} (Ksh {u.price.toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Price (Ksh)</label>
          <input value={formData.price} readOnly className="w-full border px-3 py-2 rounded-lg bg-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Deposit (Ksh)</label>
          <input value={formData.deposit} readOnly className="w-full border px-3 py-2 rounded-lg bg-gray-100" />
        </div>
      </div>

      {/* House Number, Dates */}
      <div>
        <label className="block text-sm font-medium text-gray-700">House Number</label>
        <input
          value={formData.houseNumber}
          onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
          className={`w-full border px-3 py-2 rounded-lg ${errors.houseNumber ? "border-red-500" : "border-gray-300"}`}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Lease Start</label>
          <input
            type="date"
            value={formData.leaseStartDate}
            onChange={(e) => setFormData({ ...formData, leaseStartDate: e.target.value })}
            className={`w-full border px-3 py-2 rounded-lg ${errors.leaseStartDate ? "border-red-500" : "border-gray-300"}`}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Lease End</label>
          <input
            type="date"
            value={formData.leaseEndDate}
            onChange={(e) => setFormData({ ...formData, leaseEndDate: e.target.value })}
            className={`w-full border px-3 py-2 rounded-lg ${errors.leaseEndDate ? "border-red-500" : "border-gray-300"}`}
            required
          />
          {errors.leaseEndDate && <p className="text-red-500 text-xs mt-1">{errors.leaseEndDate}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] disabled:opacity-50"
        >
          {isLoading ? "Saving..." : mode === "add" ? "Add Tenant" : "Update Tenant"}
        </button>
      </div>
    </form>
  );
}