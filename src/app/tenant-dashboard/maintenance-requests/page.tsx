"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";

interface Payment {
  _id: string;
  tenantId: string;
  propertyId: string;
  type: string;
  amount: number;
  dueDate: string;
  status: "Paid" | "Unpaid" | "Overdue";
  paymentDate?: string;
  createdAt: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const tenantId = Cookies.get("userId");

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tenant/payments?tenantId=${tenantId}`);
        const data = await res.json();
        if (data.success) {
          setPayments(data.payments || []);
        } else {
          console.error("Fetch failed:", data.message);
        }
      } catch (err) {
        console.error("Error fetching payments:", err);
      } finally {
        setLoading(false);
      }
    };

    if (tenantId) fetchPayments();
  }, [tenantId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-1">Payment History</h1>
        <p>View your past and upcoming rent or utility payments.</p>
      </section>

      {/* Payment Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount (KES)</th>
              <th className="px-4 py-2">Due Date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Payment Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.length > 0 ? (
              payments.map((p) => (
                <tr key={p._id}>
                  <td className="px-4 py-2 font-medium">{p.type}</td>
                  <td className="px-4 py-2">KES {p.amount.toLocaleString()}</td>
                  <td className="px-4 py-2">{new Date(p.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        p.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : p.status === "Unpaid"
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                  {loading ? "Loading payments..." : "No payment records found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
