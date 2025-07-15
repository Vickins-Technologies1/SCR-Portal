"use client";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { useState, useEffect } from "react";
import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayments = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/payments", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (data.success) {
          setPayments(data.payments || []);
        } else {
          setError(data.message || "Failed to fetch payments");
        }
      } catch (err) {
        console.error("Fetch payments error:", err);
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayments();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />
      <Sidebar />

      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {/* Header */}
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2">
            <CreditCard size={28} className="text-[#03a678]" />
            Payments
          </h1>

          {/* Error or Loading */}
          {error && (
            <p className="text-red-600 text-sm mb-6">{error}</p>
          )}
          {isLoading && (
            <p className="text-gray-600 text-sm mb-6">Loading payments...</p>
          )}

          {/* Payments List */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Payment History</h2>
            {payments.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600">
                No payments found. Payment history will appear here once recorded.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700">
                      <th className="px-6 py-4 font-semibold">Tenant</th>
                      <th className="px-6 py-4 font-semibold">Property</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment: any) => (
                      <tr key={payment.id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-6 py-4">{payment.tenantName}</td>
                        <td className="px-6 py-4">{payment.propertyName}</td>
                        <td className="px-6 py-4">${payment.amount.toFixed(2)}</td>
                        <td className="px-6 py-4">{new Date(payment.date).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                              payment.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {payment.status || "N/A"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}