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

  // Helper: Validate and format date
  const isValidDate = (dateString: string): boolean => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString().split("T")[0];
  };

  const formatDate = (dateString: string): string => {
    if (!isValidDate(dateString)) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  // Generate all months between two dates
  const getAllMonths = (start: string, end: string): string[] => {
    const startDate = isValidDate(start)
      ? new Date(start)
      : new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1);
    const endDate = isValidDate(end) ? new Date(end) : new Date();
    const months: string[] = [];
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (current <= endDate) {
      months.push(current.toLocaleString("default", { year: "numeric", month: "short" }));
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  };

  // Auth check
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

  // Fetch user wallet
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
      } else if (res.status === 404) {
        setError("User not found. Please log in again.");
        Cookies.remove("userId");
        Cookies.remove("role");
        router.push("/login");
      } else {
        setError(data.message || "Failed to fetch user data.");
      }
    } catch {
      setError("Failed to connect to server.");
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
      setError("Failed to connect to server.");
    }
  }, [userId]);

  // Fetch reports
  const fetchReports = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
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
      setError("Failed to connect to server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, selectedPropertyId, startDate, endDate, paymentType]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
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
      setError("Failed to connect to server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Load data
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

  // Tab switch
  const handleTabSwitch = (tab: "reports" | "invoices") => {
    setActiveTab(tab);
    setError(null);
    setSuccessMessage(null);
  };

  // Filters
  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPropertyId(e.target.value);
    setError(null);
  };

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
  };

  const handlePaymentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPaymentType(e.target.value);
    setError(null);
  };

  // Sorting
  const handleReportSort = useCallback((key: keyof Report) => {
    setReportSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...reports].sort((a, b) => {
        if (key === "revenue") return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        if (key === "date") {
          const da = new Date(a[key]).getTime();
          const db = new Date(b[key]).getTime();
          if (isNaN(da)) return 1;
          if (isNaN(db)) return -1;
          return direction === "asc" ? da - db : db - da;
        }
        const va = String(a[key] || "N/A");
        const vb = String(b[key] || "N/A");
        return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
      setReports(sorted);
      return { key, direction };
    });
  }, [reports]);

  const handleInvoiceSort = useCallback((key: keyof Invoice) => {
    setInvoiceSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...invoices].sort((a, b) => {
        if (key === "amount") return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        if (key === "createdAt") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        return direction === "asc"
          ? String(a[key]).localeCompare(String(b[key]))
          : String(b[key]).localeCompare(String(a[key]));
      });
      setInvoices(sorted);
      return { key, direction };
    });
  }, [invoices]);

  const getSortIcon = useCallback(<T extends Report | Invoice>(key: keyof T, config: SortConfig<T>) => {
    if (config.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return config.direction === "asc" ? (
      <span className="inline ml-1">Up</span>
    ) : (
      <span className="inline ml-1">Down</span>
    );
  }, []);

  // Total revenue
  const totalRevenue = reports.reduce((sum, r) => {
    if (selectedPropertyId === "all" || r.propertyId === selectedPropertyId) return sum + r.revenue;
    return sum;
  }, 0);

  // Export to Excel
  const exportToExcel = useCallback(async () => {
    if (reports.length === 0) {
      setError("No data to export.");
      return;
    }

    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/generate-excel", {
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

      if (data.success && data.excel) {
        // Decode base64
        const binaryString = atob(data.excel);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create blob and trigger download
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Monthly_Contributions_${new Date().toISOString().split("T")[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setSuccessMessage("Excel report exported successfully!");
      } else {
        setError(data.message || "Failed to generate Excel report.");
      }
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [reports, selectedPropertyId, paymentType, startDate, endDate, totalRevenue, properties]);

  // Chart data
  const chartLabels = getAllMonths(startDate, endDate);
  const chartDataMap = chartLabels.reduce((acc, month) => {
    acc[month] = reports
      .filter((r) => {
        if (selectedPropertyId !== "all" && r.propertyId !== selectedPropertyId) return false;
        if (paymentType !== "all" && r.type !== paymentType) return false;
        const rMonth = new Date(r.date).toLocaleString("default", { year: "numeric", month: "short" });
        return rMonth === month;
      })
      .reduce((sum, r) => sum + r.revenue, 0);
    return acc;
  }, {} as Record<string, number>);

  const chartValues = chartLabels.map((m) => chartDataMap[m] || 0);

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
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: "Month" } },
      y: { title: { display: true, text: "Revenue (Ksh)" }, beginAtZero: true },
    },
    plugins: { legend: { display: true } },
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

          {/* Tabs */}
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

          {/* Filters (Reports only) */}
          {activeTab === "reports" && (
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={handlePropertyChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm border-gray-300"
                >
                  <option value="all">All Properties</option>
                  {properties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Type</label>
                <select
                  value={paymentType}
                  onChange={handlePaymentTypeChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm border-gray-300"
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
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm border-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={endDate}
                  onChange={handleDateChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm border-gray-300"
                />
              </div>
            </div>
          )}

          {/* Messages */}
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

          {/* Reports Tab */}
          {activeTab === "reports" && (
            <>
              {/* Total Revenue */}
              <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
                <h2 className="text-lg font-semibold text-gray-800">Total Revenue</h2>
                <p className="text-2xl font-bold text-[#012a4a]">
                  Ksh {totalRevenue.toFixed(2)}
                </p>
                <p className="text-sm text-gray-600">
                  {selectedPropertyId === "all" ? "All properties" : "Selected property"} •{" "}
                  {paymentType === "all" ? "All types" : paymentType}
                  {startDate && endDate ? ` • ${startDate} to ${endDate}` : ""}
                </p>
              </div>

              {/* Export Button */}
              <div className="mb-6">
                <button
                  onClick={exportToExcel}
                  disabled={isExporting || reports.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#013a6a] transition ${
                    isExporting || reports.length === 0 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Download className="h-5 w-5" />
                  {isExporting ? "Exporting..." : "Export Monthly Report (Excel)"}
                </button>
              </div>

              {/* Chart */}
              {chartLabels.length > 0 && (
                <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md h-80">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Revenue Trends</h2>
                  <div className="h-full">
                    <Bar data={barChartData} options={barChartOptions} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Invoices Tab */}
          {activeTab === "invoices" && (
            <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6 shadow-md">
              <h2 className="text-lg font-semibold text-gray-800">Wallet Balance</h2>
              <p className="text-2xl font-bold text-[#012a4a]">
                Ksh {walletBalance !== null ? walletBalance.toFixed(2) : "Loading..."}
              </p>
              <p className="text-sm text-gray-600">Available for property management</p>
            </div>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="text-center text-gray-600 py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading {activeTab}...</span>
            </div>
          ) : activeTab === "reports" ? (
            reports.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                No reports found.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                <table className="min-w-full table-auto text-sm md:text-base">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("propertyName")}>
                        Property {getSortIcon("propertyName", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("tenantName")}>
                        Tenant {getSortIcon("tenantName", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("revenue")}>
                        Revenue (Ksh) {getSortIcon("revenue", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("date")}>
                        Date {getSortIcon("date", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("status")}>
                        Status {getSortIcon("status", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("type")}>
                        Type {getSortIcon("type", reportSortConfig)}
                      </th>
                      {selectedPropertyId !== "all" && (
                        <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("unitType")}>
                          Unit Type {getSortIcon("unitType", reportSortConfig)}
                        </th>
                      )}
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleReportSort("tenantPaymentStatus")}>
                        Payment Status {getSortIcon("tenantPaymentStatus", reportSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r._id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3">{r.propertyName}</td>
                        <td className="px-4 py-3">{r.tenantName}</td>
                        <td className="px-4 py-3">Ksh {r.revenue.toFixed(2)}</td>
                        <td className="px-4 py-3">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">{r.status}</td>
                        <td className="px-4 py-3">{r.type}</td>
                        {selectedPropertyId !== "all" && <td className="px-4 py-3">{r.unitType || "N/A"}</td>}
                        <td className="px-4 py-3">{r.tenantPaymentStatus}</td>
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
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleInvoiceSort("reference")}>
                        Reference {getSortIcon("reference", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleInvoiceSort("description")}>
                        Description {getSortIcon("description", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleInvoiceSort("amount")}>
                        Amount (Ksh) {getSortIcon("amount", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleInvoiceSort("createdAt")}>
                        Created {getSortIcon("createdAt", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300" onClick={() => handleInvoiceSort("status")}>
                        Status {getSortIcon("status", invoiceSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i._id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3">{i.reference}</td>
                        <td className="px-4 py-3">{i.description}</td>
                        <td className="px-4 py-3">Ksh {i.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">{new Date(i.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{i.status}</td>
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
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}