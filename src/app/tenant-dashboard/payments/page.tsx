"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { DollarSign, Filter, ArrowUpDown } from "lucide-react";
import Modal from "../components/Modal";

interface Payment {
  _id: string;
  tenantId: string;
  propertyId: string;
  type: "Rent" | "Utilities";
  amount: number;
  dueDate: string;
  status: "Pending" | "Paid" | "Overdue";
  paymentDate?: string;
  createdAt: string;
}

interface Property {
  _id: string;
  name: string;
}

interface SortConfig {
  key: keyof Payment | "propertyName";
  direction: "asc" | "desc";
}

export default function TenantPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [filterType, setFilterType] = useState<"All" | "Rent" | "Utilities">("All");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "dueDate", direction: "desc" });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "tenant") {
      setError("Unauthorized. Please log in as a tenant.");
      router.push("/");
    }
  }, [router]);

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/payments?tenantId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
      } else {
        setError(data.message || "Failed to fetch payments.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties?tenantId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "tenant") {
      fetchPayments();
      fetchProperties();
    }
  }, [userId, role, fetchPayments, fetchProperties]);

  const handleSort = useCallback((key: keyof Payment | "propertyName") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedPayments = [...payments].sort((a, b) => {
        if (key === "amount") {
          return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        }
        if (key === "dueDate" || key === "paymentDate" || key === "createdAt") {
          const aDate = a[key] ? new Date(a[key]).getTime() : 0;
          const bDate = b[key] ? new Date(b[key]).getTime() : 0;
          return direction === "asc" ? aDate - bDate : bDate - aDate;
        }
        if (key === "propertyName") {
          const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
          const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
          return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }
        return direction === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setPayments(sortedPayments);
      return { key, direction };
    });
  }, [payments, properties]);

  const getSortIcon = useCallback((key: keyof Payment | "propertyName") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const filteredPayments = filterType === "All" ? payments : payments.filter((p) => p.type === filterType);

  const openPaymentDetails = useCallback((payment: Payment) => {
    setSelectedPayment(payment);
    setIsModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <DollarSign className="text-[#1e3a8a]" />
            My Payments
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          <div className="flex justify-end mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Filter by Type:</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "All" | "Rent" | "Utilities")}
                className="border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] transition"
              >
                <option value="All">All</option>
                <option value="Rent">Rent</option>
                <option value="Utilities">Utilities</option>
              </select>
              <Filter className="h-5 w-5 text-[#1e3a8a]" />
            </div>
          </div>
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1e3a8a]"></div>
              <span className="ml-2">Loading payments...</span>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No payments found.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("type")}
                    >
                      Type {getSortIcon("type")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("propertyName")}
                    >
                      Property {getSortIcon("propertyName")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("amount")}
                    >
                      Amount {getSortIcon("amount")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("dueDate")}
                    >
                      Due Date {getSortIcon("dueDate")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("status")}
                    >
                      Status {getSortIcon("status")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("paymentDate")}
                    >
                      Payment Date {getSortIcon("paymentDate")}
                    </th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr
                      key={p._id}
                      className="border-t hover:bg-gray-50 transition cursor-pointer"
                      onClick={() => openPaymentDetails(p)}
                    >
                      <td className="px-4 py-3">{p.type}</td>
                      <td className="px-4 py-3">
                        {properties.find((prop) => prop._id === p.propertyId)?.name || "N/A"}
                      </td>
                      <td className="px-4 py-3">Ksh.{p.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">{new Date(p.dueDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            p.status === "Paid"
                              ? "bg-green-100 text-green-700"
                              : p.status === "Pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPaymentDetails(p);
                          }}
                          className="text-[#1e3a8a] hover:text-[#1e40af] transition"
                          title="View Payment Details"
                          aria-label={`View details for payment ${p._id}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Modal
            title="Payment Details"
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedPayment(null);
            }}
          >
            {selectedPayment && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {selectedPayment.type}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Property</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {properties.find((p) => p._id === selectedPayment.propertyId)?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    Ksh.{selectedPayment.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {new Date(selectedPayment.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p
                    className={`w-full border px-3 py-2 rounded-lg ${
                      selectedPayment.status === "Paid"
                        ? "bg-green-100 text-green-700"
                        : selectedPayment.status === "Pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {selectedPayment.status}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Date</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {selectedPayment.paymentDate
                      ? new Date(selectedPayment.paymentDate).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setSelectedPayment(null);
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    aria-label="Close payment details"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
}