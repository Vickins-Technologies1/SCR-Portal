import React, { useState, useCallback, useEffect } from "react";
import Modal from "./Modal";

interface Property {
  _id: string;
  name: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: "RentCollection" | "FullManagement"; managementFee: number }[];
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
  properties: Property[];
  initialPropertyId?: string;
  initialUnitType?: string;
  initialPhone?: string;
  userId: string | null;
}

export default function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  properties,
  initialPropertyId = "",
  initialUnitType = "",
  initialPhone = "",
  userId,
}: PaymentModalProps) {
  const [paymentPropertyId, setPaymentPropertyId] = useState(initialPropertyId);
  const [paymentUnitType, setPaymentUnitType] = useState(initialUnitType);
  const [paymentPhone, setPaymentPhone] = useState(initialPhone);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentFormErrors, setPaymentFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentLoadingModalOpen, setIsPaymentLoadingModalOpen] = useState(false);
  const [isFetchingAmount, setIsFetchingAmount] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("Processing your payment. Please wait...");

  // Fetch CSRF token when modal opens
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
      fetchCsrfToken();
    }
  }, [isOpen, onError]);

  const resetPaymentForm = useCallback(() => {
    setPaymentPropertyId(initialPropertyId);
    setPaymentUnitType(initialUnitType);
    setPaymentPhone(initialPhone);
    setPaymentAmount("");
    setPaymentFormErrors({});
    setIsFetchingAmount(false);
    setStatusMessage("Processing your payment. Please wait...");
  }, [initialPropertyId, initialUnitType, initialPhone]);

  const validatePaymentForm = useCallback(
    async () => {
      const errors: { [key: string]: string | undefined } = {};
      if (!paymentPropertyId) {
        errors.paymentPropertyId = "Property is required";
      }
      if (!paymentUnitType) {
        errors.paymentUnitType = "Unit type is required";
      }
      if (!paymentPhone || !/^\+?\d{10,15}$/.test(paymentPhone)) {
        errors.paymentPhone = "Valid phone number is required (10-15 digits, optional +)";
      }
      if (paymentPropertyId && paymentUnitType && userId && csrfToken) {
        setIsFetchingAmount(true);
        try {
          const encodedUnitType = encodeURIComponent(paymentUnitType);
          const invoiceRes = await fetch(
            `/api/invoices?userId=${userId}&propertyId=${paymentPropertyId}&unitType=${encodedUnitType}`,
            {
              headers: { "X-CSRF-Token": csrfToken },
            }
          );
          const invoiceData = await invoiceRes.json();
          console.log("Invoice fetch response:", { userId, paymentPropertyId, paymentUnitType, encodedUnitType, invoiceData });

          if (!invoiceRes.ok || !invoiceData.success) {
            errors.paymentInvoice = invoiceData.message || "Failed to verify invoice status";
            setPaymentAmount("");
          } else if (invoiceData.status !== "pending") {
            errors.paymentInvoice = invoiceData.status
              ? `Invoice is already ${invoiceData.status}`
              : `No pending invoice found for ${paymentUnitType} in selected property`;
            setPaymentAmount("");
          } else if (!invoiceData.invoices?.[0]) {
            errors.paymentInvoice = `No invoice details found for ${paymentUnitType} in selected property`;
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
    [paymentPropertyId, paymentUnitType, paymentPhone, userId, csrfToken]
  );

  useEffect(() => {
    if (paymentPropertyId && paymentUnitType && userId && csrfToken) {
      validatePaymentForm();
    } else {
      setPaymentAmount("");
      setPaymentFormErrors((prev) => ({ ...prev, paymentInvoice: csrfToken ? undefined : "CSRF token is missing" }));
    }
  }, [paymentPropertyId, paymentUnitType, userId, csrfToken, validatePaymentForm]);

  const pollTransactionStatus = useCallback(
    async (transactionRequestId: string, invoice: Invoice, maxAttempts = 6, interval = 5000) => {
      let attempts = 0;
      const checkStatus = async (): Promise<boolean> => {
        try {
          if (!csrfToken) {
            throw new Error("CSRF token is missing");
          }
          const requestBody = { transactionRequestId };
          console.log("Transaction status request body:", requestBody, { csrfToken });

          const statusRes = await fetch("/api/transaction-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify(requestBody),
          });
          const statusData = await statusRes.json();
          console.log("Transaction status response:", statusData);

          if (!statusRes.ok || !statusData.success) {
            throw new Error(statusData.message || `HTTP error! Status: ${statusRes.status}`);
          }

          // Parse MpesaResponse with robust error handling
          let mpesaErrorCode = "";
          let mpesaErrorMessage = "";
          try {
            const mpesaResponse = JSON.parse(statusData.MpesaResponse || "{}");
            mpesaErrorCode = mpesaResponse.errorCode || "";
            mpesaErrorMessage = mpesaResponse.errorMessage || "";
            console.log("Parsed MpesaResponse:", { mpesaErrorCode, mpesaErrorMessage, rawMpesaResponse: statusData.MpesaResponse });
          } catch (error) {
            console.error("Error parsing MpesaResponse:", error, { rawMpesaResponse: statusData.MpesaResponse });
            mpesaErrorCode = "";
            mpesaErrorMessage = "";
          }

          // Check for cancellation condition
          const isCancelled = mpesaErrorCode === "500.001.1001" && mpesaErrorMessage.includes("user pressed Cancel Button");
          if (isCancelled) {
            console.log("Cancellation detected:", { transactionRequestId, mpesaErrorCode, mpesaErrorMessage });
            setStatusMessage("Payment cancelled on your phone. Please retry or confirm.");
            onError("Payment cancelled by user");
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay to show message
            setIsPaymentLoadingModalOpen(false);
            setIsLoading(false);
            return true; // Stop polling immediately
          }

          // Update status message for the loader
          if (statusData.TransactionStatus === "Pending") {
            setStatusMessage("Transaction pending, please complete the payment on your phone.");
          }

          // Check for terminal states
          if (statusData.TransactionStatus === "Completed") {
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
                  unitType: paymentUnitType,
                  amount: invoice.amount,
                  status: "completed",
                  reference: invoice.reference,
                }),
              });
              const updateData = await updateRes.json();
              if (!updateRes.ok || !updateData.success) {
                throw new Error(updateData.message || "Failed to update invoice status");
              }
              setStatusMessage("Payment successful!");
              onSuccess();
              await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay to show message
              setIsPaymentLoadingModalOpen(false);
              setIsLoading(false);
              return true;
            } catch (error) {
              console.error("Error updating invoice:", error);
              setStatusMessage("Failed to update invoice status.");
              onError(error instanceof Error ? error.message : "Failed to update invoice status");
              await new Promise((resolve) => setTimeout(resolve, 2000));
              setIsPaymentLoadingModalOpen(false);
              setIsLoading(false);
              return true;
            }
          } else if (["Failed", "Cancelled", "Timeout"].includes(statusData.TransactionStatus)) {
            const errorMessage =
              statusData.ResultDesc ||
              (statusData.TransactionStatus === "Failed"
                ? "Payment failed: Insufficient balance"
                : statusData.TransactionStatus === "Cancelled"
                ? "Payment cancelled by user"
                : "Payment timed out: User not reachable");
            console.log("Stopping polling due to terminal state:", { transactionRequestId, status: statusData.TransactionStatus, errorMessage });
            setStatusMessage(errorMessage);
            onError(errorMessage);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            setIsPaymentLoadingModalOpen(false);
            setIsLoading(false);
            return true;
          }

          console.log("Continuing polling:", { transactionRequestId, status: statusData.TransactionStatus, attempts: attempts + 1 });
          return false; // Continue polling for non-terminal states
        } catch (error) {
          console.error("Error checking transaction status:", error, { transactionRequestId });
          const errorMessage = error instanceof Error ? error.message : "Failed to check transaction status";
          setStatusMessage(errorMessage);
          onError(errorMessage);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return true; // Stop polling on error
        }
      };

      const poll = async () => {
        console.log(`Starting polling for transaction ${transactionRequestId}`);
        while (attempts < maxAttempts) {
          const done = await checkStatus();
          if (done) {
            console.log(`Stopping polling: Transaction ${transactionRequestId} reached terminal state or error after ${attempts + 1} attempts`);
            break; // Exit polling loop immediately
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
    [onError, onSuccess, paymentPropertyId, paymentUnitType, userId, csrfToken]
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
      onError("");
      setIsPaymentLoadingModalOpen(true);
      setStatusMessage("Processing your payment. Please wait...");

      try {
        const encodedUnitType = encodeURIComponent(paymentUnitType);
        const invoiceRes = await fetch(
          `/api/invoices?userId=${userId}&propertyId=${paymentPropertyId}&unitType=${encodedUnitType}`,
          {
            headers: { "X-CSRF-Token": csrfToken },
          }
        );
        const invoiceData = await invoiceRes.json();
        console.log("Invoice fetch in handlePayment:", { userId, paymentPropertyId, paymentUnitType, encodedUnitType, invoiceData });

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
              : `No pending invoice found for ${paymentUnitType} in selected property`
          );
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        if (!invoiceData.invoices || !Array.isArray(invoiceData.invoices) || invoiceData.invoices.length === 0) {
          onError(`No invoice details found for ${paymentUnitType} in selected property`);
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        const invoice: Invoice = invoiceData.invoices[0];

        const requestBody = {
          action: "initiate",
          amount: invoice.amount,
          msisdn: paymentPhone,
          reference: invoice.reference,
        };
        console.log("Payment initiate request body:", requestBody, { csrfToken });

        const stkRes = await fetch("/api/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(requestBody),
        });
        const stkData = await stkRes.json();
        console.log("Payment initiate response:", stkData);

        if (stkData.success === "200") {
          pollTransactionStatus(stkData.transaction_request_id, invoice);
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
    [userId, paymentPhone, paymentUnitType, paymentPropertyId, validatePaymentForm, pollTransactionStatus, csrfToken]
  );

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
            <p className="mb-6 text-gray-700 text-sm sm:text-base">
              You need an active payment status and a minimum wallet balance to add a tenant. Please complete the payment process.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  onClose();
                  resetPaymentForm();
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                aria-label="Cancel payment prompt"
              >
                Cancel
              </button>
              <button
                onClick={() => (window.location.href = "/property-owner-dashboard/payments")}
                className="px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm sm:text-base"
                aria-label="Go to payments"
              >
                Go to Payments
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Property</label>
              <select
                value={paymentPropertyId}
                onChange={(e) => {
                  setPaymentPropertyId(e.target.value);
                  setPaymentUnitType("");
                  setPaymentAmount("");
                  setPaymentFormErrors((prev) => ({
                    ...prev,
                    paymentPropertyId: e.target.value ? undefined : "Property is required",
                    paymentUnitType: undefined,
                    paymentInvoice: undefined,
                  }));
                }}
                required
                className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                  paymentFormErrors.paymentPropertyId ? "border-red-500" : "border-gray-300"
                }`}
              >
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {paymentFormErrors.paymentPropertyId && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentPropertyId}</p>
              )}
            </div>
            {paymentPropertyId && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit Type</label>
                <select
                  value={paymentUnitType}
                  onChange={(e) => {
                    const unitType = e.target.value;
                    setPaymentUnitType(unitType);
                    setPaymentAmount("");
                    setPaymentFormErrors((prev) => ({
                      ...prev,
                      paymentUnitType: unitType ? undefined : "Unit type is required",
                      paymentInvoice: undefined,
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    paymentFormErrors.paymentUnitType ? "border-red-500" : "border-gray-300"
                  }`}
                >
                  <option value="">Select Unit Type</option>
                  {properties
                    .find((p) => p._id === paymentPropertyId)
                    ?.unitTypes.map((u) => (
                      <option key={u.type} value={u.type}>
                        {u.type} ({u.managementType}: Ksh {u.managementFee}/mo)
                      </option>
                    ))}
                </select>
                {paymentFormErrors.paymentUnitType && (
                  <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentUnitType}</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment Amount (Ksh)</label>
              <div className="relative">
                <input
                  placeholder={isFetchingAmount ? "Fetching amount..." : "Amount (auto-filled after selecting unit type)"}
                  value={isFetchingAmount ? "Loading..." : paymentAmount}
                  readOnly
                  className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${
                    paymentFormErrors.paymentInvoice ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {isFetchingAmount && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#012a4a]"></div>
                )}
              </div>
              {paymentFormErrors.paymentInvoice && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentInvoice}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
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
                        : "Invalid phone number (10-15 digits, optional +)"
                      : "Phone number is required",
                  }));
                }}
                required
                className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                  paymentFormErrors.paymentPhone ? "border-red-500" : "border-gray-300"
                }`}
              />
              {paymentFormErrors.paymentPhone && (
                <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentPhone}</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  resetPaymentForm();
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
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
                  !paymentUnitType ||
                  !paymentPhone ||
                  !paymentAmount ||
                  !csrfToken
                }
                className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 text-sm sm:text-base ${
                  isLoading ||
                  isFetchingAmount ||
                  Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                  !paymentPropertyId ||
                  !paymentUnitType ||
                  !paymentPhone ||
                  !paymentAmount ||
                  !csrfToken
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#012a4a] hover:bg-[#014a7a]"
                }`}
                aria-label="Confirm payment"
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                Confirm Payment
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        title="Processing Payment"
        isOpen={isPaymentLoadingModalOpen}
        onClose={() => {}}
      >
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a] mb-4"></div>
          <p className={`text-sm sm:text-base ${statusMessage.includes("failed") || statusMessage.includes("cancelled") || statusMessage.includes("timed out") ? "text-red-700" : statusMessage.includes("successful") ? "text-green-700" : "text-gray-700"}`}>
            {statusMessage}
          </p>
        </div>
      </Modal>
    </>
  );
}