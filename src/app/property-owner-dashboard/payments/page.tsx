"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { AlertCircle, DollarSign } from "lucide-react";
import Cookies from "js-cookie";
import axios from "axios";

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: string;
}

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  status: string;
  paymentStatus: string;
  leaseStartDate: string;
  walletBalance: number;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load cookies
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    console.log("PaymentsPage - Cookies - userId:", uid, "role:", r);
    if (!uid || r !== "tenant") {
      router.replace("/");
    } else {
      setUserId(uid);
      setRole(r);
    }
  }, [router]);

  // Fetch tenant and payment data
  useEffect(() => {
    if (!userId || role !== "tenant") return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Guard against null userId
        if (typeof userId !== "string") {
          console.error("Invalid userId:", userId);
          router.replace("/");
          return;
        }

        const [tenantRes, paymentsRes] = await Promise.all([
          axios.get(`/api/tenants?userId=${encodeURIComponent(userId)}&tenantId=${encodeURIComponent(userId)}&role=tenant`, {
            headers: { "Content-Type": "application/json" },
            withCredentials: true,
          }),
          axios.get(`/api/payments?tenantId=${encodeURIComponent(userId)}&userId=${encodeURIComponent(userId)}&role=tenant`, {
            headers: { "Content-Type": "application/json" },
            withCredentials: true,
          }),
        ]);

        console.log("Tenant response:", tenantRes.data);
        console.log("Payments response:", paymentsRes.data);

        if (!tenantRes.data.success || !paymentsRes.data.success) {
          throw new Error("Failed to fetch data");
        }

        const tenantData = tenantRes.data.tenants.find((t: Tenant) => t._id === userId);
        if (!tenantData) {
          throw new Error("Tenant not found");
        }

        setTenant(tenantData);
        setPayments(paymentsRes.data.payments || []);
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Failed to load payment data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [userId, role, router]);

  // Handle payment submission
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (typeof userId !== "string") {
      setError("User not authenticated");
      router.replace("/");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await axios.post(
        "/api/payments",
        {
          tenantId: userId,
          amount: Number(amount),
          userId,
          role: "tenant",
        },
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );

      console.log("Payment response:", response.data);

      if (!response.data.success) {
        throw new Error(response.data.message || "Payment failed");
      }

      // Refresh tenant and payments
      const [tenantRes, paymentsRes] = await Promise.all([
        axios.get(`/api/tenants?userId=${encodeURIComponent(userId)}&tenantId=${encodeURIComponent(userId)}&role=tenant`, {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }),
        axios.get(`/api/payments?tenantId=${encodeURIComponent(userId)}&userId=${encodeURIComponent(userId)}&role=tenant`, {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }),
      ]);

      const tenantData = tenantRes.data.tenants.find((t: Tenant) => t._id === userId);
      setTenant(tenantData);
      setPayments(paymentsRes.data.payments || []);
      setAmount("");
      setError(null);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Failed to process payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userId || role !== "tenant") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Sidebar />
      <div className="lg:ml-64 mt-16 px-4 sm:px-6 md:px-8 lg:px-10 py-4 sm:py-6 transition-all duration-300">
        <main className="min-h-screen">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Payments</h1>

          {error && (
            <div className="mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm sm:text-base">
              <AlertCircle size={18} className="sm:h-5 sm:w-5" />
              {error}
            </div>
          )}
          {isLoading && (
            <div className="mb-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-sm sm:text-base">
              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-t-2 border-b-2 border-blue-600"></div>
              Loading payments...
            </div>
          )}

          {tenant && (
            <div className="mb-6 sm:mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Tenant Details</h2>
                <p className="text-sm sm:text-base text-gray-600">Name: {tenant.name}</p>
                <p className="text-sm sm:text-base text-gray-600">Email: {tenant.email}</p>
                <p className="text-sm sm:text-base text-gray-600">Monthly Rent: Ksh {tenant.price.toFixed(2)}</p>
                <p className="text-sm sm:text-base text-gray-600">Wallet Balance: Ksh {(tenant.walletBalance || 0).toFixed(2)}</p>
                <p className="text-sm sm:text-base text-gray-600">
                  Payment Status:{" "}
                  <span
                    className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-medium rounded-full ${
                      tenant.paymentStatus === "paid" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {tenant.paymentStatus}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Make a Payment</h2>
            <form onSubmit={handlePayment} className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
              <div className="mb-4">
                <label htmlFor="amount" className="block text-sm sm:text-base font-medium text-gray-700 mb-1">
                  Payment Amount (Ksh)
                </label>
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-gray-500" />
                  <input
                    type="number"
                    id="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter amount"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full p-2 sm:p-3 text-sm sm:text-base font-medium text-white rounded-lg ${
                  isSubmitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                } transition-colors duration-200`}
              >
                {isSubmitting ? "Processing..." : "Make Payment"}
              </button>
            </form>
          </div>

          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Payment History</h2>
            {payments.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 text-gray-600 text-sm sm:text-base">
                No payment history found.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-gray-50 text-gray-700">
                    <tr className="text-xs sm:text-sm">
                      <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Date</th>
                      <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Amount (Ksh)</th>
                      <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Transaction ID</th>
                      <th className="px-3 sm:px-4 py-2 sm:py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr
                        key={payment._id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150"
                      >
                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm">
                          {payment.amount.toFixed(2)}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm truncate">
                          {payment.transactionId}
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3">
                          <span
                            className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-medium rounded-full ${
                              payment.status === "completed" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}