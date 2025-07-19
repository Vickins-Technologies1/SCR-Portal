"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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

    if (!uid || userRole !== "tenant") {
      setError("Unauthorized. Please log in as a tenant.");
      router.replace("https://app.smartchoicerentalmanagement.com/");
    } else {
      setUserId(uid);
      setRole(userRole);
    }
  }, [router]);

  const fetchPayments = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/payments?tenantId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.success) setPayments(data.payments);
      else setError(data.message || "Failed to fetch payments.");
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/properties?tenantId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.success) setProperties(data.properties);
      else setError(data.message || "Failed to fetch properties.");
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
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const getSortIcon = useCallback(
    (key: keyof Payment | "propertyName") =>
      sortConfig.key === key
        ? sortConfig.direction === "asc"
          ? <span className="inline ml-1">↑</span>
          : <span className="inline ml-1">↓</span>
        : <ArrowUpDown className="inline ml-1 h-4 w-4" />,
    [sortConfig]
  );

  const filteredPayments = useMemo(() => {
    return filterType === "All"
      ? payments
      : payments.filter((p) => p.type === filterType);
  }, [payments, filterType]);

  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments];
    const { key, direction } = sortConfig;

    sorted.sort((a, b) => {
      const dir = direction === "asc" ? 1 : -1;

      if (key === "amount") return dir * (a.amount - b.amount);
      if (key === "dueDate" || key === "paymentDate" || key === "createdAt") {
        const aDate = a[key] ? new Date(a[key]!).getTime() : 0;
        const bDate = b[key] ? new Date(b[key]!).getTime() : 0;
        return dir * (aDate - bDate);
      }
      if (key === "propertyName") {
        const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
        const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
        return dir * aName.localeCompare(bName);
      }
      return dir * String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
    });

    return sorted;
  }, [filteredPayments, sortConfig, properties]);

  const openPaymentDetails = useCallback((payment: Payment) => {
    setSelectedPayment(payment);
    setIsModalOpen(true);
  }, []);

  return (
    <main className="pt-20 px-4 md:px-8 bg-gray-50 min-h-screen animate-fade-in">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold text-gray-800 tracking-tight mb-4 flex items-center gap-2">
          <DollarSign className="text-[#1e3a8a] w-6 h-6" />
          My Payments
        </h1>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg shadow-sm mb-4">{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter by:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "All" | "Rent" | "Utilities")}
              className="border border-gray-300 px-3 py-1.5 rounded-lg shadow-sm focus:ring-2 focus:ring-[#1e3a8a] focus:outline-none text-sm"
            >
              <option value="All">All</option>
              <option value="Rent">Rent</option>
              <option value="Utilities">Utilities</option>
            </select>
            <Filter className="w-4 h-4 text-[#1e3a8a]" />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-gray-600">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#1e3a8a]" />
            <span className="ml-2">Loading payments...</span>
          </div>
        ) : sortedPayments.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-gray-600 shadow-sm">
            No payments found.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl shadow-sm ring-1 ring-gray-200">
            <table className="min-w-full table-auto text-sm text-gray-800">
              <thead className="bg-gray-100">
                <tr>
                  {["type", "propertyName", "amount", "dueDate", "status", "paymentDate"].map((key) => (
                    <th
                      key={key}
                      className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200 whitespace-nowrap"
                      onClick={() => handleSort(key as any)}
                    >
                      {key[0].toUpperCase() + key.slice(1).replace("Name", "")} {getSortIcon(key as any)}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPayments.map((p) => (
                  <tr key={p._id} className="border-t hover:bg-gray-50 transition" onClick={() => openPaymentDetails(p)}>
                    <td className="px-4 py-2">{p.type}</td>
                    <td className="px-4 py-2">
                      {properties.find((prop) => prop._id === p.propertyId)?.name || "N/A"}
                    </td>
                    <td className="px-4 py-2">Ksh.{p.amount.toFixed(2)}</td>
                    <td className="px-4 py-2">{new Date(p.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
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
                    <td className="px-4 py-2">
                      {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPaymentDetails(p);
                        }}
                        className="text-[#1e3a8a] hover:underline text-sm"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                ["Type", selectedPayment.type],
                ["Property", properties.find((p) => p._id === selectedPayment.propertyId)?.name || "N/A"],
                ["Amount", `Ksh.${selectedPayment.amount.toFixed(2)}`],
                ["Due Date", new Date(selectedPayment.dueDate).toLocaleDateString()],
                ["Status", selectedPayment.status],
                ["Payment Date", selectedPayment.paymentDate ? new Date(selectedPayment.paymentDate).toLocaleDateString() : "N/A"],
              ].map(([label, value], idx) => (
                <div key={idx}>
                  <label className="block text-gray-700 font-medium">{label}</label>
                  <p className="bg-gray-100 rounded px-3 py-2 mt-1">{value}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      </div>
    </main>
  );
}
