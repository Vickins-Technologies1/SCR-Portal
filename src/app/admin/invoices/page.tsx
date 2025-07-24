"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { FileText, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface User {
  _id: string;
  email: string;
  role: "tenant" | "propertyOwner" | "admin";
}

interface Property {
  _id: string;
  name: string;
}

interface Invoice {
  _id: string;
  paymentId: string;
  userId: string;
  propertyId: string;
  unitType: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  createdAt: string;
  dueDate: string;
}

interface SortConfig {
  key: keyof Invoice | "userEmail" | "propertyName";
  direction: "asc" | "desc";
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "admin") {
      setError("Unauthorized. Please log in as an admin.");
      router.push("/admin/login");
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invoicesRes, usersRes, propertiesRes] = await Promise.all([
        fetch("/api/invoices", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/users", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/properties", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
      ]);
      const [invoicesData, usersData, propertiesData] = await Promise.all([
        invoicesRes.json(),
        usersRes.json(),
        propertiesRes.json(),
      ]);
      if (invoicesData.success && usersData.success && propertiesData.success) {
        setInvoices(invoicesData.invoices || []);
        setPropertyOwners(usersData.users.filter((u: User) => u.role === "propertyOwner") || []);
        setProperties(propertiesData.properties || []);
      } else {
        setError("Failed to fetch data.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") {
      fetchData();
    }
  }, [userId, role, fetchData]);

  const handleSort = useCallback((key: keyof Invoice | "userEmail" | "propertyName") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...invoices].sort((a, b) => {
        if (key === "amount") {
          return direction === "asc" ? a.amount - b.amount : b.amount - a.amount;
        }
        if (key === "createdAt" || key === "dueDate") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        if (key === "propertyName") {
          const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
          const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
          return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }
        if (key === "userEmail") {
          const aEmail = propertyOwners.find((u) => u._id === a.userId)?.email || "";
          const bEmail = propertyOwners.find((u) => u._id === b.userId)?.email || "";
          return direction === "asc" ? aEmail.localeCompare(bEmail) : bEmail.localeCompare(aEmail);
        }
        return direction === "asc"
          ? String(a[key] ?? "").localeCompare(String(b[key] ?? ""))
          : String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
      });
      setInvoices(sorted);
      return { key, direction };
    });
  }, [invoices, propertyOwners, properties]);

  const getSortIcon = useCallback((key: keyof Invoice | "userEmail" | "propertyName") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const handleGenerateInvoice = useCallback(async (invoice: Invoice) => {
    try {
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId: invoice._id,
          userEmail: propertyOwners.find((u) => u._id === invoice.userId)?.email || "N/A",
          propertyName: properties.find((p) => p._id === invoice.propertyId)?.name || "N/A",
          unitType: invoice.unitType,
          amount: invoice.amount,
          createdAt: invoice.createdAt,
          dueDate: invoice.dueDate,
          status: invoice.status,
        }),
      });
      const data = await res.json();
      if (data.success && data.pdf) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.pdf}`;
        link.download = `invoice-${invoice._id}.pdf`;
        link.click();
      } else {
        setError(data.message || "Failed to generate invoice.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [propertyOwners, properties]);

  const handleStatusChange = useCallback(async (invoiceId: string, newStatus: "pending" | "paid" | "overdue") => {
    try {
      const res = await fetch("/api/invoices/update-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invoiceId, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice._id === invoiceId ? { ...invoice, status: newStatus } : invoice
          )
        );
      } else {
        setError(data.message || "Failed to update invoice status.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <FileText className="text-[#012a4a] h-6 w-6" />
            Invoices
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {invoices.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                  No invoices found.
                </div>
              ) : (
                invoices.map((i, index) => (
                  <div
                    key={i._id}
                    className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transform transition-all duration-300 hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="text-[#012a4a] h-5 w-5" />
                      <h3 className="text-lg font-semibold text-[#012a4a] cursor-pointer" onClick={() => handleSort("amount")}>
                        Ksh {i.amount.toFixed(2)} {getSortIcon("amount")}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("userEmail")}>
                      <span className="font-medium">Owner:</span>{" "}
                      {propertyOwners.find((u) => u._id === i.userId)?.email || "N/A"} {getSortIcon("userEmail")}
                    </p>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("propertyName")}>
                      <span className="font-medium">Property:</span>{" "}
                      {properties.find((p) => p._id === i.propertyId)?.name || "N/A"} {getSortIcon("propertyName")}
                    </p>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("unitType")}>
                      <span className="font-medium">Unit:</span> {i.unitType} {getSortIcon("unitType")}
                    </p>
                    <div className="text-sm text-gray-600 mb-1 flex items-center">
                      <span className="font-medium mr-2">Status:</span>
                      <select
                        value={i.status}
                        onChange={(e) => handleStatusChange(i._id, e.target.value as "pending" | "paid" | "overdue")}
                        className={`text-sm p-1 rounded border ${i.status === "paid" ? "text-green-600 border-green-600" : i.status === "overdue" ? "text-red-600 border-red-600" : "text-yellow-600 border-yellow-600"} bg-white`}
                      >
                        <option value="pending" className="text-yellow-600">pending</option>
                        <option value="paid" className="text-green-600">paid</option>
                        <option value="overdue" className="text-red-600">overdue</option>
                      </select>
                      {getSortIcon("status")}
                    </div>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("createdAt")}>
                      <span className="font-medium">Created:</span> {new Date(i.createdAt).toLocaleDateString()} {getSortIcon("createdAt")}
                    </p>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("dueDate")}>
                      <span className="font-medium">Due:</span> {new Date(i.dueDate).toLocaleDateString()} {getSortIcon("dueDate")}
                    </p>
                    <button
                      onClick={() => handleGenerateInvoice(i)}
                      className="mt-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] hover:scale-105 transform transition-all duration-300 text-sm"
                    >
                      Generate PDF
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.5s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}