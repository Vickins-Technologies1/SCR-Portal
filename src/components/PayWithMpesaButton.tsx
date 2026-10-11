// src/components/PayWithMpesaButton.tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { readJsonResponse } from "@/lib/api-client";

type PaymentType = "Rent" | "Utility" | "Deposit" | "Other";
type PaymentProgressPhase =
  | "initiating"
  | "waiting_for_pin"
  | "checking"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "review"
  | "pending";

export interface PaymentProgress {
  phase: PaymentProgressPhase;
  message: string;
}

const STATUS_POLL_INTERVAL_MS = 3000;
const FIRST_STATUS_POLL_DELAY_MS = 2500;
const STATUS_POLL_TIMEOUT_MS = 3 * 60 * 1000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PayWithMpesaButtonProps {
  amount: number;
  phone: string;
  invoiceId?: string;
  landlordId: string;
  tenantId: string;
  propertyId: string;
  csrfToken: string;
  type?: PaymentType;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void | Promise<void>;
  onError?: (message: string) => void;
  onPending?: (message: string) => void;
  onProgress?: (progress: PaymentProgress) => void;
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
  disabled,
  className,
  onSuccess,
  onError,
  onPending,
  onProgress,
  onStart,
}: PayWithMpesaButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Processing...");

  const reportProgress = (progress: PaymentProgress) => {
    const labels: Record<PaymentProgressPhase, string> = {
      initiating: "Starting...",
      waiting_for_pin: "Waiting for PIN...",
      checking: "Verifying payment...",
      processing: "Finalizing payment...",
      completed: "Payment completed",
      failed: "Payment failed",
      cancelled: "Payment cancelled",
      expired: "Payment expired",
      review: "Payment under review",
      pending: "Still verifying...",
    };
    setLoadingLabel(labels[progress.phase]);
    onProgress?.(progress);
  };

  const pollStatus = async (checkoutRequestId: string) => {
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
    let firstAttempt = true;

    while (Date.now() < deadline) {
      await wait(firstAttempt ? FIRST_STATUS_POLL_DELAY_MS : STATUS_POLL_INTERVAL_MS);
      firstAttempt = false;
      reportProgress({ phase: "checking", message: "Checking M-Pesa confirmation..." });

      let statusRes: Response;
      try {
        statusRes = await fetch("/api/tenant/payments/check-status", {
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
      } catch {
        reportProgress({ phase: "checking", message: "The status check was delayed. Retrying..." });
        continue;
      }

      const statusData = await readJsonResponse<{
        success?: boolean;
        status?: string;
        message?: string;
        transaction?: { resultDesc?: string | null };
      }>(
        statusRes,
        "Failed to check transaction status"
      );
      if (!statusRes.ok || !statusData.success) {
        // The callback and the payment insert can race on separate serverless
        // instances. Keep checking while the payment row and callback settle.
        const retryable = statusRes.status === 404 || statusRes.status === 408 || statusRes.status === 409 || statusRes.status === 429 || statusRes.status >= 500;
        if (retryable && Date.now() < deadline) {
          reportProgress({ phase: "checking", message: "Waiting for the payment confirmation to arrive..." });
          continue;
        }
        throw new Error(statusData.message || "Failed to check transaction status");
      }

      const status = String(statusData.status || "initiated").toLowerCase();
      if (["initiated", "pending", "pending_stk"].includes(status)) {
        reportProgress({ phase: "waiting_for_pin", message: "STK prompt sent. Complete the payment on your phone..." });
        continue;
      }
      if (status === "processing") {
        reportProgress({ phase: "processing", message: "Payment received. Finalizing your payment..." });
        continue;
      }

      return {
        status,
        message: statusData.transaction?.resultDesc || "",
      };
    }

    return { status: "pending", message: "Payment is still being verified. Your payment request remains open and we will not start another one." };
  };

  const handleClick = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    reportProgress({ phase: "initiating", message: "Sending the payment request to Safaricom..." });
    let paymentInitiated = false;

    try {
      const res = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          amount,
          phone,
          ...(invoiceId ? { invoiceId } : {}),
          landlordId,
          type,
        }),
      });

      const data = await readJsonResponse<{ success?: boolean; message?: string; checkoutRequestId?: string }>(
        res,
        "Payment initiation failed"
      );
      if (!res.ok || !data.success) {
        const message = data.message || "Payment initiation failed, try again";
        toast.error(message);
        onError?.(message);
        setIsLoading(false);
        return;
      }

      if (!data.checkoutRequestId) {
        throw new Error("Payment initiation failed");
      }

      paymentInitiated = true;
      onStart?.();
      reportProgress({ phase: "waiting_for_pin", message: "STK prompt sent. Enter your M-Pesa PIN on your phone." });
      toast.success(data.message || "STK Push initiated. Check your phone.");

      const result = await pollStatus(data.checkoutRequestId);
      const status = result.status;
      if (["completed", "successful", "success"].includes(status)) {
        reportProgress({ phase: "completed", message: "Payment completed successfully." });
        toast.success("Payment completed successfully");
        await onSuccess?.();
      } else if (["cancelled", "canceled"].includes(status)) {
        reportProgress({ phase: "cancelled", message: "Payment cancelled by user." });
        toast.error("Payment cancelled by user");
        onError?.("Payment cancelled by user");
      } else if (status === "failed") {
        const failureMessage = result.message || "Payment failed. Please try again.";
        reportProgress({ phase: "failed", message: failureMessage });
        toast.error(failureMessage);
        onError?.(failureMessage);
      } else if (status === "expired") {
        reportProgress({ phase: "expired", message: "Payment request expired." });
        toast.error("Payment request expired.");
        onError?.("Payment request expired.");
      } else if (status === "review") {
        const reviewMessage = result.message || "Payment was received but needs reconciliation. Please contact support.";
        reportProgress({ phase: "review", message: reviewMessage });
        toast.error(reviewMessage);
        onError?.(reviewMessage);
      } else {
        const pendingMessage = result.message || "Payment is still being verified. You can safely refresh this page shortly.";
        reportProgress({ phase: "pending", message: pendingMessage });
        toast(pendingMessage, { icon: "⏳" });
        if (onPending) onPending(pendingMessage);
        else onError?.(pendingMessage);
      }
    } catch (error) {
      if (paymentInitiated) {
        const message = "We could not verify the final status yet. Your payment remains pending; please keep this page open and check your payment history shortly.";
        reportProgress({ phase: "pending", message });
        toast(message, { icon: "⏳" });
        if (onPending) onPending(message);
        else onError?.(message);
      } else {
        const message = error instanceof Error ? error.message : "Payment initiation failed";
        reportProgress({ phase: "failed", message });
        toast.error(message);
        onError?.(message);
      }
    } finally {
      setIsLoading(false);
      setLoadingLabel("Processing...");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={
        className ||
        "w-full bg-primary text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:bg-primary-hover transition-all duration-300 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
      }
    >
      {isLoading ? loadingLabel : "Pay with M-Pesa"}
    </button>
  );
}
