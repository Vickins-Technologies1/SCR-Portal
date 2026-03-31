"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

interface UnitType {
  type: string;
  uniqueType?: string;
  price: number;
  deposit: number;
  quantity: number;
  managementType: "RentCollection" | "FullManagement";
  managementFee: number;
}

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
}

interface RentPriceOverride {
  _id: string;
  propertyId: string;
  unitType: string;
  unitIdentifier?: string;
  price: number;
  startDate: string;
  endDate: string;
  status?: "active" | "inactive";
}

interface PriceOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  csrfToken: string | null;
  canEdit: boolean;
}

const formatMonthRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const startLabel = start.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

export default function PriceOverrideModal({
  isOpen,
  onClose,
  property,
  csrfToken,
  canEdit,
}: PriceOverrideModalProps) {
  const [overrides, setOverrides] = useState<RentPriceOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitIdentifier, setUnitIdentifier] = useState("");
  const [price, setPrice] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const resetForm = () => {
    setUnitIdentifier("");
    setPrice("");
    setStartMonth("");
    setEndMonth("");
  };

  const unitTypeOptions = useMemo(() => {
    if (!property) return [];
    const counts = property.unitTypes.reduce<Record<string, number>>((acc, unit) => {
      const type = unit.type || "";
      if (!type) return acc;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const running: Record<string, number> = {};

    return property.unitTypes
      .map((unit, index) => {
        if (!unit.type) return null;
        const uniqueType = unit.uniqueType || `${unit.type}-${index}`;
        running[unit.type] = (running[unit.type] || 0) + 1;
        const groupLabel = counts[unit.type] > 1 ? ` (Group ${running[unit.type]})` : "";
        const priceLabel =
          typeof unit.price === "number" ? `Ksh ${unit.price.toLocaleString()}/mo` : "";
        const quantityLabel =
          typeof unit.quantity === "number"
            ? `${unit.quantity} unit${unit.quantity === 1 ? "" : "s"}`
            : "";
        const details = [priceLabel, quantityLabel].filter(Boolean).join(" • ");
        const baseLabel = `${unit.type}${groupLabel}`;
        return {
          value: uniqueType,
          type: unit.type,
          label: details ? `${baseLabel} — ${details}` : baseLabel,
        };
      })
      .filter((option): option is { value: string; type: string; label: string } => Boolean(option?.type));
  }, [property]);

  const unitTypeLabelMap = useMemo(() => {
    return new Map(unitTypeOptions.map((option) => [option.value, option.label]));
  }, [unitTypeOptions]);

  const selectedUnit = useMemo(
    () => unitTypeOptions.find((option) => option.value === unitIdentifier) || null,
    [unitIdentifier, unitTypeOptions]
  );

  const fetchOverrides = async () => {
    if (!property) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rent-price-overrides?propertyId=${encodeURIComponent(property._id)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setOverrides(data.overrides || []);
      } else {
        setError(data.message || "Failed to fetch price overrides.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOverrides();
    }
  }, [isOpen, property?._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;
    if (!canEdit) {
      setError("You do not have permission to schedule price changes.");
      return;
    }
    if (!selectedUnit || !price || !startMonth || !endMonth) {
      setError("All fields are required.");
      return;
    }
    if (startMonth > endMonth) {
      setError("Start month must be before or equal to end month.");
      return;
    }

    const startDate = `${startMonth}-01`;
    const endDate = `${endMonth}-01`;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rent-price-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          propertyId: property._id,
          unitType: selectedUnit.type,
          unitIdentifier: selectedUnit.value,
          price: Number(price),
          startDate,
          endDate,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to create price override.");
        return;
      }
      resetForm();
      await fetchOverrides();
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (overrideId: string) => {
    if (!canEdit) {
      setError("You do not have permission to cancel overrides.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rent-price-overrides/${overrideId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to cancel override.");
        return;
      }
      await fetchOverrides();
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title={property ? `Schedule Price Changes - ${property.name}` : "Schedule Price Changes"}
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        setError(null);
        onClose();
      }}
    >
      {!property ? (
        <p className="text-sm text-muted-foreground">No property selected.</p>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Unit Type
              <select
                value={unitIdentifier}
                onChange={(e) => setUnitIdentifier(e.target.value)}
                className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
                disabled={!canEdit || isLoading}
              >
                <option value="">Select unit type</option>
                {unitTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              New Monthly Price (Ksh)
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
                disabled={!canEdit || isLoading}
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Start Month
              <input
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                type="month"
                className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
                disabled={!canEdit || isLoading}
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              End Month
              <input
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                type="month"
                className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
                disabled={!canEdit || isLoading}
              />
            </label>

            <div className="sm:col-span-2 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setError(null);
                  onClose();
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={!canEdit || isLoading || !csrfToken}
                className={`px-4 py-2 text-white rounded-lg transition text-sm ${!canEdit || isLoading || !csrfToken ? "bg-gray-400 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"}`}
              >
                {isLoading ? "Saving..." : "Schedule Price Change"}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Upcoming & Active Changes</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading overrides...</p>
            ) : overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled price changes for this property yet.</p>
            ) : (
              <div className="space-y-2">
                {overrides.map((override) => (
                  <div
                    key={override._id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {override.unitIdentifier
                          ? unitTypeLabelMap.get(override.unitIdentifier) ||
                            `${override.unitType} (${override.unitIdentifier})`
                          : override.unitType}{" "}
                        • Ksh {override.price.toLocaleString()}/mo
                      </p>
                      <p className="text-xs text-muted-foreground">{formatMonthRange(override.startDate, override.endDate)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(override._id)}
                      disabled={!canEdit || isLoading}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
