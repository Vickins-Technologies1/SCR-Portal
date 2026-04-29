"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

type TenantRentOverride = {
  _id: string;
  price: number;
  startDate: string;
  endDate: string;
  status?: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
};

interface TenantRentOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  csrfToken: string | null;
  getCsrfToken: () => Promise<string | null>;
  canEdit: boolean;
  onUpdated: () => Promise<void> | void;
}

const formatMonthRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const startLabel = start.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

export default function TenantRentOverrideModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
  csrfToken,
  getCsrfToken,
  canEdit,
  onUpdated,
}: TenantRentOverrideModalProps) {
  const [overrides, setOverrides] = useState<TenantRentOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [price, setPrice] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const activeOverrides = useMemo(
    () => overrides.filter((override) => override.status !== "inactive"),
    [overrides]
  );

  const ensureToken = async () => csrfToken || (await getCsrfToken());

  const resetForm = () => {
    setPrice("");
    setStartMonth("");
    setEndMonth("");
  };

  const fetchOverrides = async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await ensureToken();
      if (!token) {
        setError("Missing CSRF token. Refresh and try again.");
        return;
      }
      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/rent-overrides`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setOverrides(data.overrides || []);
      } else {
        setError(data.message || "Failed to fetch rent overrides.");
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
  }, [isOpen, tenantId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) {
      setError("You do not have permission to override rent for this tenant.");
      return;
    }

    if (!price || !startMonth || !endMonth) {
      setError("All fields are required.");
      return;
    }
    if (startMonth > endMonth) {
      setError("Start month must be before or equal to end month.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await ensureToken();
      if (!token) {
        setError("Missing CSRF token. Refresh and try again.");
        return;
      }

      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/rent-overrides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
        body: JSON.stringify({
          price: Number(price),
          startDate: `${startMonth}-01`,
          endDate: `${endMonth}-01`,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to create rent override.");
        return;
      }

      resetForm();
      await fetchOverrides();
      await onUpdated();
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (overrideId: string) => {
    if (!canEdit) {
      setError("You do not have permission to cancel overrides.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await ensureToken();
      if (!token) {
        setError("Missing CSRF token. Refresh and try again.");
        return;
      }

      const res = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/rent-overrides/${encodeURIComponent(overrideId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": token,
          },
          credentials: "include",
        }
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to cancel override.");
        return;
      }
      await fetchOverrides();
      await onUpdated();
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title={`Override Rent - ${tenantName}`}
      isOpen={isOpen}
      onClose={() => {
        setError(null);
        resetForm();
        onClose();
      }}
      className="max-w-3xl"
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="rounded-2xl bg-muted/60 p-4 text-xs sm:text-sm text-muted-foreground">
          This temporarily replaces the expected monthly rent for this tenant only, for the selected months.
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-gray-700 sm:col-span-1">
            Monthly rent (Ksh)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
              placeholder="e.g. 25000"
              disabled={!canEdit || isLoading}
            />
          </label>

          <label className="text-sm font-medium text-gray-700 sm:col-span-1">
            Start month
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
              disabled={!canEdit || isLoading}
            />
          </label>

          <label className="text-sm font-medium text-gray-700 sm:col-span-1">
            End month
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition border-gray-300 text-sm"
              disabled={!canEdit || isLoading}
            />
          </label>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={!canEdit || isLoading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "Saving…" : "Save override"}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Scheduled Overrides</h4>
            <span className="text-xs text-muted-foreground">{activeOverrides.length} active</span>
          </div>

          {isLoading && overrides.length === 0 ? (
            <div className="surface-card rounded-xl p-4 animate-pulse h-16" />
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides scheduled for this tenant.</p>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
              {overrides.map((override) => {
                const isInactive = override.status === "inactive";
                return (
                  <div
                    key={override._id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-white/70"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Ksh {Number(override.price || 0).toLocaleString()} / mo
                        {isInactive ? (
                          <span className="ml-2 text-[11px] font-semibold text-muted-foreground">(Cancelled)</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatMonthRange(override.startDate, override.endDate)}
                      </p>
                    </div>

                    {!isInactive && canEdit ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(override._id)}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:border-red-300 hover:text-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

