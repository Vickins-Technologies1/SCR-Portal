"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface Payment {
  _id: string;
  tenantId: string;
  propertyId: string;
  type: "Rent" | "Utility";
  amount: number;
  phoneNumber: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed" | "cancelled";
  createdAt: string;
}

interface Tenant {
  _id: string;
  propertyId: string;
  walletBalance: number;
  phone: string;
}

interface Message {
  type: "success" | "error";
  text: string;
  timestamp: string;
}

export default function PaymentsPage() {
  const [isClient, setIsClient] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [paymentType, setPaymentType] = useState<"Rent" | "Utility">("Rent");
  const [amount, setAmount] = useState<number>(0);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPayments, setTotalPayments] = useState(0);

  // Detect client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const id = Cookies.get("userId");
    if (!id) {
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Please log in to view payments.", timestamp: new Date().toISOString() },
      ]);
      return;
    }
    setTenantId(id);
    setLoading(true);

    const fetchData = async () => {
      try {
        const tenantRes = await fetch("/api/tenant/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();
        console.log("Tenant profile response:", tenantData);
        if (!tenantData.success || !tenantData.tenant) {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: tenantData.message || "Failed to fetch tenant data", timestamp: new Date().toISOString() },
          ]);
          return;
        }
        setTenant(tenantData.tenant);
        setPhoneNumber(tenantData.tenant.phone || "");

        const paymentsRes = await fetch(
          `/api/tenant/payments?tenantId=${id}&page=${currentPage}&limit=${itemsPerPage}&sort=-createdAt`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        );
        const paymentsData = await paymentsRes.json();
        console.log("Payments response:", paymentsData);
        if (paymentsData.success) {
          setPayments(paymentsData.payments || []);
          setTotalPayments(paymentsData.total || 0);
        } else {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: paymentsData.message || "Failed to fetch payments", timestamp: new Date().toISOString() },
          ]);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setMessages((prev) => [
          ...prev,
          { type: "error", text: "Failed to connect to the server", timestamp: new Date().toISOString() },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isClient, currentPage, itemsPerPage]);

  const validatePhoneNumber = (phone: string): boolean => {
    const regex = /^(?:\+2547|07)\d{8}$/;
    return regex.test(phone);
  };

  const formatPhoneNumber = (phone: string): string => {
    if (phone.startsWith("07")) return `254${phone.slice(1)}`;
    if (phone.startsWith("+")) return phone.slice(1);
    return phone;
  };

  const getCsrfToken = async (): Promise<string> => {
    try {
      const csrfRes = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const { csrfToken } = await csrfRes.json();
      console.log("Fetched CSRF token:", csrfToken);
      return csrfToken;
    } catch (err) {
      console.error("Error fetching CSRF token:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to fetch CSRF token", timestamp: new Date().toISOString() },
      ]);
      throw new Error("Failed to fetch CSRF token");
    }
  };

  const checkTransactionStatus = async (transactionRequestId: string): Promise<{ status: string; errorMessage?: string }> => {
    try {
      let csrfToken = Cookies.get("csrf-token");
      if (!csrfToken) {
        csrfToken = await getCsrfToken();
      }

      const response = await fetch("/api/tenant/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          transaction_request_id: transactionRequestId,
          tenantId,
          propertyId: tenant?.propertyId,
          csrfToken,
        }),
      });
      const data = await response.json();
      console.log("Transaction status response:", data);

      if (data.success) {
        setMessages((prev) => [
          ...prev,
          { type: "success", text: data.message || "Transaction status retrieved successfully", timestamp: new Date().toISOString() },
        ]);
        return { status: data.status, errorMessage: data.message };
      } else if (data.message === "CSRF token validation failed") {
        console.log("CSRF token validation failed, retrying...");
        setMessages((prev) => [
          ...prev,
          { type: "error", text: "CSRF token validation failed, retrying...", timestamp: new Date().toISOString() },
        ]);
        csrfToken = await getCsrfToken();
        const retryResponse = await fetch("/api/tenant/payments/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            transaction_request_id: transactionRequestId,
            tenantId,
            propertyId: tenant?.propertyId,
            csrfToken,
          }),
        });
        const retryData = await retryResponse.json();
        console.log("Retry transaction status response:", retryData);
        if (retryData.success) {
          setMessages((prev) => [
            ...prev,
            { type: "success", text: retryData.message || "Transaction status retrieved successfully after retry", timestamp: new Date().toISOString() },
          ]);
          return { status: retryData.status, errorMessage: retryData.message };
        } else {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: retryData.message || "Failed to check transaction status after retry", timestamp: new Date().toISOString() },
          ]);
          throw new Error(retryData.message || "Failed to check transaction status after retry");
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: data.message || "Failed to check transaction status", timestamp: new Date().toISOString() },
        ]);
        throw new Error(data.message || "Failed to check transaction status");
      }
    } catch (err) {
      console.error("Error checking transaction status:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: `Failed to check transaction status: ${err instanceof Error ? err.message : "Unknown error"}`, timestamp: new Date().toISOString() },
      ]);
      throw err;
    }
  };

  const handlePayment = async () => {
    if (!tenantId || !tenant?.propertyId || amount < 10 || !validatePhoneNumber(phoneNumber)) {
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          text: !tenantId
            ? "Please log in to make a payment."
            : !tenant?.propertyId
            ? "Tenant profile incomplete. Missing property ID."
            : amount < 10
            ? "Amount must be at least 10 KES."
            : "Please enter a valid phone number (e.g., +2547xxxxxxxx or 07xxxxxxxx).",
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsProcessing(true); // Show loader modal for validation errors
      return;
    }

    setIsProcessing(true);
    setMessages([]); // Clear previous messages

    try {
      let csrfToken = Cookies.get("csrf-token");
      if (!csrfToken) {
        csrfToken = await getCsrfToken();
      }
      console.log("CSRF token:", csrfToken);

      const reference = `ORDER-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const payload = {
        tenantId,
        propertyId: tenant.propertyId,
        type: paymentType,
        amount,
        phoneNumber: formatPhoneNumber(phoneNumber),
        csrfToken,
        userId: tenantId,
        reference,
      };
      console.log("Submitting payment with payload:", payload);

      // Step 1: Initiate STK Push via internal API
      const paymentRes = await fetch("/api/tenant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const paymentData = await paymentRes.json();
      console.log("Payment initiation response:", paymentData);

      if (!paymentData.success) {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: paymentData.message || "Failed to initiate payment.", timestamp: new Date().toISOString() },
        ]);
        setIsProcessing(false); // Close modal for initiation failure
        return;
      }

      setMessages((prev) => [
        ...prev,
        { type: "success", text: paymentData.message || "STK Push initiated successfully", timestamp: new Date().toISOString() },
      ]);

      const { transaction_request_id } = paymentData;

      // Step 2: Poll transaction status
      let status = "pending";
      let attempts = 0;
      const maxAttempts = 10; // Poll for ~50 seconds (5s interval)
      let errorMessage: string | undefined;
      while (status === "pending" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
        const result = await checkTransactionStatus(transaction_request_id);
        status = result.status;
        errorMessage = result.errorMessage;
        attempts++;
        console.log(`Attempt ${attempts}: Transaction status = ${status}, ErrorMessage = ${errorMessage || "None"}`);
        // Stop polling for terminal states
        if (status === "completed" || status === "failed" || status === "cancelled") {
          break;
        }
      }

      // Handle terminal states
      if (status === "completed") {
        setMessages((prev) => [
          ...prev,
          { type: "success", text: "Payment completed successfully!", timestamp: new Date().toISOString() },
        ]);

        // Fetch updated tenant and payments
        const tenantRes = await fetch("/api/tenant/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();
        if (tenantData.success) {
          setTenant(tenantData.tenant);
          setPhoneNumber(tenantData.tenant?.phone || "");
        } else {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: tenantData.message || "Failed to update tenant profile", timestamp: new Date().toISOString() },
          ]);
        }

        const updatedRes = await fetch(
          `/api/tenant/payments?tenantId=${tenantId}&page=1&limit=${itemsPerPage}&sort=-createdAt`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        );
        const updatedData = await updatedRes.json();
        if (updatedData.success) {
          setPayments(updatedData.payments || []);
          setTotalPayments(updatedData.total || 0);
          setCurrentPage(1); // Reset to page 1 to show latest payment
        } else {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: updatedData.message || "Failed to fetch updated payments", timestamp: new Date().toISOString() },
          ]);
        }

        setIsModalOpen(false);
        setAmount(0);
        setPaymentType("Rent");
        setIsProcessing(false); // Close modal for completed payment
      } else {
        const errorText =
          status === "failed" && errorMessage?.toLowerCase().includes("insufficient balance")
            ? "Payment failed due to insufficient balance."
            : status === "failed"
            ? errorMessage || "Payment failed."
            : status === "cancelled"
            ? errorMessage || "Payment was cancelled by the user."
            : "Payment timed out. User was not reachable.";
        setMessages((prev) => [
          ...prev,
          { type: "error", text: errorText, timestamp: new Date().toISOString() },
        ]);
        if (status === "failed" || status === "cancelled") {
          setIsProcessing(false); // Close modal for failed or cancelled
        }
        // Keep isProcessing true for timeout (non-terminal in some cases)
      }
    } catch (err) {
      console.error("Payment error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to process payment. Please check your connection.", timestamp: new Date().toISOString() },
      ]);
      setIsProcessing(false); // Close modal for unexpected errors
    }
  };

  // Pagination controls
  const totalPages = Math.ceil(totalPayments / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-1">Payment History</h1>
        <p>View your past and upcoming rent or utility payments, sorted by latest.</p>
        {tenant && (
          <div className="mt-2 text-sm">
            <p>
              Wallet Balance:{" "}
              <span className="font-semibold">
                KES {typeof tenant.walletBalance === "number" ? tenant.walletBalance.toLocaleString() : "0"}
              </span>
            </p>
            <p>
              Property ID: <span className="font-semibold">{tenant.propertyId || "Not set"}</span>
            </p>
            <p>
              Phone: <span className="font-semibold">{tenant.phone || "Not set"}</span>
            </p>
          </div>
        )}
        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-4 bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
          disabled={!tenantId || !tenant?.propertyId}
        >
          Make a Payment
        </button>
      </section>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount (KES)</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Payment Date</th>
              <th className="px-4 py-2">Transaction ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                  Loading payments...
                </td>
              </tr>
            ) : payments.length > 0 ? (
              payments.map((p) => (
                <motion.tr key={p._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  <td className="px-4 py-2 font-medium capitalize">{p.type}</td>
                  <td className="px-4 py-2">KES {p.amount.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        p.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : p.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2">{p.transactionId}</td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                  No payment records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 gap-4">
            <span className="text-sm text-gray-600">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, totalPayments)} of {totalPayments} payments
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <ChevronLeft size="16" />
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      currentPage === page
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    } transition`}
                    aria-label={`Page ${page}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <ChevronRight size="16" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            key="payment-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Make a Payment</h2>
              <label className="block mb-3">
                <span className="text-sm font-medium text-gray-700">Payment Type</span>
                <select
                  className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as "Rent" | "Utility")}
                >
                  <option value="Rent">Rent</option>
                  <option value="Utility">Utility</option>
                </select>
              </label>
              <label className="block mb-3">
                <span className="text-sm font-medium text-gray-700">Amount (KES)</span>
                <input
                  type="number"
                  className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="10"
                  required
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">Phone Number</span>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+2547xxxxxxxx or 07xxxxxxxx"
                  required
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={isProcessing || amount < 10 || !validatePhoneNumber(phoneNumber)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition"
                >
                  Pay Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {(isProcessing || messages.length > 0) && (
          <motion.div
            key="processing-spinner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setIsProcessing(false);
              setMessages([]);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {isProcessing && (
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <motion.div
                    className="absolute inset-0 border-4 border-blue-200 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              )}
              <h3 className="text-lg font-semibold text-gray-800">
                {isProcessing ? "Processing Payment" : "Payment Status"}
              </h3>
              {isProcessing && (
                <p className="text-sm text-gray-500 mt-2">
                  Please check your phone and enter your M-Pesa PIN to complete the payment.
                </p>
              )}
              {messages.length > 0 && (
                <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                  {messages.map((msg, index) => (
                    <div
                      key={`message-${index}`}
                      className={`p-3 rounded-lg flex items-center gap-2 ${
                        msg.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {msg.type === "success" ? <CheckCircle size="16" /> : <AlertCircle size="16" />}
                      <div>
                        <p className="text-sm">{msg.text}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(msg.timestamp).toLocaleString("en-US", {
                            hour: "numeric",
                            minute: "numeric",
                            second: "numeric",
                            hour12: true,
                            timeZone: "Africa/Nairobi",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {messages.length > 0 && (
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setMessages([]);
                      setIsProcessing(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}