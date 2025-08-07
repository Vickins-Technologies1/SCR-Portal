"use client";

import React, { useEffect, useState, useCallback } from "react";
import Cookies from "js-cookie";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface Payment {
  _id: string;
  tenantId: string;
  propertyId: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  amount: number;
  phoneNumber: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed" | "cancelled";
  createdAt: string;
  tenantName: string;
  reference: string;
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
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [displayedPayments, setDisplayedPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [paymentType, setPaymentType] = useState<"Rent" | "Utility" | "Deposit" | "Other">("Rent");
  const [amount, setAmount] = useState<number>(0);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const id = Cookies.get("userId");
    if (!id) {
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Please log in to view payments.", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
      setLoading(false);
      return;
    }
    setTenantId(id);
    fetchCsrfToken();
  }, [isClient]);

  const fetchCsrfToken = async () => {
    try {
      const csrfRes = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const data = await csrfRes.json();
      if (data.success) {
        setCsrfToken(data.csrfToken);
      } else {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: data.message || "Failed to fetch CSRF token", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        setLoading(false);
      }
    } catch (err) {
      console.error("Error fetching CSRF token:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to fetch CSRF token", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
      setLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!tenantId || !csrfToken) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const tenantRes = await fetch("/api/tenant/profile", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });
      const tenantData = await tenantRes.json();
      if (!tenantData.success || !tenantData.tenant) {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: tenantData.message || "Failed to fetch tenant data", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        setLoading(false);
        return;
      }
      setTenant(tenantData.tenant);
      setPhoneNumber(tenantData.tenant.phone || "");

      const paymentsRes = await fetch(`/api/tenant/payments?tenantId=${tenantId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });
      const paymentsData = await paymentsRes.json();
      if (paymentsData.success) {
        const fetchedPayments = paymentsData.payments || [];
        setAllPayments(fetchedPayments);
        setTotal(fetchedPayments.length);
        setTotalPages(Math.ceil(fetchedPayments.length / limit));
        setDisplayedPayments(fetchedPayments.slice((page - 1) * limit, page * limit));
        if (fetchedPayments.length === 0) {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: "No payment records found.", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: paymentsData.message || "Failed to fetch payments", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to connect to the server", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, csrfToken, limit]); // Removed 'page' from dependency array

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setDisplayedPayments(allPayments.slice((page - 1) * limit, page * limit));
    setTotalPages(Math.ceil(allPayments.length / limit));
  }, [page, allPayments, limit]);

  const validatePhoneNumber = (phone: string): boolean => {
    const regex = /^(?:\+2547|07)\d{8}$/;
    return regex.test(phone);
  };

  const formatPhoneNumber = (phone: string): string => {
    const normalized = phone.replace(/\D/g, ""); // Changed let to const
    if (normalized.startsWith("07")) {
      return `254${normalized.slice(1)}`;
    } else if (normalized.startsWith("+254")) {
      return normalized.slice(1);
    }
    return normalized;
  };

  const checkTransactionStatus = async (transactionRequestId: string): Promise<string> => {
    if (!csrfToken || !tenantId || !tenant?.propertyId) {
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Missing CSRF token, tenant ID, or property ID", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
      throw new Error("Missing CSRF token, tenant ID, or property ID");
    }

    try {
      const response = await fetch("/api/tenant/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          transaction_request_id: transactionRequestId,
          tenantId,
          propertyId: tenant.propertyId,
          csrfToken,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          { type: "success", text: data.message || "Transaction status retrieved successfully", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        return data.status;
      } else {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: data.message || "Failed to check transaction status", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        throw new Error(data.message || "Failed to check transaction status");
      }
    } catch (err) {
      console.error("Error checking transaction status:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: `Failed to check transaction status: ${err instanceof Error ? err.message : "Unknown error"}`, timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
      throw err;
    }
  };

  const handlePayment = async () => {
    if (!tenantId || !tenant?.propertyId || amount < 10 || !validatePhoneNumber(phoneNumber) || !csrfToken) {
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
            : !validatePhoneNumber(phoneNumber)
            ? "Please enter a valid phone number (e.g., +2547xxxxxxxx or 07xxxxxxxx)."
            : "CSRF token not available.",
          timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString(),
        },
      ]);
      setIsProcessing(true);
      return;
    }

    setIsProcessing(true);
    setMessages([]);

    try {
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
      const paymentRes = await fetch("/api/tenant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const paymentData = await paymentRes.json();

      if (!paymentData.success) {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: paymentData.message || "Failed to initiate payment. Please check your phone number format (+2547xxxxxxxx or 07xxxxxxxx).", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        setIsProcessing(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { type: "success", text: paymentData.message || "STK Push initiated successfully. Please check your phone.", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);

      const { transaction_request_id } = paymentData;
      let status = "pending";
      let attempts = 0;
      const maxAttempts = 10;
      while (status === "pending" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        status = await checkTransactionStatus(transaction_request_id);
        attempts++;
      }

      if (status === "completed") {
        setMessages((prev) => [
          ...prev,
          { type: "success", text: "Payment completed successfully! Confirmation sent to your email and phone.", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        await fetchData();
        setIsModalOpen(false);
        setAmount(0);
        setPaymentType("Rent");
        setIsProcessing(false);
      } else {
        const errorMessage =
          status === "failed"
            ? "Payment failed due to insufficient balance."
            : status === "cancelled"
            ? "Payment was cancelled by the user."
            : "Payment timed out. User was not reachable.";
        setMessages((prev) => [
          ...prev,
          { type: "error", text: errorMessage, timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
        ]);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Payment error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to process payment. Please check your connection.", timestamp: new Date("2025-08-07T15:26:00+03:00").toISOString() },
      ]);
      setIsProcessing(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-white p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <section className="bg-[#1E3A8A] text-white rounded-2xl p-8 shadow-xl">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Payment Dashboard</h1>
          <p className="text-gray-200 text-sm">Manage your rent and utility payments seamlessly.</p>
          {tenant && (
            <div className="mt-4 bg-[#1E3A8A]/20 p-4 rounded-lg">
              <p className="text-sm font-medium">
                Wallet Balance:{" "}
                <span className="font-bold text-lg text-[#6EE7B7]">
                  KES {typeof tenant.walletBalance === "number" ? tenant.walletBalance.toLocaleString() : "0"}
                </span>
              </p>
            </div>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 bg-[#6EE7B7] text-[#1E3A8A] font-semibold px-6 py-2 rounded-full shadow-md hover:bg-[#4ADE80] transition-all duration-300 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            disabled={!tenantId || !tenant?.propertyId || !csrfToken}
          >
            Make a Payment
          </button>
        </section>

        {/* Payments Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#1E3A8A]">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#1E3A8A]">Amount (KES)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#1E3A8A]">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#1E3A8A]">Payment Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#1E3A8A]">Transaction ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-gray-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin w-6 h-6 border-4 border-[#1E3A8A] border-t-transparent rounded-full"></div>
                      <span className="ml-2">Loading payments...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedPayments.length > 0 ? (
                displayedPayments.map((p) => (
                  <motion.tr
                    key={p._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-[#1E3A8A] capitalize">{p.type || "Other"}</td>
                    <td className="px-6 py-4 text-gray-600">KES {p.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          p.status === "completed"
                            ? "bg-[#6EE7B7]/20 text-[#6EE7B7]"
                            : p.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{p.transactionId}</td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-gray-500">
                    No payment records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 bg-white p-4 rounded-2xl shadow-md border border-gray-200">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || loading}
              className="flex items-center px-4 py-2 text-sm font-medium text-[#1E3A8A] bg-[#6EE7B7]/20 rounded-full hover:bg-[#6EE7B7]/30 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-300"
            >
              <ChevronLeft size={16} className="mr-1" />
              Previous
            </button>
            <span className="text-sm text-[#1E3A8A] font-medium">
              Page {page} of {totalPages} ({total} total payments)
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages || loading}
              className="flex items-center px-4 py-2 text-sm font-medium text-[#1E3A8A] bg-[#6EE7B7]/20 rounded-full hover:bg-[#6EE7B7]/30 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-300"
            >
              Next
              <ChevronRight size={16} className="ml-1" />
            </button>
          </div>
        )}

        {/* Payment Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <motion.div
              key="payment-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-2xl font-bold text-[#1E3A8A] mb-6">Make a Payment</h2>
                <label className="block mb-4">
                  <span className="text-sm font-medium text-[#1E3A8A]">Payment Type</span>
                  <select
                    className="mt-1 block w-full rounded-lg border border-gray-200 py-3 px-4 focus:ring-2 focus:ring-[#6EE7B7] focus:border-[#1E3A8A] transition-all bg-gray-50 text-[#1E3A8A]"
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as "Rent" | "Utility" | "Deposit" | "Other")}
                  >
                    <option value="Rent">Rent</option>
                    <option value="Utility">Utility</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="block mb-4">
                  <span className="text-sm font-medium text-[#1E3A8A]">Amount (KES)</span>
                  <input
                    type="number"
                    className="mt-1 block w-full rounded-lg border border-gray-200 py-3 px-4 focus:ring-2 focus:ring-[#6EE7B7] focus:border-[#1E3A8A] transition-all bg-gray-50 text-[#1E3A8A]"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min="10"
                    required
                  />
                </label>
                <label className="block mb-6">
                  <span className="text-sm font-medium text-[#1E3A8A]">Phone Number</span>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-lg border border-gray-200 py-3 px-4 focus:ring-2 focus:ring-[#6EE7B7] focus:border-[#1E3A8A] transition-all bg-gray-50 text-[#1E3A8A]"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+2547xxxxxxxx or 07xxxxxxxx"
                    required
                  />
                </label>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 text-sm font-medium text-[#1E3A8A] bg-gray-100 rounded-full hover:bg-gray-200 transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePayment}
                    disabled={isProcessing || amount < 10 || !validatePhoneNumber(phoneNumber) || !csrfToken}
                    className="px-6 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-full hover:bg-[#1E40AF] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    Pay Now
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Processing/Status Modal */}
          {(isProcessing || messages.length > 0) && (
            <motion.div
              key="processing-spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => {
                setIsProcessing(false);
                setMessages([]);
              }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl text-center"
                onClick={(e) => e.stopPropagation()}
              >
                {isProcessing && (
                  <div className="relative w-16 h-16 mx-auto mb-6">
                    <motion.div
                      className="absolute inset-0 border-4 border-[#6EE7B7]/50 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-0 border-4 border-[#1E3A8A] rounded-full border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                )}
                <h3 className="text-xl font-bold text-[#1E3A8A]">
                  {isProcessing ? "Processing Payment" : "Payment Status"}
                </h3>
                {isProcessing && (
                  <p className="text-sm text-gray-500 mt-3">
                    Please check your phone and enter your M-Pesa PIN to complete the payment.
                  </p>
                )}
                {messages.length > 0 && (
                  <div className="mt-6 space-y-3 max-h-64 overflow-y-auto">
                    {messages.map((msg, index) => (
                      <div
                        key={`message-${index}`}
                        className={`p-4 rounded-lg flex items-start gap-3 ${
                          msg.type === "success" ? "bg-[#6EE7B7]/20 text-[#6EE7B7]" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {msg.type === "success" ? <CheckCircle size="20" /> : <AlertCircle size="20" />}
                        <div>
                          <p className="text-sm font-medium">{msg.text}</p>
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
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => {
                        setMessages([]);
                        setIsProcessing(false);
                      }}
                      className="px-6 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-full hover:bg-[#1E40AF] transition-all duration-300"
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
    </div>
  );
}