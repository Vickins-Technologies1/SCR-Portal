"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { readJsonResponse } from "@/lib/api-client";

export default function PayForAirbnbBookingButton({
  amount,
  phone,
  csrfToken,
  disabled,
  onSuccess,
}: {
  amount: number;
  phone?: string;
  csrfToken: string;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const pollStatus = async (checkoutRequestId: string) => {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statusRes = await fetch("/api/airbnb-tenant/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ transaction_request_id: checkoutRequestId }),
      });

      const statusData = await readJsonResponse<{ success?: boolean; status?: string; message?: string }>(
        statusRes,
        "Failed to check transaction status"
      );
      if (!statusRes.ok || !statusData.success) {
        throw new Error(statusData.message || "Failed to check transaction status");
      }

      const status = String(statusData.status || "initiated").toLowerCase();
      if (["initiated", "pending", "pending_stk"].includes(status)) {
        attempts += 1;
        continue;
      }

      return status;
    }

    return "timeout";
  };

  const handleClick = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/airbnb-tenant/payments/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          amount,
          phone: phone?.trim() || undefined,
        }),
      });

      const data = await readJsonResponse<{ success?: boolean; message?: string; checkoutRequestId?: string }>(
        res,
        "Payment initiation failed"
      );
      if (!res.ok || !data.success) {
        const message = data.message || "Payment initiation failed, try again";
        toast.error(message);
        setIsLoading(false);
        return;
      }

      toast.success(data.message || "STK Push initiated. Check your phone.");
      if (!data.checkoutRequestId) {
        throw new Error("Payment initiation failed");
      }

      const status = await pollStatus(data.checkoutRequestId);

      if (["completed", "successful", "success"].includes(status)) {
        toast.success("Payment completed successfully");
        onSuccess?.();
      } else if (["cancelled", "canceled"].includes(status)) {
        toast.error("Payment cancelled by user");
      } else if (status === "failed") {
        toast.error("Payment failed. Please check your balance.");
      } else if (status === "expired") {
        toast.error("Payment request expired.");
      } else {
        toast.error("Payment timed out. Please check again shortly.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment initiation failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className="w-full bg-primary text-white font-semibold px-6 py-3 rounded-2xl shadow-lg hover:bg-primary-hover transition-all duration-300 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
    >
      {isLoading ? "Processing..." : "Pay with M-Pesa"}
    </button>
  );
}
