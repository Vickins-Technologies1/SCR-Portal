"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, AlertCircle } from "lucide-react";
import Cookies from "js-cookie";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

// TypeScript Interfaces
interface Payment {
  _id: string;
  tenantId: string;
  tenantName: string;
  propertyId: string;
  propertyName: string;
  amount: number;
  date: string;
  status: string;
  ownerId: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/** Payment Row Component */
const PaymentRow = ({ payment, properties }: { payment: Payment; properties: { _id: string; name: string }[] }) => (
  <tr className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-200">
    <td className="px-6 py-4">{payment.tenantName}</td>
    <td className="px-6 py-4">{properties.find((p) => p._id === payment.propertyId)?.name || "Unassigned"}</td>
    <td className="px-6 py-4">Ksh. {payment.amount.toFixed(2)}</td>
    <td className="px-6 py-4">{new Date(payment.date).toLocaleDateString()}</td>
    <td className="px-6 py-4">
      <span
        className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
          payment.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
        }`}
      >
        {payment.status || "N/A"}
      </span>
    </td>
  </tr>
);

/** PaymentsPage Component */
export default function PaymentsPage() {
  const router = useRouter();
  const [propertyOwnerId, setPropertyOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<{ _id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Load authentication from cookies */
  useEffect(() => {
    const ownerId = Cookies.get("userId"); // Cookie name set by /api/signin
    const r = Cookies.get("role");
    if (!ownerId || r !== "propertyOwner") {
      router.replace("/");
      return;
    }
    setPropertyOwnerId(ownerId);
    setRole(r);
  }, [router]);

  /** Fetch payments and properties data */
  useEffect(() => {
    if (!propertyOwnerId || role !== "propertyOwner") return;

    const fetchPayments = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [paymentsRes, propertiesRes] = await Promise.all([
          fetch(`/api/payments?propertyOwnerId=${encodeURIComponent(propertyOwnerId)}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/properties?userId=${encodeURIComponent(propertyOwnerId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        if (!paymentsRes.ok || !propertiesRes.ok) {
          throw new Error(`HTTP error! Payments: ${paymentsRes.status}, Properties: ${propertiesRes.status}`);
        }

        const [paymentsData, propertiesData] = await Promise.all([
          paymentsRes.json() as Promise<ApiResponse<Payment[]>>,
          propertiesRes.json() as Promise<ApiResponse<{ _id: string; name: string }[]>>,
        ]);

        if (!paymentsData.success || !propertiesData.success) {
          throw new Error(paymentsData.message || propertiesData.message || "Failed to fetch data");
        }

        setPayments(paymentsData.data || []);
        setProperties(propertiesData.data || []);
      } catch (err) {
        console.error("Fetch payments error:", err);
        setError("Failed to load payments data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayments();
  }, [propertyOwnerId, role]);

  // Memoize payment rows to prevent unnecessary re-renders
  const paymentRows = useMemo(
    () =>
      payments.map((payment) => (
        <PaymentRow key={payment._id} payment={payment} properties={properties} />
      )),
    [payments, properties]
  );

  if (!propertyOwnerId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#03a678] border-solid"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {/* Header */}
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2 animate-fade-in">
            <CreditCard size={28} className="text-[#03a678]" />
            Payments
          </h1>

          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm flex items-center gap-2 animate-fade-in">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {isLoading && (
            <div className="mb-6 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#03a678] border-solid"></div>
            </div>
          )}

          {/* Payments List */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Payment History</h2>
            {payments.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600 text-center animate-fade-in">
                No payments found. Payment history will appear here once recorded.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Tenant</th>
                        <th className="px-6 py-4 font-semibold">Property</th>
                        <th className="px-6 py-4 font-semibold">Amount (Ksh.)</th>
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>{paymentRows}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}