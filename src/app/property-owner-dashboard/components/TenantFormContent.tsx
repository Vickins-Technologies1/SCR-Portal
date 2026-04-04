// src/components/TenantFormContent.tsx
"use client";

import React, { useState, useEffect } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  available?: number;
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
    leaseStartDate: initialData.leaseStartDate?.split("T")[0] || "",
    leaseEndDate: initialData.leaseEndDate?.split("T")[0] || "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leaseUnits, setLeaseUnits] = useState<Array<{ unitIdentifier: string; houseNumber: string }>>(() => {
    if (Array.isArray(initialData.leasedUnits) && initialData.leasedUnits.length > 0) {
      return initialData.leasedUnits.map((unit: any) => ({
        unitIdentifier: unit.unitIdentifier || "",
        houseNumber: unit.houseNumber || "",
      }));
    }
    if (initialData.unitIdentifier || initialData.houseNumber) {
      return [{
        unitIdentifier: initialData.unitIdentifier || "",
        houseNumber: initialData.houseNumber || "",
      }];
    }
    return [{ unitIdentifier: "", houseNumber: "" }];
  });

  const selectedProperty = properties.find((p) => p._id === formData.propertyId);

  // CRITICAL FIX: Generate uniqueType on the fly for old properties
  const enrichedUnitTypes = selectedProperty?.unitTypes.map((unit, index) => ({
    ...unit,
    uniqueType: unit.uniqueType || `${unit.type}-${index}`,
  }));

  const existingLeaseUnitIds = new Set(
    Array.isArray(initialData.leasedUnits) && initialData.leasedUnits.length > 0
      ? initialData.leasedUnits.map((unit: any) => unit.unitIdentifier)
      : [initialData.unitIdentifier].filter(Boolean)
  );

  // Reset unitIdentifier if property changes and current one no longer exists
  useEffect(() => {
    if (selectedProperty) {
      setLeaseUnits((prev) =>
        prev.map((unit) => {
          if (!unit.unitIdentifier) return unit;
          const exists = enrichedUnitTypes?.some((u) => u.uniqueType === unit.unitIdentifier);
          return exists ? unit : { ...unit, unitIdentifier: "" };
        })
      );
    }
  }, [formData.propertyId, selectedProperty, enrichedUnitTypes]);

  // Safe label generator
  type UnitWithUnique = UnitType & { uniqueType: string };
  const getAvailableCount = (unit?: UnitType) => {
    if (!unit) return 0;
    if (typeof unit.available === "number") return unit.available;
    return typeof unit.quantity === "number" ? unit.quantity : 0;
  };

  const getUnitDisplayLabel = (unit: UnitWithUnique): string => {
    const type = unit.type || "Unknown";
    const price = unit.price ?? 0;
    const deposit = unit.deposit ?? 0;
    const availableCount = getAvailableCount(unit);
    const uniqueType = unit.uniqueType || "unknown-0";

    const base = `${type} - Ksh ${price.toLocaleString()}/mo`;
    const depositText = deposit > 0 ? ` | Deposit: Ksh ${deposit.toLocaleString()}` : "";
    const availability = availableCount > 0 ? ` (${availableCount} available)` : " (Sold Out)";

    const sameTypeCount = selectedProperty?.unitTypes.filter((u) => u.type === type).length || 0;
    const configTag = sameTypeCount > 1
      ? ` [Config ${uniqueType.split("-").pop() || "0"}]`
      : "";

    return `${base}${depositText}${availability}${configTag}`;
  };

  const getUnitConfig = (unitIdentifier: string) =>
    enrichedUnitTypes?.find((unit) => unit.uniqueType === unitIdentifier);

  const totalRent = leaseUnits.reduce((sum, unit) => {
    const config = getUnitConfig(unit.unitIdentifier);
    return sum + (config?.price ?? 0);
  }, 0);

  const totalDeposit = leaseUnits.reduce((sum, unit) => {
    const config = getUnitConfig(unit.unitIdentifier);
    return sum + (config?.deposit ?? 0);
  }, 0);

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
    if (!leaseUnits.length) newErrors.leasedUnits = "At least one unit is required";

    const normalizedUnits = leaseUnits.map((unit) => ({
      unitIdentifier: unit.unitIdentifier.trim(),
      houseNumber: unit.houseNumber.trim(),
    }));

    normalizedUnits.forEach((unit, index) => {
      if (!unit.unitIdentifier) {
        newErrors[`leaseUnit_${index}`] = "Select a unit type";
      }
      if (!unit.houseNumber) {
        newErrors[`leaseUnit_${index}`] = newErrors[`leaseUnit_${index}`]
          ? `${newErrors[`leaseUnit_${index}`]} & house number`
          : "Enter a house number";
      }
      const config = getUnitConfig(unit.unitIdentifier);
      const availableCount = getAvailableCount(config);
      if (config && availableCount <= 0 && !existingLeaseUnitIds.has(unit.unitIdentifier)) {
        newErrors[`leaseUnit_${index}`] = "This unit is fully booked";
      }
    });

    const houseNumbers = normalizedUnits.map((unit) => unit.houseNumber.toLowerCase());
    if (houseNumbers.length !== new Set(houseNumbers).size) {
      newErrors.leasedUnits = "House numbers must be unique for this tenant";
    }
    if (!formData.leaseStartDate) newErrors.leaseStartDate = "Start date required";
    if (!formData.leaseEndDate) newErrors.leaseEndDate = "End date required";
    if (new Date(formData.leaseEndDate) <= new Date(formData.leaseStartDate))
      newErrors.leaseEndDate = "End date must be after start date";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const cleanedLeaseUnits = normalizedUnits.filter((unit) => unit.unitIdentifier || unit.houseNumber);
    const primaryLease = cleanedLeaseUnits[0];

    await onSubmit({
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      password: mode === "add" ? formData.password : undefined,
      propertyId: formData.propertyId,
      unitIdentifier: primaryLease?.unitIdentifier || "",
      houseNumber: primaryLease?.houseNumber || "",
      leasedUnits: cleanedLeaseUnits,
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
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
              className={`w-full px-4 py-2.5 pr-12 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
            setFormData({ ...formData, propertyId: e.target.value });
            setLeaseUnits([{ unitIdentifier: "", houseNumber: "" }]);
            setErrors((prev) => ({ ...prev, propertyId: "", leasedUnits: "" }));
          }}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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

      {/* Units Leased */}
      {formData.propertyId && selectedProperty && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Units Leased <span className="text-red-500">*</span>
          </label>

          <div className="space-y-4">
            {leaseUnits.map((unit, index) => {
              const config = getUnitConfig(unit.unitIdentifier);
              const availableCount = getAvailableCount(config);
              const isSoldOut = config
                ? availableCount <= 0 && !existingLeaseUnitIds.has(config.uniqueType)
                : false;

              return (
                <div
                  key={`${unit.unitIdentifier}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white/70 p-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Unit Type
                      </label>
                      <select
                        value={unit.unitIdentifier}
                        onChange={(e) =>
                          setLeaseUnits((prev) =>
                            prev.map((entry, i) =>
                              i === index ? { ...entry, unitIdentifier: e.target.value } : entry
                            )
                          )
                        }
                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
                          errors[`leaseUnit_${index}`] ? "border-red-500" : "border-gray-300"
                        }`}
                      >
                        <option value="">Select unit type</option>
                        {enrichedUnitTypes?.map((option) => {
                          const alreadySelected = leaseUnits.some(
                            (entry, i) => entry.unitIdentifier === option.uniqueType && i !== index
                          );
                          const optionAvailable = getAvailableCount(option);
                          const allowOption = optionAvailable > 0 || existingLeaseUnitIds.has(option.uniqueType) || alreadySelected;
                          return (
                            <option
                              key={option.uniqueType}
                              value={option.uniqueType}
                              disabled={!allowOption}
                            >
                              {getUnitDisplayLabel(option)}
                              {!allowOption && " [Sold Out]"}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        House / Unit Number
                      </label>
                      <input
                        type="text"
                        value={unit.houseNumber}
                        onChange={(e) =>
                          setLeaseUnits((prev) =>
                            prev.map((entry, i) =>
                              i === index ? { ...entry, houseNumber: e.target.value } : entry
                            )
                          )
                        }
                        placeholder="e.g. A12, 101"
                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
                          errors[`leaseUnit_${index}`] ? "border-red-500" : "border-gray-300"
                        }`}
                      />
                    </div>

                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">
                        Rent: Ksh {config?.price?.toLocaleString() || "—"}
                      </p>
                      <p>
                        Deposit: Ksh {config?.deposit?.toLocaleString() || "—"}
                      </p>
                      {config && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          {isSoldOut ? "Sold Out" : `${availableCount} available`}
                        </p>
                      )}
                    </div>
                  </div>

                  {errors[`leaseUnit_${index}`] && (
                    <p className="text-red-500 text-xs mt-2">{errors[`leaseUnit_${index}`]}</p>
                  )}

                  {leaseUnits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLeaseUnits((prev) => prev.filter((_, i) => i !== index))}
                      className="mt-3 text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Remove Unit
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {errors.leasedUnits && (
            <p className="text-red-500 text-xs mt-2">{errors.leasedUnits}</p>
          )}

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={() => setLeaseUnits((prev) => [...prev, { unitIdentifier: "", houseNumber: "" }])}
              className="text-sm font-semibold text-primary hover:text-primary-hover"
            >
              + Add another unit
            </button>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary">
              Total rent: Ksh {totalRent.toLocaleString()} • Total deposit: Ksh {totalDeposit.toLocaleString()}
            </div>
          </div>
        </div>
      )}

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
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/30 transition ${
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
          disabled={isLoading}
          className="px-8 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
        >
          {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>}
          {mode === "add" ? "Add Tenant" : "Update Tenant"}
        </button>
      </div>
    </form>
  );
}



