"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { FileText, BarChart2, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface Report {
  _id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  revenue: number;
  date: string;
  status: string;
  ownerId: string;
}

interface Invoice {
  _id: string;
  userId: string;
  amount: number;
  reference: string;
  status: string;
  createdAt: string;
  description: string;
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
}

interface SortConfig<T> {
  key: keyof T;
  direction: "asc" | "desc";
}

export default function ReportsAndInvoicesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"reports" | "invoices">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reportSortConfig, setReportSortConfig] = useState<SortConfig<Report>>({ key: "date", direction: "desc" });
  const [invoiceSortConfig, setInvoiceSortConfig] = useState<SortConfig<Invoice>>({ key: "createdAt", direction: "desc" });

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/login");
    }
  }, [router]);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
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

  // Fetch reports
  const fetchReports = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const query = selectedPropertyId === "all" ? "" : `?propertyId=${encodeURIComponent(selectedPropertyId)}`;
      const res = await fetch(`/api/reports${query}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setReports(data.data || []);
      } else {
        setError(data.message || "Failed to fetch reports.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, selectedPropertyId]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/invoices`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
      } else {
        setError(data.message || "Failed to fetch invoices.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch data when userId and role are set
  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchProperties();
      if (activeTab === "reports") {
        fetchReports();
      } else {
        fetchInvoices();
      }
    }
  }, [userId, role, activeTab, selectedPropertyId, fetchProperties, fetchReports, fetchInvoices]);

  // Handle tab switch
  const handleTabSwitch = (tab: "reports" | "invoices") => {
    setActiveTab(tab);
    setError(null);
    setSuccessMessage(null);
  };

  // Handle property selection
  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPropertyId(e.target.value);
    setError(null);
    setSuccessMessage(null);
  };

  // Handle report sorting
  const handleReportSort = useCallback((key: keyof Report) => {
    setReportSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedReports = [...reports].sort((a, b) => {
        if (key === "revenue") {
          return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        }
        if (key === "date") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        return direction === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setReports(sortedReports);
      return { key, direction };
    });
  }, [reports]);

  // Handle invoice sorting
  const handleInvoiceSort = useCallback((key: keyof Invoice) => {
    setInvoiceSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedInvoices = [...invoices].sort((a, b) => {
        if (key === "amount") {
          return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        }
        if (key === "createdAt") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        return direction === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setInvoices(sortedInvoices);
      return { key, direction };
    });
  }, [invoices]);

  // Get sort icon for table headers
  const getSortIcon = useCallback((key: string, sortConfig: SortConfig<any>) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              {activeTab === "reports" ? (
                <BarChart2 className="text-[#012a4a]" />
              ) : (
                <FileText className="text-[#012a4a]" />
              )}
              {activeTab === "reports" ? "Financial Reports" : "Invoices"}
            </h1>
          </div>
          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => handleTabSwitch("reports")}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === "reports"
                    ? "border-b-2 border-[#012a4a] text-[#012a4a]"
                    : "text-gray-500 hover:text-[#012a4a]"
                }`}
              >
                Reports
              </button>
              <button
                onClick={() => handleTabSwitch("invoices")}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === "invoices"
                    ? "border-b-2 border-[#012a4a] text-[#012a4a]"
                    : "text-gray-500 hover:text-[#012a4a]"
                }`}
              >
                Invoices
              </button>
            </div>
          </div>
          {activeTab === "reports" && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">Select Property</label>
              <select
                value={selectedPropertyId}
                onChange={handlePropertyChange}
                className="w-full sm:w-64 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
              >
                <option value="all">All Properties</option>
                {properties.map((property) => (
                  <option key={property._id} value={property._id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {successMessage}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading {activeTab}...</span>
            </div>
          ) : activeTab === "reports" ? (
            reports.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                No reports found for {selectedPropertyId === "all" ? "any properties" : "selected property"}.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                <table className="min-w-full table-auto text-sm md:text-base">
                  <thead className="bg-gray-200">
                    <tr>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("propertyName")}
                      >
                        Property {getSortIcon("propertyName", reportSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("tenantName")}
                      >
                        Tenant {getSortIcon("tenantName", reportSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("revenue")}
                      >
                        Revenue (Ksh) {getSortIcon("revenue", reportSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("date")}
                      >
                        Date {getSortIcon("date", reportSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("status")}
                      >
                        Status {getSortIcon("status", reportSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report._id} className="border-t hover:bg-gray-50 transition">
                        <td className="px-4 py-3">{report.propertyName}</td>
                        <td className="px-4 py-3">{report.tenantName}</td>
                        <td className="px-4 py-3">Ksh {report.revenue.toFixed(2)}</td>
                        <td className="px-4 py-3">{new Date(report.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{report.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            invoices.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                No invoices found.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                <table className="min-w-full table-auto text-sm md:text-base">
                  <thead className="bg-gray-200">
                    <tr>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleInvoiceSort("reference")}
                      >
                        Reference {getSortIcon("reference", invoiceSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleInvoiceSort("description")}
                      >
                        Description {getSortIcon("description", invoiceSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleInvoiceSort("amount")}
                      >
                        Amount (Ksh) {getSortIcon("amount", invoiceSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleInvoiceSort("createdAt")}
                      >
                        Created At {getSortIcon("createdAt", invoiceSortConfig)}
                      </th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleInvoiceSort("status")}
                      >
                        Status {getSortIcon("status", invoiceSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice._id} className="border-t hover:bg-gray-50 transition">
                        <td className="px-4 py-3">{invoice.reference}</td>
                        <td className="px-4 py-3">{invoice.description}</td>
                        <td className="px-4 py-3">Ksh {invoice.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{invoice.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}