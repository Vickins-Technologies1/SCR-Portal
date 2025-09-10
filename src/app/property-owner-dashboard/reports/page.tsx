"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { FileText, BarChart2, ArrowUpDown, Download } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(BarElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend);

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
  tenantPaymentStatus: string;
  type: string;
  unitType?: string;
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [paymentType, setPaymentType] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reportSortConfig, setReportSortConfig] = useState<SortConfig<Report>>({ key: "date", direction: "desc" });
  const [invoiceSortConfig, setInvoiceSortConfig] = useState<SortConfig<Invoice>>({ key: "createdAt", direction: "desc" });

  // Helper function to validate and format date
  const isValidDate = (dateString: string): boolean => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString().split("T")[0];
  };

  const formatDate = (dateString: string): string => {
    if (!isValidDate(dateString)) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Generate all months between two dates
  const getAllMonths = (start: string, end: string): string[] => {
    const startDate = isValidDate(start) ? new Date(start) : new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1);
    const endDate = isValidDate(end) ? new Date(end) : new Date();
    const months: string[] = [];
    // eslint-disable-next-line prefer-const
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (current <= endDate) {
      months.push(current.toLocaleString("default", { year: "numeric", month: "short" }));
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  };

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

  // Fetch user data for wallet balance
  const fetchUserData = useCallback(async () => {
    if (!userId || !role) return;
    try {
      const res = await fetch(`/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.user.walletBalance || 0);
      } else {
        if (res.status === 404) {
          setError("User account not found. Please log in again.");
          Cookies.remove("userId");
          Cookies.remove("role");
          router.push("/login");
        } else {
          setError(data.message || "Failed to fetch user data.");
        }
      }
    } catch {
      setError("Failed to connect to the server. Please try again later.");
    }
  }, [userId, role, router]);

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
      const queryParams = new URLSearchParams();
      if (selectedPropertyId !== "all") queryParams.append("propertyId", selectedPropertyId);
      if (startDate && isValidDate(startDate)) queryParams.append("startDate", startDate);
      if (endDate && isValidDate(endDate)) queryParams.append("endDate", endDate);
      if (paymentType !== "all") queryParams.append("type", paymentType);
      const query = queryParams.toString() ? `?${queryParams}` : "";
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
  }, [userId, selectedPropertyId, startDate, endDate, paymentType]);

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

  // Fetch data when userId, role, or filters change
  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchProperties();
      if (activeTab === "reports") {
        fetchReports();
      } else {
        fetchInvoices();
        fetchUserData();
      }
    }
  }, [userId, role, activeTab, selectedPropertyId, startDate, endDate, paymentType, fetchProperties, fetchReports, fetchInvoices, fetchUserData]);

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

  // Handle date range change with validation
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "startDate") {
      if (endDate && value && isValidDate(value) && isValidDate(endDate) && new Date(value) > new Date(endDate)) {
        setError("Start date cannot be after end date.");
        return;
      }
      setStartDate(value);
    }
    if (name === "endDate") {
      if (startDate && value && isValidDate(startDate) && isValidDate(value) && new Date(value) < new Date(startDate)) {
        setError("End date cannot be before start date.");
        return;
      }
      setEndDate(value);
    }
    setError(null);
    setSuccessMessage(null);
  };

  // Handle payment type change
  const handlePaymentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPaymentType(e.target.value);
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
          const dateA = new Date(a[key]).getTime();
          const dateB = new Date(b[key]).getTime();
          if (isNaN(dateA) && isNaN(dateB)) return 0;
          if (isNaN(dateA)) return direction === "asc" ? 1 : -1;
          if (isNaN(dateB)) return direction === "asc" ? -1 : 1;
          return direction === "asc" ? dateA - dateB : dateB - dateA;
        }
        return direction === "asc"
          ? String(a[key] || "N/A").localeCompare(String(b[key] || "N/A"))
          : String(b[key] || "N/A").localeCompare(String(a[key] || "N/A"));
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
          ? String(a[key]).localeCompare(String(b[key]))
          : String(b[key]).localeCompare(String(a[key]));
      });
      setInvoices(sortedInvoices);
      return { key, direction };
    });
  }, [invoices]);

  // Get sort icon for table headers
  const getSortIcon = useCallback(<T extends Report | Invoice>(key: keyof T, sortConfig: SortConfig<T>) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, []);

  // Calculate total revenue for selected property
  const totalRevenue = reports.reduce((sum, report) => sum + (selectedPropertyId === "all" || report.propertyId === selectedPropertyId ? report.revenue : 0), 0);

  // Export reports as PDF
  const exportToPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reports,
          selectedPropertyId,
          paymentType,
          startDate,
          endDate,
          totalRevenue,
          properties,
        }),
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
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `reports_${new Date().toISOString().split("T")[0]}.pdf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSuccessMessage("Report PDF exported successfully!");
      } else {
        setError(data.message || "Failed to generate PDF.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsExporting(false);
    }
  }, [reports, selectedPropertyId, paymentType, startDate, endDate, totalRevenue, properties]);

  // Prepare chart data for revenue trends
  const chartLabels = getAllMonths(startDate, endDate);
  const chartData = chartLabels.reduce((acc, month) => {
    acc[month] = reports
      .filter((report) => {
        if (selectedPropertyId !== "all" && report.propertyId !== selectedPropertyId) return false;
        if (!isValidDate(report.date)) return false;
        if (paymentType !== "all" && report.type !== paymentType) return false;
        const reportMonth = new Date(report.date).toLocaleString("default", { year: "numeric", month: "short" });
        return reportMonth === month;
      })
      .reduce((sum, report) => sum + report.revenue, 0);
    return acc;
  }, {} as Record<string, number>);
  const chartValues = chartLabels.map((label) => chartData[label] || 0);

  const barChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: `Revenue (Ksh) - ${paymentType === "all" ? "All Types" : paymentType}`,
        data: chartValues,
        backgroundColor: "rgba(1, 42, 74, 0.8)",
        borderColor: "#012a4a",
        borderWidth: 1,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    scales: {
      x: {
        title: {
          display: true,
          text: "Month",
        },
      },
      y: {
        title: {
          display: true,
          text: "Revenue (Ksh)",
        },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: {
        display: true,
      },
      tooltip: {
        enabled: true,
      },
    },
  };

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
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={handlePropertyChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
                >
                  <option value="all">All Properties</option>
                  {properties.map((property) => (
                    <option key={property._id} value={property._id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Type</label>
                <select
                  value={paymentType}
                  onChange={handlePaymentTypeChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
                >
                  <option value="all">All Types</option>
                  <option value="Rent">Rent</option>
                  <option value="Utility">Utility</option>
                  <option value="Deposit">Deposit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={startDate}
                  onChange={handleDateChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={endDate}
                  onChange={handleDateChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base border-gray-300"
                />
              </div>
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
          {activeTab === "reports" && (
            <>
              <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
                <h2 className="text-lg font-semibold text-gray-800">Total Revenue</h2>
                <p className="text-2xl font-bold text-[#012a4a]">
                  Ksh {totalRevenue.toFixed(2)}
                </p>
                <p className="text-sm text-gray-600">
                  For {selectedPropertyId === "all" ? "all properties" : `selected property${reports.length > 0 && reports[0].unitType ? " (" + reports[0].unitType + ")" : ""}`}{" "}
                  {paymentType === "all" ? "all payment types" : paymentType}{" "}
                  {startDate && endDate ? `from ${startDate} to ${endDate}` : ""}
                </p>
              </div>
              <div className="mb-6">
                <button
                  onClick={exportToPDF}
                  disabled={isExporting}
                  className={`flex items-center gap-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#013a6a] transition ${isExporting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Download className="h-5 w-5" />
                  {isExporting ? "Exporting..." : "Export Reports as PDF"}
                </button>
              </div>
              {chartLabels.length > 0 && (
                <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Revenue Trends</h2>
                  <Bar data={barChartData} options={barChartOptions} />
                </div>
              )}
            </>
          )}
          {activeTab === "invoices" && (
            <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Wallet Balance</h2>
              <p className="text-2xl font-bold text-[#012a4a]">
                Ksh {walletBalance !== null ? walletBalance.toFixed(2) : "Loading..."}
              </p>
              <p className="text-sm text-gray-600">
                Current balance available for property management
              </p>
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
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("type")}
                      >
                        Type {getSortIcon("type", reportSortConfig)}
                      </th>
                      {selectedPropertyId !== "all" && (
                        <th
                          className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                          onClick={() => handleReportSort("unitType")}
                        >
                          Unit Type {getSortIcon("unitType", reportSortConfig)}
                        </th>
                      )}
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleReportSort("tenantPaymentStatus")}
                      >
                        Tenant Payment Status {getSortIcon("tenantPaymentStatus", reportSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report._id} className="border-t hover:bg-gray-50 transition">
                        <td className="px-4 py-3">{report.propertyName}</td>
                        <td className="px-4 py-3">{report.tenantName}</td>
                        <td className="px-4 py-3">Ksh {report.revenue.toFixed(2)}</td>
                        <td className="px-4 py-3">{formatDate(report.date)}</td>
                        <td className="px-4 py-3">{report.status}</td>
                        <td className="px-4 py-3">{report.type}</td>
                        {selectedPropertyId !== "all" && (
                          <td className="px-4 py-3">{report.unitType || "N/A"}</td>
                        )}
                        <td className="px-4 py-3">{report.tenantPaymentStatus}</td>
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