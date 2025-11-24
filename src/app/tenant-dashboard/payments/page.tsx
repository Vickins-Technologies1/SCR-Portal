"use client";

import React, { useEffect, useState, useCallback } from "react";
import Cookies from "js-cookie";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Download } from "lucide-react";

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
        { type: "error", text: "Please log in to view payments.", timestamp: new Date().toISOString() },
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
          { type: "error", text: data.message || "Failed to fetch CSRF token", timestamp: new Date().toISOString() },
        ]);
        setLoading(false);
      }
    } catch (err) {
      console.error("Error fetching CSRF token:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to fetch CSRF token", timestamp: new Date().toISOString() },
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
          { type: "error", text: tenantData.message || "Failed to fetch tenant data", timestamp: new Date().toISOString() },
        ]);
        setLoading(false);
        return;
      }
      setTenant(tenantData.tenant);
      setPhoneNumber(tenantData.tenant.phone || "");

      const paymentsRes = await fetch(`/api/tenant/payments?tenantId=${tenantId}&page=${page}&limit=${limit}`, {
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
        setDisplayedPayments(fetchedPayments);
        setTotal(paymentsData.total || fetchedPayments.length);
        setTotalPages(Math.ceil(paymentsData.total / limit));
        if (fetchedPayments.length === 0) {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: "No payment records found.", timestamp: new Date().toISOString() },
          ]);
        }
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
  }, [tenantId, csrfToken, page, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const validatePhoneNumber = (phone: string): boolean => {
    const regex = /^(?:\+2547|07)\d{8}$/;
    return regex.test(phone);
  };

  const formatPhoneNumber = (phone: string): string => {
    const normalized = phone.replace(/\D/g, "");
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
        { type: "error", text: "Missing CSRF token, tenant ID, or property ID", timestamp: new Date().toISOString() },
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
          { type: "success", text: data.message || "Transaction status retrieved successfully", timestamp: new Date().toISOString() },
        ]);
        return data.status;
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
          timestamp: new Date().toISOString(),
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
          { type: "error", text: paymentData.message || "Failed to initiate payment. Please check your phone number format (+2547xxxxxxxx or 07xxxxxxxx).", timestamp: new Date().toISOString() },
        ]);
        setIsProcessing(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { type: "success", text: paymentData.message || "STK Push initiated successfully. Please check your phone.", timestamp: new Date().toISOString() },
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
          { type: "success", text: "Payment completed successfully! Confirmation sent to your email and phone.", timestamp: new Date().toISOString() },
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
          { type: "error", text: errorMessage, timestamp: new Date().toISOString() },
        ]);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Payment error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to process payment. Please check your connection.", timestamp: new Date().toISOString() },
      ]);
      setIsProcessing(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const generateReceipt = async (paymentId: string) => {
    if (!csrfToken || !tenantId) {
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Missing CSRF token or tenant ID", timestamp: new Date().toISOString() },
      ]);
      return;
    }

    try {
      const response = await fetch(`/api/tenant/payments/receipt?paymentId=${paymentId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });
      const data = await response.json();
      if (data.success && data.pdf) {
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `receipt_${paymentId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setMessages((prev) => [
          ...prev,
          { type: "success", text: "Receipt generated and downloaded successfully", timestamp: new Date().toISOString() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: data.message || "Failed to generate receipt", timestamp: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      console.error("Error generating receipt:", err);
      setMessages((prev) => [
        ...prev,
        { type: "error", text: "Failed to generate receipt", timestamp: new Date().toISOString() },
      ]);
    }
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-gray-50 pt-16 sm:pt-20 lg:pt-24">
      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">

        {/* Header Section */}
        <section className="bg-[#1E3A8A] text-white rounded-2xl p-6 sm:p-8 shadow-xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Payment Dashboard</h1>
          <p className="text-gray-200 text-sm opacity-90">Manage your rent, deposit and utility payments seamlessly.</p>
          
          {tenant && (
            <div className="mt-5 bg-white/10 backdrop-blur-sm p-4 rounded-xl">
              <p className="text-sm font-medium">
                Wallet Balance:{" "}
                <span className="font-bold text-lg sm:text-2xl text-[#6EE7B7]">
                  KES {typeof tenant.walletBalance === "number" ? tenant.walletBalance.toLocaleString() : "0"}
                </span>
              </p>
            </div>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 w-full sm:w-auto bg-[#6EE7B7] text-[#1E3A8A] font-bold px-6 py-3.5 rounded-full shadow-lg hover:bg-[#4ADE80] transition-all duration-300 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={!tenantId || !tenant?.propertyId || !csrfToken}
          >
            Make a Payment
          </button>
        </section>

        {/* Payments Table */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
            <table className="w-full min-w-[800px] divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-[#1E3A8A] to-[#1E40AF] text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Type</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Date</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Trans. ID</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin w-10 h-10 border-4 border-[#1E3A8A] border-t-transparent rounded-full mb-3"></div>
                        <span className="text-sm text-gray-500">Loading payments...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedPayments.length > 0 ? (
                  displayedPayments.map((p) => (
                    <motion.tr
                      key={p._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-gray-50 transition-colors text-xs sm:text-sm"
                    >
                      <td className="px-4 py-4 font-semibold text-[#1E3A8A] capitalize">{p.type || "Other"}</td>
                      <td className="px-4 py-4">KES {p.amount.toLocaleString()}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                            p.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : p.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-600">
                        {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-KE") : "—"}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-gray-600 max-w-[100px] truncate" title={p.transactionId}>
                        {p.transactionId}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => generateReceipt(p._id)}
                          disabled={p.status !== "completed"}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#1E40AF] disabled:bg-gray-300 disabled:text-gray-500 transition-all"
                        >
                          <Download size={14} />
                          <span className="hidden xxs:inline">Receipt</span>
                        </button>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-gray-500">
                      <p className="text-lg font-medium">No payment records found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-5 bg-gray-50 border-t">
              <div className="text-xs sm:text-sm text-gray-600 order-2 sm:order-1">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} payments)
              </div>

              <div className="flex items-center gap-2 order-1 sm:order-2 flex-wrap justify-center">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || loading}
                  className="flex items-center gap-1 px-4 py-2.5 text-xs font-medium rounded-lg bg-white border border-gray-300 text-[#1E3A8A] hover:bg-[#6EE7B7]/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={16} /> Prev
                </button>

                <div className="flex gap-1.5">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let num;
                    if (totalPages <= 5) num = i + 1;
                    else if (page <= 3) num = i + 1;
                    else if (page >= totalPages - 2) num = totalPages - 4 + i;
                    else num = page - 2 + i;

                    return (
                      <button
                        key={num}
                        onClick={() => handlePageChange(num)}
                        className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                          num === page
                            ? "bg-[#1E3A8A] text-white"
                            : "bg-white border border-gray-300 text-[#1E3A8A] hover:bg-[#6EE7B7]/10"
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                  {totalPages > 5 && page < totalPages - 2 && (
                    <>
                      <span className="px-2 text-gray-400">...</span>
                      <button
                        onClick={() => handlePageChange(totalPages)}
                        className="w-9 h-9 rounded-lg text-xs font-medium bg-white border border-gray-300 text-[#1E3A8A] hover:bg-[#6EE7B7]/10"
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages || loading}
                  className="flex items-center gap-1 px-4 py-2.5 text-xs font-medium rounded-lg bg-white border border-gray-300 text-[#1E3A8A] hover:bg-[#6EE7B7]/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Payment Modal */}
        <AnimatePresence key="payment-modal">
          {isModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setIsModalOpen(false)}
            >
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 30 }}
                className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-[#1E3A8A] mb-6">Make a Payment</h2>

                  <div className="space-y-5">
                    <label className="block">
                      <span className="text-sm font-semibold text-[#1E3A8A]">Payment Type</span>
                      <select
                        className="mt-2 block w-full rounded-xl border border-gray-300 py-3.5 px-4 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] bg-gray-50 text-sm"
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value as any)}
                      >
                        <option value="Rent">Rent</option>
                        <option value="Utility">Utility</option>
                        <option value="Deposit">Deposit</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold text-[#1E3A8A]">Amount (KES)</span>
                      <input
                        type="number"
                        min="10"
                        className="mt-2 block w-full rounded-xl border border-gray-300 py-3.5 px-4 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] bg-gray-50 text-sm"
                        value={amount || ""}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        placeholder="Minimum 10"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold text-[#1E3A8A]">Phone Number</span>
                      <input
                        type="text"
                        className="mt-2 block w-full rounded-xl border border-gray-300 py-3.5 px-4 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] bg-gray-50 text-sm"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+2547xxxxxxxx or 07xxxxxxxx"
                      />
                    </label>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-3.5 px-6 bg-gray-100 text-[#1E3A8A] font-semibold rounded-xl hover:bg-gray-200 transition text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePayment}
                      disabled={isProcessing || amount < 10 || !validatePhoneNumber(phoneNumber)}
                      className="flex-1 py-3.5 px-6 bg-[#1E3A8A] text-white font-bold rounded-xl hover:bg-[#1E40AF] disabled:bg-gray-400 transition text-sm"
                    >
                      {isProcessing ? "Processing..." : "Pay Now"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Processing / Status Overlay */}
        <AnimatePresence key="processing-overlay">
          {(isProcessing || messages.length > 0) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
              onClick={() => {
                if (!isProcessing) {
                  setMessages([]);
                  setIsProcessing(false);
                }
              }}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
                onClick={(e) => e.stopPropagation()}
              >
                {isProcessing && (
                  <div className="w-20 h-20 mx-auto mb-6 relative">
                    <motion.div
                      className="absolute inset-0 border-8 border-[#6EE7B7]/30 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-0 border-8 border-t-[#1E3A8A] border-l-[#1E3A8A] border-b-transparent border-r-transparent rounded-full"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                )}

                <h3 className="text-xl font-bold text-[#1E3A8A] mb-3">
                  {isProcessing ? "Processing Payment..." : "Payment Update"}
                </h3>

                {isProcessing && (
                  <p className="text-sm text-gray-600 mb-6">
                    Please complete the M-Pesa prompt on your phone
                  </p>
                )}

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl flex items-start gap-3 text-left text-sm ${
                        msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {msg.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                      <div>
                        <p className="font-medium">{msg.text}</p>
                        <p className="text-xs opacity-75 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {!isProcessing && messages.length > 0 && (
                  <button
                    onClick={() => {
                      setMessages([]);
                      setIsProcessing(false);
                    }}
                    className="mt-6 w-full py-3.5 bg-[#1E3A8A] text-white font-bold rounded-xl hover:bg-[#1E40AF] transition"
                  >
                    Close
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}