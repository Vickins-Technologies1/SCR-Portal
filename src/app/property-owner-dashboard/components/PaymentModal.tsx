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
  csrfToken: string;
}

const UMS_PAY_API_KEY = process.env.UMS_PAY_API_KEY || "";
const UMS_PAY_EMAIL = process.env.UMS_PAY_EMAIL || "";
const UMS_PAY_ACCOUNT_ID = process.env.UMS_PAY_ACCOUNT_ID || "";

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
  csrfToken,
}: PaymentModalProps) {
  const [paymentPropertyId, setPaymentPropertyId] = useState(initialPropertyId);
  const [paymentUnitType, setPaymentUnitType] = useState(initialUnitType);
  const [paymentPhone, setPaymentPhone] = useState(initialPhone);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentFormErrors, setPaymentFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentLoadingModalOpen, setIsPaymentLoadingModalOpen] = useState(false);
  const [isFetchingAmount, setIsFetchingAmount] = useState(false); // New state for fetching amount

  const resetPaymentForm = useCallback(() => {
    setPaymentPropertyId(initialPropertyId);
    setPaymentUnitType(initialUnitType);
    setPaymentPhone(initialPhone);
    setPaymentAmount("");
    setPaymentFormErrors({});
    setIsFetchingAmount(false);
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
      if (paymentPropertyId && paymentUnitType && userId) {
        setIsFetchingAmount(true);
        try {
          const invoiceRes = await fetch(
            `/api/invoices?userId=${userId}&propertyId=${paymentPropertyId}&unitType=${encodeURIComponent(paymentUnitType)}`,
            {
              headers: { "X-CSRF-Token": csrfToken },
            }
          );
          const invoiceData = await invoiceRes.json();
          console.log("Invoice fetch response:", { userId, paymentPropertyId, paymentUnitType, invoiceData });

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
      }
      setPaymentFormErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [paymentPropertyId, paymentUnitType, paymentPhone, userId, csrfToken]
  );

  // Trigger validatePaymentForm when unitType changes
  useEffect(() => {
    if (paymentPropertyId && paymentUnitType && userId) {
      validatePaymentForm();
    } else {
      setPaymentAmount("");
      setPaymentFormErrors((prev) => ({ ...prev, paymentInvoice: undefined }));
    }
  }, [paymentPropertyId, paymentUnitType, userId, validatePaymentForm]);

const pollTransactionStatus = useCallback(
  async (transactionRequestId: string, invoice: Invoice, maxAttempts = 6, interval = 5000) => {
    let attempts = 0;
    const checkStatus = async (): Promise<boolean> => {
      try {
        const statusRes = await fetch("https://api.umspay.co.ke/api/v1/transactionstatus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: UMS_PAY_API_KEY,
            email: UMS_PAY_EMAIL,
            transaction_request_id: transactionRequestId,
          }),
        });
        if (!statusRes.ok) {
          throw new Error(`HTTP error! Status: ${statusRes.status}`);
        }
        const statusData = await statusRes.json();
        if (!statusData || typeof statusData !== "object") {
          onError("Invalid response from payment API");
          return true;
        }
        if (statusData.ResultCode === "200") {
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
              onSuccess();
            } catch (error) {
              onError(error instanceof Error ? error.message : "Failed to update invoice status");
            }
            return true;
          } else if (["Failed", "Cancelled", "Timeout"].includes(statusData.TransactionStatus)) {
            onError(
              statusData.ResultDesc ||
                (statusData.TransactionStatus === "Failed"
                  ? "Payment failed: Insufficient balance"
                  : statusData.TransactionStatus === "Cancelled"
                  ? "Payment cancelled by user"
                  : "Payment timed out: User not reachable")
            );
            return true;
          }
        } else {
          onError(statusData.errorMessage || "Failed to check transaction status");
          return true;
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : "Failed to connect to UMS Pay API");
        return true;
      }
      return false;
    };

    const poll = async () => {
      while (attempts < maxAttempts) {
        const done = await checkStatus();
        if (done) break;
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
      }
      if (attempts >= maxAttempts) {
        onError("Payment processing timed out. Please check the transaction status later.");
      }
      setIsPaymentLoadingModalOpen(false);
      setIsLoading(false);
    };

    poll();
  },
  [onError, onSuccess, paymentPropertyId, paymentUnitType, userId, csrfToken] // Added onError to the dependency array
);

  const handlePayment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userId) {
        onError("User ID is missing");
        setIsLoading(false);
        return;
      }
      if (!(await validatePaymentForm())) return;

      setIsLoading(true);
      onError("");
      setIsPaymentLoadingModalOpen(true);

      try {
        // Fetch the pending invoice
        const invoiceRes = await fetch(
          `/api/invoices?userId=${userId}&propertyId=${paymentPropertyId}&unitType=${encodeURIComponent(paymentUnitType)}`,
          {
            headers: { "X-CSRF-Token": csrfToken },
          }
        );
        const invoiceData = await invoiceRes.json();
        console.log("Invoice fetch in handlePayment:", { userId, paymentPropertyId, paymentUnitType, invoiceData });

        if (!invoiceRes.ok || !invoiceData.success || invoiceData.status !== "pending") {
          onError(invoiceData.message || `No pending invoice found for ${paymentUnitType} in selected property`);
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        if (!invoiceData.invoices?.[0]) {
          onError(`No invoice details found for ${paymentUnitType} in selected property`);
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
          return;
        }
        const invoice: Invoice = invoiceData.invoices[0];

        const stkRes = await fetch("https://api.umspay.co.ke/api/v1/initiatestkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: UMS_PAY_API_KEY,
            email: UMS_PAY_EMAIL,
            amount: invoice.amount,
            msisdn: paymentPhone,
            reference: invoice.reference,
            account_id: UMS_PAY_ACCOUNT_ID,
          }),
        });
        const stkData = await stkRes.json();
        if (stkData.success === "200") {
          pollTransactionStatus(stkData.transaction_request_id, invoice);
        } else {
          onError(stkData.errorMessage || "Failed to initiate payment");
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error initiating payment:", error);
        onError(error instanceof Error ? error.message : "Failed to connect to UMS Pay API");
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
                  !paymentAmount
                }
                className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 text-sm sm:text-base ${
                  isLoading ||
                  isFetchingAmount ||
                  Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                  !paymentPropertyId ||
                  !paymentUnitType ||
                  !paymentPhone ||
                  !paymentAmount
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
          <p className="text-gray-700 text-sm sm:text-base">
            Processing your payment. Please wait...
          </p>
        </div>
      </Modal>
    </>
  );
}