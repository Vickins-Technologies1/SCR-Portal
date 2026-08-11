"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { readJsonResponse } from "@/lib/api-client";

interface PropertyUtility {
  id: string;
  name: string;
  billingMode: "fixed" | "metered";
  amount: number;
  unitLabel?: string;
  active?: boolean;
}

interface UtilityCharge {
  _id: string;
  utilityName: string;
  billingPeriod: string;
  unitsUsed: number;
  ratePerUnit: number;
  amount: number;
}

interface UtilityUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: { _id: string; name: string } | null;
  property: { _id: string; name: string; utilities?: PropertyUtility[] } | null;
  csrfToken: string | null;
  onSaved: () => Promise<void>;
}

const currentBillingPeriod = () => new Date().toISOString().slice(0, 7);

export default function UtilityUsageModal({
  isOpen,
  onClose,
  tenant,
  property,
  csrfToken,
  onSaved,
}: UtilityUsageModalProps) {
  const meteredUtilities = useMemo(
    () => (property?.utilities || []).filter((utility) => utility.billingMode === "metered" && utility.active !== false),
    [property?.utilities]
  );
  const [utilityId, setUtilityId] = useState("");
  const [billingPeriod, setBillingPeriod] = useState(currentBillingPeriod());
  const [previousReading, setPreviousReading] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [unitsUsed, setUnitsUsed] = useState("");
  const [charges, setCharges] = useState<UtilityCharge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingChargeId, setDeletingChargeId] = useState<string | null>(null);

  const selectedUtility = meteredUtilities.find((utility) => utility.id === utilityId);
  const calculatedUnits =
    previousReading !== "" && currentReading !== ""
      ? Math.max(0, Number(currentReading) - Number(previousReading))
      : Number(unitsUsed || 0);
  const estimatedAmount = selectedUtility ? Math.round(calculatedUnits * Number(selectedUtility.amount || 0)) : 0;

  const fetchCharges = useCallback(async () => {
    if (!isOpen || !tenant?._id || !csrfToken) return;
    try {
      const res = await fetch(`/api/utility-charges?tenantId=${tenant._id}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await readJsonResponse<{ success?: boolean; charges?: UtilityCharge[]; message?: string }>(
        res,
        "Failed to load utility readings."
      );
      setCharges(data.success ? data.charges || [] : []);
    } catch {
      setCharges([]);
    }
  }, [isOpen, tenant?._id, csrfToken]);

  useEffect(() => {
    if (isOpen) {
      setUtilityId(meteredUtilities[0]?.id || "");
      setBillingPeriod(currentBillingPeriod());
      setPreviousReading("");
      setCurrentReading("");
      setUnitsUsed("");
      setError(null);
      setDeletingChargeId(null);
    }
  }, [isOpen, meteredUtilities]);

  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?._id || !csrfToken) return;
    if (!utilityId) {
      setError("Select a metered utility first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/utility-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          tenantId: tenant._id,
          utilityId,
          billingPeriod,
          previousReading: previousReading || null,
          currentReading: currentReading || null,
          unitsUsed: previousReading && currentReading ? null : unitsUsed,
          csrfToken,
        }),
      });
      const data = await readJsonResponse<{ success?: boolean; message?: string }>(
        res,
        "Failed to record utility usage."
      );
      if (!data.success) {
        setError(data.message || "Failed to record utility usage.");
        return;
      }
      await onSaved();
      await fetchCharges();
      onClose();
    } catch {
      setError("Network error while recording utility usage.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCharge = async (chargeId: string) => {
    if (!csrfToken || !tenant?._id) return;
    const confirmed = window.confirm("Delete this utility reading? This will recalculate the tenant balance.");
    if (!confirmed) return;

    setDeletingChargeId(chargeId);
    setError(null);
    try {
      const res = await fetch(`/api/utility-charges/${chargeId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await readJsonResponse<{ success?: boolean; message?: string }>(
        res,
        "Failed to delete utility reading."
      );

      if (!res.ok || !data.success) {
        setError(data.message || "Failed to delete utility reading.");
        return;
      }

      await onSaved();
      await fetchCharges();
    } catch {
      setError("Network error while deleting utility reading.");
    } finally {
      setDeletingChargeId(null);
    }
  };

  return (
    <Modal title="Record Utility Usage" isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="surface-card rounded-2xl p-4">
          <p className="text-xs sm:text-sm font-semibold text-primary">
            {tenant?.name || "Tenant"} at {property?.name || "Property"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Metered usage is added to the tenant&apos;s utility dues for the selected month.
          </p>
        </div>

        {meteredUtilities.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-800">
            This property has no metered utilities. Add water or electricity as metered utilities in the property setup first.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Utility</label>
              <select
                value={utilityId}
                onChange={(e) => setUtilityId(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 border border-border rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
              >
                {meteredUtilities.map((utility) => (
                  <option key={utility.id} value={utility.id}>
                    {utility.name} - Ksh {Number(utility.amount || 0).toLocaleString()} / {utility.unitLabel || "unit"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Billing Month</label>
              <input
                type="month"
                value={billingPeriod}
                max={currentBillingPeriod()}
                onChange={(e) => setBillingPeriod(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 border border-border rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Previous Reading</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={previousReading}
                  onChange={(e) => {
                    setPreviousReading(e.target.value);
                    if (e.target.value) setUnitsUsed("");
                  }}
                  className="w-full px-4 py-2.5 sm:py-3 border border-border rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Current Reading</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentReading}
                  onChange={(e) => {
                    setCurrentReading(e.target.value);
                    if (e.target.value) setUnitsUsed("");
                  }}
                  className="w-full px-4 py-2.5 sm:py-3 border border-border rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Units Used</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={previousReading || currentReading ? String(calculatedUnits || "") : unitsUsed}
                onChange={(e) => setUnitsUsed(e.target.value)}
                disabled={Boolean(previousReading || currentReading)}
                className="w-full px-4 py-2.5 sm:py-3 border border-border rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none disabled:bg-muted disabled:text-muted-foreground"
                placeholder="Enter units directly"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Estimated charge: Ksh {estimatedAmount.toLocaleString()}
              </p>
            </div>
          </>
        )}

        {charges.length > 0 && (
          <div className="rounded-2xl border border-border bg-muted/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent Usage</p>
            <div className="mt-3 space-y-2">
              {charges.slice(0, 4).map((charge) => (
                <div key={charge._id} className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{charge.billingPeriod} - {charge.utilityName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {Number(charge.unitsUsed || 0).toLocaleString()} unit(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-primary">Ksh {charge.amount.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCharge(charge._id)}
                      disabled={deletingChargeId === charge._id}
                      className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingChargeId === charge._id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border/70">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white/80 text-foreground border border-border rounded-xl hover:bg-white transition text-xs sm:text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || meteredUtilities.length === 0}
            className="px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover transition font-semibold disabled:opacity-60 text-xs sm:text-sm"
          >
            {isLoading ? "Saving..." : "Save Usage"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
