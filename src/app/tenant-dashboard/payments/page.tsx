"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface Payment {
  _id: string;
  tenantId: string;
  propertyId: string;
  type: "Rent" | "Utility";
  amount: number;
  phoneNumber: string;
  paymentDate: string;
  transactionId: string;
  status: "completed";
  createdAt: string;
}

interface Tenant {
  _id: string;
  propertyId: string;
  walletBalance: number;
  phone: string;
}

export default function PaymentsPage() {
  const [isClient, setIsClient] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<"Rent" | "Utility">("Rent");
  const [amount, setAmount] = useState<number>(0);
  const [phoneNumber, setPhoneNumber] = useState<string>("");

  // Detect client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const id = Cookies.get("userId");
    if (!id) {
      setError("Please log in to view payments.");
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
        if (!tenantData.success || !tenantData.tenant) {
          setError(tenantData.message || "Failed to fetch tenant data");
          return;
        }
        setTenant(tenantData.tenant);
        setPhoneNumber(tenantData.tenant.phone || "");

        const paymentsRes = await fetch(`/api/tenant/payments?tenantId=${id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const paymentsData = await paymentsRes.json();
        if (paymentsData.success) {
          setPayments(paymentsData.payments || []);
        } else {
          setError(paymentsData.message || "Failed to fetch payments");
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to connect to the server");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isClient]);

  const validatePhoneNumber = (phone: string): boolean => {
    const regex = /^(?:\+2547|07)\d{8}$/;
    return regex.test(phone);
  };

  const formatPhoneNumber = (phone: string): string => {
    if (phone.startsWith("07")) return `254${phone.slice(1)}`;
    if (phone.startsWith("+")) return phone.slice(1);
    return phone;
  };

  const handlePayment = async () => {
    if (!tenantId || !tenant?.propertyId || amount <= 0 || !validatePhoneNumber(phoneNumber)) {
      setError(
        !tenantId
          ? "Please log in to make a payment."
          : !tenant?.propertyId
          ? "Tenant profile incomplete."
          : amount <= 0
          ? "Please enter a valid amount."
          : "Please enter a valid phone number (e.g., +2547xxxxxxxx or 07xxxxxxxx)."
      );
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const csrfRes = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const { csrfToken } = await csrfRes.json();

      const paymentRes = await fetch("/api/tenant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenantId,
          propertyId: tenant.propertyId,
          type: paymentType,
          amount,
          phoneNumber: formatPhoneNumber(phoneNumber),
          csrfToken,
        }),
      });
      const paymentData = await paymentRes.json();

      if (paymentData.success) {
        const tenantRes = await fetch("/api/tenant/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();
        if (tenantData.success) {
          setTenant(tenantData.tenant);
          setPhoneNumber(tenantData.tenant?.phone || "");
        }

        const updatedRes = await fetch(`/api/tenant/payments?tenantId=${tenantId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const updatedData = await updatedRes.json();
        if (updatedData.success) {
          setPayments(updatedData.payments || []);
        }

        setIsModalOpen(false);
        setAmount(0);
        setPaymentType("Rent");
      } else {
        setError(paymentData.message || "Payment failed. Please try again.");
      }
    } catch (err) {
      console.error("Payment error:", err);
      setError("Failed to process payment. Please check your connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-1">Payment History</h1>
        <p>View your past and upcoming rent or utility payments.</p>
        {tenant && (
          <p className="mt-2 text-sm">
            Wallet Balance:{" "}
            <span className="font-semibold">
              KES {typeof tenant.walletBalance === "number" ? tenant.walletBalance.toLocaleString() : "0"}
            </span>
          </p>
        )}
        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-4 bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
          disabled={!tenantId}
        >
          Make a Payment
        </button>
      </section>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

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
                        p.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
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
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
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
              {error && (
                <div className="mb-4 p-2 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
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
                  min="1"
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
                  disabled={isProcessing || amount <= 0 || !validatePhoneNumber(phoneNumber)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition"
                >
                  Pay Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Spinner */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl text-center"
            >
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
              <h3 className="text-lg font-semibold text-gray-800">Processing Payment</h3>
              <p className="text-sm text-gray-500 mt-2">
                Please check your phone and enter your M-Pesa PIN to complete the payment.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
