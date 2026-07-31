"use client";

import React, { useState, useCallback, useEffect } from "react";
import Modal from "./Modal";
import Cookies from "js-cookie";

// Define ClientProperty interface to match TenantsPage
interface ClientProperty {
  _id: string;
  name: string;
  address: string;
  unitTypes: {
    uniqueType: string;
    type: string;
    price: number;
    deposit: number;
    managementType: "RentCollection" | "FullManagement";
    quantity: number;
  }[];
  managementFee?: number;
  createdAt: string;
  updatedAt?: string;
  rentPaymentDate?: string | number;
  ownerId: string | { toString?: () => string };
  status: string;
}

// Define UnitType interface for consistency
interface UnitType {
  uniqueType: string;
  type: string;
  price: number;
  deposit: number;
  managementType: "RentCollection" | "FullManagement";
  quantity: number;
}

interface Invoice {
  _id: string;
  userId: string;
  propertyId: string;
  unitType: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  description: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  properties: ClientProperty[]; // Changed from Property[] to ClientProperty[]
  initialPropertyId?: string;
  initialPhone?: string;
  userId: string | null;
  billingPlan?: string;
}

type PaymentRail = "legacy_mpesa" | "shared_daraja" | "user_paybill";

type OwnerDarajaIntegrationState = {
  shared: {
    enabled: boolean;
    paymentType: "till" | "paybill";
    destinationNumber: string;
    hasDestinationNumber: boolean;
  };
  userPaybill: {
    enabled: boolean;
    environment: "sandbox" | "production";
    shortcode: string;
    hasCredentials: boolean;
  };
};

export default function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  properties,
  initialPropertyId = "",
  initialPhone = "",
  userId,
  billingPlan,
}: PaymentModalProps) {
  const dashboardBasePath =
    Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
  const [paymentPropertyId, setPaymentPropertyId] = useState(initialPropertyId);
  const [paymentPhone, setPaymentPhone] = useState(initialPhone);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentFormErrors, setPaymentFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentLoadingModalOpen, setIsPaymentLoadingModalOpen] = useState(false);
  const [isFetchingAmount, setIsFetchingAmount] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("Processing your payment. Please wait...");
  const [ownerDarajaLoading, setOwnerDarajaLoading] = useState(false);
  const [ownerDarajaConfig, setOwnerDarajaConfig] = useState<OwnerDarajaIntegrationState | null>(null);
  const [paymentRail, setPaymentRail] = useState<PaymentRail>("legacy_mpesa");

  useEffect(() => {
    if (isOpen) {
      const fetchCsrfToken = async () => {
        try {
          const response = await fetch("/api/csrf-token");
          const data = await response.json();
          if (data.success && data.csrfToken) {
            console.log("Fetched CSRF token:", data.csrfToken);
            setCsrfToken(data.csrfToken);
          } else {
            console.error("Failed to fetch CSRF token:", data.message);
            onError("Failed to fetch CSRF token");
          }
        } catch (error) {
          console.error("Error fetching CSRF token:", error);
          onError("Failed to fetch CSRF token");
        }
      };

      const fetchOwnerDarajaConfig = async () => {
        setOwnerDarajaLoading(true);
        try {
          const response = await fetch("/api/owner/daraja", { credentials: "include" });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data?.success) {
            setOwnerDarajaConfig(null);
            setPaymentRail("legacy_mpesa");
            return;
          }

          const nextShared = data.integrations?.daraja?.shared || {};
          const nextUserPaybill = data.integrations?.daraja?.userPaybill || {};
          const sharedAvailable = nextShared.enabled !== false && !!nextShared.hasDestinationNumber;
          const userPaybillAvailable = nextUserPaybill.enabled !== false && !!nextUserPaybill.hasCredentials;

          setOwnerDarajaConfig({
            shared: {
              enabled: nextShared.enabled !== false,
              paymentType: nextShared.paymentType === "till" ? "till" : "paybill",
              destinationNumber: nextShared.destinationNumber || "",
              hasDestinationNumber: !!nextShared.hasDestinationNumber,
            },
            userPaybill: {
              enabled: nextUserPaybill.enabled !== false,
              environment: nextUserPaybill.environment === "production" ? "production" : "sandbox",
              shortcode: nextUserPaybill.shortcode || "",
              hasCredentials: !!nextUserPaybill.hasCredentials,
            },
          });

          if (sharedAvailable) {
            setPaymentRail((prev) => (prev === "legacy_mpesa" || prev === "shared_daraja" ? "shared_daraja" : prev));
          } else if (userPaybillAvailable) {
            setPaymentRail((prev) => (prev === "legacy_mpesa" || prev === "user_paybill" ? "user_paybill" : prev));
          } else {
            setPaymentRail("legacy_mpesa");
          }
        } catch {
          setOwnerDarajaConfig(null);
          setPaymentRail("legacy_mpesa");
        } finally {
          setOwnerDarajaLoading(false);
        }
      };

      fetchCsrfToken();
      fetchOwnerDarajaConfig();
    }
  }, [isOpen, onError]);

  const resetPaymentForm = useCallback(() => {
    setPaymentPropertyId(initialPropertyId);
    setPaymentPhone(initialPhone);
    setPaymentAmount("");
    setPaymentFormErrors({});
    setIsFetchingAmount(false);
    setStatusMessage("Processing your payment. Please wait...");
    setPaymentRail("legacy_mpesa");
  }, [initialPropertyId, initialPhone]);

  const validatePaymentForm = useCallback(
    async () => {
      const errors: { [key: string]: string | undefined } = {};
      if (!paymentPropertyId) {
        errors.paymentPropertyId = "Property is required";
      }
      if (!paymentPhone || !/^\+?\d{10,15}$/.test(paymentPhone)) {
        errors.paymentPhone = "Valid phone number is required (10-15 digits, optional +)";
      }
      if (paymentPropertyId && userId && csrfToken) {
        setIsFetchingAmount(true);
        try {
          const billingPlanParam = billingPlan ? `&billingPlan=${encodeURIComponent(billingPlan)}` : "";
          const url = `/api/invoices?userId=${encodeURIComponent(userId)}&propertyId=${encodeURIComponent(paymentPropertyId)}&unitType=All%20Units${billingPlanParam}`;
          const invoiceRes = await fetch(url, {
            headers: { "X-CSRF-Token": csrfToken },
          });
          const invoiceData = await invoiceRes.json();
          console.log("Invoice fetch response:", { userId, paymentPropertyId, invoiceData });

          if (!invoiceRes.ok || !invoiceData.success) {
            errors.paymentInvoice = invoiceData.message || "Failed to verify invoice status";
            setPaymentAmount("");
          } else if (invoiceData.status !== "pending") {
            errors.paymentInvoice = invoiceData.status
              ? `Invoice is already ${invoiceData.status}`
              : `No pending invoice found for selected property`;
            setPaymentAmount("");
          } else if (!invoiceData.invoices?.[0]) {
            errors.paymentInvoice = `No invoice details found for selected property`;
            setPaymentAmount("");
          } else {
            setPaymentAmount(invoiceData.invoices[0].amount.toString());
          }
        } catch (error) {
          console.error("Error fetching invoice:", error);
          errors.paymentInvoice = "Failed to connect to invoice API";
          setPaymentAmount("");
        } finally {
          setIsFetchingAmount(false);
        }
      } else {
        setPaymentAmount("");
        if (!csrfToken) {
          errors.paymentInvoice = "CSRF token is missing";
        }
      }
      setPaymentFormErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [paymentPropertyId, paymentPhone, userId, csrfToken, billingPlan]
  );

  useEffect(() => {
    if (paymentPropertyId && userId && csrfToken) {
      validatePaymentForm();
    } else {
      setPaymentAmount("");
      setPaymentFormErrors((prev) => ({ ...prev, paymentInvoice: csrfToken ? undefined : "CSRF token is missing" }));
    }
  }, [paymentPropertyId, userId, csrfToken, validatePaymentForm]);

  const pollTransactionStatus = useCallback(
    async (
      transactionRequestId: string,
      invoice: Invoice,
      options?: {
        maxAttempts?: number;
        interval?: number;
        statusEndpoint?: "/api/transaction-status" | "/api/owner/daraja/status";
      }
    ) => {
      const maxAttempts = options?.maxAttempts ?? 6;
      const interval = options?.interval ?? 5000;
      const statusEndpoint = options?.statusEndpoint ?? "/api/transaction-status";
      let attempts = 0;
      const checkStatus = async (): Promise<boolean> => {
        try {
          if (!csrfToken) {
            throw new Error("CSRF token is missing");
          }
          const requestBody =
            statusEndpoint === "/api/owner/daraja/status"
              ? { checkoutRequestId: transactionRequestId }
              : { transactionRequestId };

          const statusRes = await fetch(statusEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify(requestBody),
          });
          const statusData = await statusRes.json();

          if (!statusRes.ok || !statusData.success) {
            throw new Error(statusData.message || `HTTP error! Status: ${statusRes.status}`);
          }

          const normalized = String(statusData.TransactionStatus || statusData.status || "").toLowerCase();

          if (normalized === "pending" || normalized === "pending_stk") {
            setStatusMessage("Transaction pending, please complete the payment on your phone.");
            return false;
          }

          if (normalized === "completed") {
            try {
              const updateRes = await fetch("/api/invoices", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": csrfToken,
                },
                body: JSON.stringify({
                  userId,
                  propertyId: paymentPropertyId,
                  unitType: "All Units",
                  amount: invoice.amount,
                  status: "completed",
                  reference: invoice.reference,
                  description: invoice.description,
                  billingPlan,
                }),
              });
              const updateData = await updateRes.json();
              if (!updateRes.ok || !updateData.success) {
                throw new Error(updateData.message || "Failed to update invoice status");
              }
              setStatusMessage("Payment successful!");
              onSuccess();
              await new Promise((resolve) => setTimeout(resolve, 2000));
              setIsPaymentLoadingModalOpen(false);
              setIsLoading(false);
              return true;
            } catch (error) {
              setStatusMessage("Failed to update invoice status.");
              onError(error instanceof Error ? error.message : "Failed to update invoice status");
              await new Promise((resolve) => setTimeout(resolve, 2000));
              setIsPaymentLoadingModalOpen(false);
              setIsLoading(false);
              return true;
            }
          }

          const errorMessage =
            statusData.ResultDesc ||
            (normalized === "failed"
              ? "Payment failed: Insufficient balance"
              : normalized === "cancelled"
              ? "Payment cancelled by user"
              : "Payment timed out: User not reachable");
          setStatusMessage(errorMessage);
          onError(errorMessage);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to check transaction status";
          setStatusMessage(errorMessage);
          onError(errorMessage);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return true;
        }
      };

      const poll = async () => {
        console.log(`Starting polling for transaction ${transactionRequestId}`);
        while (attempts < maxAttempts) {
          const done = await checkStatus();
          if (done) {
            console.log(`Stopping polling: Transaction ${transactionRequestId} reached terminal state or error after ${attempts + 1} attempts`);
            break;
          }
          console.log(`Polling attempt ${attempts + 1}/${maxAttempts} for transaction ${transactionRequestId}`);
          await new Promise((resolve) => setTimeout(resolve, interval));
          attempts++;
        }
        if (attempts >= maxAttempts) {
          console.log(`Polling timed out for transaction ${transactionRequestId} after ${maxAttempts} attempts`);
          const timeoutMessage = "Payment processing timed out. Please check the transaction status later.";
          setStatusMessage(timeoutMessage);
          onError(timeoutMessage);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
        }
      };

      poll();
    },
    [onSuccess, paymentPropertyId, userId, csrfToken, onError]
  );

  const handlePayment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userId) {
        onError("User ID is missing");
        setIsLoading(false);
        return;
      }
      if (!csrfToken) {
        onError("CSRF token is missing");
        setIsLoading(false);
        return;
      }
      if (!(await validatePaymentForm())) return;

      setIsLoading(true);
      setIsPaymentLoadingModalOpen(true);
      setStatusMessage("Processing your payment. Please wait...");

      try {
        const billingPlanParam = billingPlan ? `&billingPlan=${encodeURIComponent(billingPlan)}` : "";
        const url = `/api/invoices?userId=${encodeURIComponent(userId)}&propertyId=${encodeURIComponent(paymentPropertyId)}&unitType=All%20Units${billingPlanParam}`;
        const invoiceRes = await fetch(url, {
          headers: { "X-CSRF-Token": csrfToken },
        });
        const invoiceData = await invoiceRes.json();
        console.log("Invoice fetch in handlePayment:", { userId, paymentPropertyId, invoiceData });

        if (!invoiceRes.ok) {
          onError(invoiceData.message || `Failed to fetch invoice (HTTP ${invoiceRes.status})`);
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        if (!invoiceData.success) {
          onError(invoiceData.message || "Failed to verify invoice status");
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        if (invoiceData.status !== "pending") {
          onError(
            invoiceData.status
              ? `Invoice is already ${invoiceData.status}`
              : `No pending invoice found for selected property`
          );
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        if (!invoiceData.invoices || !Array.isArray(invoiceData.invoices) || invoiceData.invoices.length === 0) {
          onError(`No invoice details found for selected property`);
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        const invoice: Invoice = invoiceData.invoices[0];

        const useOwnerDaraja = paymentRail === "shared_daraja" || paymentRail === "user_paybill";
        const requestBody = useOwnerDaraja
          ? {
              mode: paymentRail,
              amount: invoice.amount,
              phone: paymentPhone,
              accountReference: invoice.reference || paymentPropertyId || invoice._id,
              transactionDesc: invoice.description || `Invoice payment ${invoice.reference || invoice._id}`,
            }
          : {
              amount: invoice.amount,
              phone: paymentPhone,
              invoiceId: invoice._id,
              landlordId: userId,
              type: "Other",
            };

        const stkRes = await fetch(useOwnerDaraja ? "/api/owner/daraja/stk-push" : "/api/mpesa/stk-push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(requestBody),
        });
        const stkData = await stkRes.json();
        if (stkRes.ok && stkData.success) {
          pollTransactionStatus(stkData.checkoutRequestId, invoice, {
            statusEndpoint: useOwnerDaraja ? "/api/owner/daraja/status" : "/api/transaction-status",
          });
        } else {
          onError(stkData.message || "Failed to initiate payment");
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error initiating payment:", error);
        onError(error instanceof Error ? error.message : "Failed to initiate payment");
        setIsPaymentLoadingModalOpen(false);
        setIsLoading(false);
      }
    },
    [
      userId,
      paymentPhone,
      paymentPropertyId,
      validatePaymentForm,
      pollTransactionStatus,
      csrfToken,
      onError,
      billingPlan,
      paymentRail,
    ]
  );

  const calculateTotalUnits = (propertyId: string): number => {
    const property = properties.find((p) => p._id === propertyId); // No toString() needed since _id is string
    if (!property) return 0;
    return property.unitTypes.reduce((sum: number, unit: UnitType) => sum + (unit.quantity || 0), 0);
  };

  const sharedDarajaAvailable = !!ownerDarajaConfig?.shared.enabled && !!ownerDarajaConfig?.shared.hasDestinationNumber;
  const userPaybillAvailable = !!ownerDarajaConfig?.userPaybill.enabled && !!ownerDarajaConfig?.userPaybill.hasCredentials;
  const hasOwnerDarajaModes = sharedDarajaAvailable || userPaybillAvailable;
  const maskInline = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.length <= 4) return trimmed;
    return `${"*".repeat(Math.max(2, trimmed.length - 4))}${trimmed.slice(-4)}`;
  };
  const darajaModeBadgeText =
    paymentRail === "shared_daraja"
      ? `Shared Daraja · funds land in ${ownerDarajaConfig?.shared.paymentType === "till" ? "Till" : "Paybill"} ${
          maskInline(ownerDarajaConfig?.shared.destinationNumber || "") || "destination"
        }`
      : paymentRail === "user_paybill"
        ? `User Paybill · funds land in Paybill ${maskInline(ownerDarajaConfig?.userPaybill.shortcode || "") || "account"}`
        : "Legacy M-Pesa · platform shortcode";
  const selectedDarajaLabel =
    paymentRail === "shared_daraja"
      ? "Shared Daraja"
      : paymentRail === "user_paybill"
        ? "User-owned Paybill"
        : "Legacy M-Pesa";

  return (
    <>
      <Modal
        title="Make Payment"
        isOpen={isOpen}
        onClose={() => {
          onClose();
          resetPaymentForm();
        }}
      >
        {properties.length === 0 ? (
          <>
            <p className="mb-6 text-gray-700 text-sm">
              You need an active payment status and a minimum wallet balance to add a tenant. Please complete the payment process.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  onClose();
                  resetPaymentForm();
                }}
                className="px-4 py-2 bg-gray-200 rounded-full hover:bg-gray-300 transition text-sm text-foreground"
                aria-label="Cancel payment prompt"
              >
                Cancel
              </button>
              <button
                onClick={() => (window.location.href = `${dashboardBasePath}/payments`)}
                className="px-4 py-2 bg-[#1E3A8A] text-white rounded-full hover:bg-[#1E40AF] transition text-sm"
                aria-label="Go to payments"
              >
                Go to Payments
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">Property</label>
              <select
                value={paymentPropertyId}
                onChange={(e) => {
                  setPaymentPropertyId(e.target.value);
                  setPaymentAmount("");
                  setPaymentFormErrors((prev) => ({
                    ...prev,
                    paymentPropertyId: e.target.value ? undefined : "Property is required",
                    paymentInvoice: undefined,
                  }));
                }}
                required
                className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm bg-gray-50 text-foreground ${
                  paymentFormErrors.paymentPropertyId ? "border-red-500" : "border-gray-200"
                }`}
              >
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}> {/* No toString() needed since _id is string */}
                    {p.name} (Total Units: {calculateTotalUnits(p._id)})
                  </option>
                ))}
              </select>
              {paymentFormErrors.paymentPropertyId && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentPropertyId}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Phone Number</label>
              <input
                placeholder="Enter phone number (e.g., +254123456789)"
                value={paymentPhone}
                onChange={(e) => {
                  setPaymentPhone(e.target.value);
                  setPaymentFormErrors((prev) => ({
                    ...prev,
                    paymentPhone: e.target.value.trim()
                      ? /^\+?\d{10,15}$/.test(e.target.value)
                        ? undefined
                        : "Valid phone number is required (10-15 digits, optional +)"
                      : "Phone number is required",
                  }));
                }}
                required
                className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm bg-gray-50 text-foreground ${
                  paymentFormErrors.paymentPhone ? "border-red-500" : "border-gray-200"
                }`}
              />
              {paymentFormErrors.paymentPhone && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentPhone}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Amount (KES)</label>
              <input
                placeholder="Amount (auto-filled)"
                value={isFetchingAmount ? "Fetching amount..." : paymentAmount}
                readOnly
                className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm text-foreground ${
                  paymentFormErrors.paymentInvoice ? "border-red-500" : "border-gray-200"
                }`}
              />
              {paymentFormErrors.paymentInvoice && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentInvoice}</p>
              )}
            </div>
            {hasOwnerDarajaModes && (
              <div className="rounded-2xl border border-border bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Payment Rail</label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose how this payment should be initiated from the owner dashboard.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                    {selectedDarajaLabel}
                  </span>
                </div>

                <div className="mt-3 inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-semibold text-sky-700">
                  <span className="truncate">{darajaModeBadgeText}</span>
                </div>

                <select
                  value={paymentRail}
                  onChange={(e) => setPaymentRail(e.target.value as PaymentRail)}
                  disabled={ownerDarajaLoading}
                  className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="legacy_mpesa">Legacy M-Pesa flow</option>
                  {sharedDarajaAvailable && <option value="shared_daraja">Shared Daraja</option>}
                  {userPaybillAvailable && <option value="user_paybill">User-owned Paybill</option>}
                </select>

                <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-xl bg-white/80 px-3 py-2 border border-border">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Shared Daraja</p>
                    <p className="mt-1 font-medium text-foreground">
                      {sharedDarajaAvailable
                        ? `${ownerDarajaConfig?.shared.paymentType === "till" ? "Till" : "Paybill"} connected`
                        : ownerDarajaLoading
                          ? "Checking..."
                          : "Unavailable"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-3 py-2 border border-border">
                    <p className="uppercase tracking-[0.2em] text-[10px]">User Paybill</p>
                    <p className="mt-1 font-medium text-foreground">
                      {userPaybillAvailable
                        ? `${ownerDarajaConfig?.userPaybill.environment || "sandbox"} ready`
                        : ownerDarajaLoading
                          ? "Checking..."
                          : "Unavailable"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-3 py-2 border border-border">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Fallback</p>
                    <p className="mt-1 font-medium text-foreground">Legacy `/api/mpesa/stk-push`</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  resetPaymentForm();
                }}
                className="px-4 py-2 bg-gray-200 rounded-full hover:bg-gray-300 transition text-sm text-foreground"
                aria-label="Cancel payment"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isLoading ||
                  isFetchingAmount ||
                  Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                  !paymentPropertyId ||
                  !paymentAmount
                }
                className={`px-4 py-2 text-white rounded-full transition flex items-center gap-2 text-sm ${
                  isLoading ||
                  isFetchingAmount ||
                  Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                  !paymentPropertyId ||
                  !paymentAmount
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#1E3A8A] hover:bg-[#1E40AF]"
                }`}
                aria-label="Initiate payment"
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                Pay Now
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        title="Payment Processing"
        isOpen={isPaymentLoadingModalOpen}
        onClose={() => {}}
        disableClose={true}
      >
        <div className="flex flex-col items-center justify-center py-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mb-4"></div>
          <p className="text-foreground text-sm">{statusMessage}</p>
        </div>
      </Modal>
    </>
  );
}



