// src/components/PayWithMpesaButton.tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";

type PaymentType = "Rent" | "Utility" | "Deposit" | "Other";

interface PayWithMpesaButtonProps {
  amount: number;
  phone: string;
  invoiceId: string;
  landlordId: string;
  tenantId: string;
  propertyId: string;
  csrfToken: string;
  type?: PaymentType;
  shortcode?: string | null;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  onStart?: () => void;
}

export default function PayWithMpesaButton({
  amount,
  phone,
  invoiceId,
  landlordId,
  tenantId,
  propertyId,
  csrfToken,
  type = "Rent",
  shortcode,
  disabled,
  className,
  onSuccess,
  onError,
  onStart,
}: PayWithMpesaButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const pollStatus = async (checkoutRequestId: string) => {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statusRes = await fetch("/api/tenant/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          transaction_request_id: checkoutRequestId,
          tenantId,
          propertyId,
          csrfToken,
        }),
      });

      const statusData = await statusRes.json();
      if (!statusRes.ok || !statusData.success) {
        throw new Error(statusData.message || "Failed to check transaction status");
      }

      const status = String(statusData.status || "pending");
      if (status === "pending") {
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
      const res = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          amount,
          phone,
          invoiceId,
          landlordId,
          type,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const message = data.message || "Payment initiation failed, try again";
        toast.error(message);
        onError?.(message);
        setIsLoading(false);
        return;
      }

      toast.success(data.message || "STK Push initiated. Check your phone.");
      onStart?.();

      const status = await pollStatus(data.checkoutRequestId);
      if (status === "completed") {
        toast.success("Payment completed successfully");
        onSuccess?.();
      } else if (status === "cancelled") {
        toast.error("Payment cancelled by user");
        onError?.("Payment cancelled by user");
      } else if (status === "failed") {
        toast.error("Payment failed. Please check your balance.");
        onError?.("Payment failed. Please check your balance.");
      } else {
        toast.error("Payment timed out. Please check again shortly.");
        onError?.("Payment timed out. Please check again shortly.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment initiation failed";
      toast.error(message);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={
          className ||
          "w-full bg-primary text-white font-semibold px-6 py-3 rounded-full shadow-lg hover:bg-primary-hover transition-all duration-300 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
        }
      >
        {isLoading ? "Processing..." : "Pay Now"}
      </button>

      {shortcode ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-gray-700">
          <p className="font-semibold text-primary">Manual Paybill/Till Option</p>
          <p>Paybill/Till: <span className="font-mono">{shortcode}</span></p>
          <p>Reference: <span className="font-mono">INV-{invoiceId}</span></p>
        </div>
      ) : null}
    </div>
  );
}
