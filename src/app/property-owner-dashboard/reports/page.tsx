"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Cookies from "js-cookie";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, BarChart2, ArrowUpDown, Download, Lock } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PaymentModal from "../components/PaymentModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useAccountTier } from "@/hooks/useAccountTier";
import PremiumGate from "@/components/PremiumGate";
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
  reference?: string;
  transactionId?: string;
  mpesaCode?: string;
  isManual?: boolean;
}

interface Invoice {
  _id: string;
  userId: string;
  propertyId: string;
  amount: number;
  reference: string;
  status: string;
  createdAt: string;
  description: string;
}

interface InvoiceEstimateItem {
  propertyId: string;
  propertyName: string;
  billingPlan: string;
  percentage: number;
  expectedIncome: number;
  estimatedAmount: number;
}

interface InvoiceEstimate {
  period: { billingMonth: string; label: string };
  total: number;
  items: InvoiceEstimateItem[];
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  address: string;
  unitTypes: {
    uniqueType?: string;
    type: string;
    price: number;
    deposit: number;
    managementType?: "RentCollection" | "FullManagement";
    quantity: number;
  }[];
  billingType?: "RentCollection" | "FullManagement";
  managementFee?: number;
  managementFeePercent?: number;
  status: string;
  rentPaymentDate?: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

interface SortConfig<T> {
  key: keyof T;
  direction: "asc" | "desc";
}

function ReportsAndInvoicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const perm = usePermissions();
  const { isFree } = useAccountTier();
  const [activeTab, setActiveTab] = useState<"reports" | "invoices">("reports");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "invoices") {
      setActiveTab("invoices");
    }
  }, [searchParams]);
  const [reports, setReports] = useState<Report[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [paymentType, setPaymentType] = useState<string>("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string>(""); // For team member context
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEstimateLoading, setIsEstimateLoading] = useState(false);
  const [invoiceEstimate, setInvoiceEstimate] = useState<InvoiceEstimate | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const canViewReports = perm.hasPermission("reports:view");
  const canExportReports = perm.hasPermission("reports:export");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [reportSortConfig, setReportSortConfig] = useState<SortConfig<Report>>({ key: "date", direction: "desc" });
  const [invoiceSortConfig, setInvoiceSortConfig] = useState<SortConfig<Invoice>>({ key: "createdAt", direction: "desc" });
  const isDue = !!dueStatus?.isDue;
  const [isInvoicePaymentOpen, setIsInvoicePaymentOpen] = useState(false);
  const [invoicePaymentPropertyId, setInvoicePaymentPropertyId] = useState<string>("");
  const [invoicePaymentPhone, setInvoicePaymentPhone] = useState<string>("");

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

  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

  const applyDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setStartDate(formatDateInput(start));
    setEndDate(formatDateInput(end));
    setError(null);
  };

  const getReportReference = (report: Report) => {
    const isManual = report.isManual ?? report.transactionId?.startsWith("MANUAL-");
    if (isManual) {
      return report.reference || report.transactionId || "—";
    }
    return report.mpesaCode || report.transactionId || "—";
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

  // Auth check + determine effective owner
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    setUserId(uid || null);
    setRole(userRole || null);

    let ownerIdToUse: string | null = null;

    if (userRole === "propertyOwner") {
      ownerIdToUse = uid || null;
    } else if (userRole === "teamMember") {
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      setError("Unauthorized. Please log in as a property owner or team member.");
      router.push("/");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      return;
    }

    const allowed = userRole === "propertyOwner" || canViewReports;
    setHasAccess(allowed);

    if (!allowed) {
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router, canViewReports]);

  const fetchDueStatus = useCallback(async () => {
    if (!userId || !["propertyOwner", "teamMember"].includes(role ?? "")) return;
    try {
      const res = await fetch("/api/owner-dues", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setDueStatus(data);
      }
    } catch {
      // ignore
    }
  }, [userId, role]);

  useEffect(() => {
    fetchDueStatus();
  }, [fetchDueStatus]);

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
      } catch {
        setError("Failed to fetch CSRF token.");
      }
    };
    fetchCsrf();
  }, []);

  // Fetch owner name (for context)
  const fetchOwnerInfo = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;

    try {
      const res = await fetch(`/api/user?userId=${effectiveOwnerId}&role=propertyOwner`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.user) {
        setOwnerName(data.user.name || "Property Owner");
      }
    } catch (err) {
      console.error("Failed to fetch owner name:", err);
    }
  }, [effectiveOwnerId, csrfToken]);

  // Fetch user wallet (scoped to effective owner)
  const fetchUserData = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/user?userId=${encodeURIComponent(effectiveOwnerId)}&role=propertyOwner`, {
        method: "GET",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.user.walletBalance || 0);
      } else {
        setError(data.message || "Failed to fetch user data.");
      }
    } catch {
      setError("Failed to connect to server.");
    }
  }, [effectiveOwnerId, csrfToken]);

  // Fetch properties (scoped to effective owner)
  const fetchProperties = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(effectiveOwnerId)}`, {
        method: "GET",
        headers: { "x-csrf-token": csrfToken },
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
  }, [effectiveOwnerId, csrfToken]);

  // Fetch reports (scoped to effective owner)
  const fetchReports = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("userId", effectiveOwnerId);
      if (selectedPropertyId !== "all") queryParams.append("propertyId", selectedPropertyId);
      if (startDate && isValidDate(startDate)) queryParams.append("startDate", startDate);
      if (endDate && isValidDate(endDate)) queryParams.append("endDate", endDate);
      if (paymentType !== "all") queryParams.append("type", paymentType);

      const query = queryParams.toString() ? `?${queryParams}` : "";
      const res = await fetch(`/api/reports${query}`, {
        method: "GET",
        headers: { "x-csrf-token": csrfToken },
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
  }, [effectiveOwnerId, csrfToken, selectedPropertyId, startDate, endDate, paymentType]);

  // Fetch invoices (scoped to effective owner)
  const fetchInvoices = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?userId=${encodeURIComponent(effectiveOwnerId)}&billingPlan=RentCollection,FullManagement`, {
        method: "GET",
        headers: { "x-csrf-token": csrfToken },
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
  }, [effectiveOwnerId, csrfToken]);

  const fetchInvoiceEstimate = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    setIsEstimateLoading(true);
    try {
      const res = await fetch("/api/invoices/estimate", {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setInvoiceEstimate(data);
      } else {
        setInvoiceEstimate(null);
      }
    } catch {
      setInvoiceEstimate(null);
    } finally {
      setIsEstimateLoading(false);
    }
  }, [effectiveOwnerId, csrfToken]);

  const paymentModalProperties = useMemo(
    () =>
      properties.map((property) => ({
        ...property,
        _id: property._id,
        ownerId: property.ownerId,
        address: property.address || "",
        createdAt:
          property.createdAt instanceof Date
            ? property.createdAt.toISOString()
            : (property.createdAt as string),
        updatedAt:
          property.updatedAt instanceof Date
            ? property.updatedAt.toISOString()
            : (property.updatedAt as string | undefined),
        unitTypes: (property.unitTypes || []).map((unit, index) => ({
          uniqueType: unit.uniqueType ?? `${unit.type}-${index}`,
          type: unit.type,
          price: unit.price,
          deposit: unit.deposit,
          managementType: unit.managementType ?? property.billingType ?? "RentCollection",
          quantity: unit.quantity,
        })),
      })),
    [properties]
  );

  // Load data when effectiveOwnerId is ready
  useEffect(() => {
    if (hasAccess && effectiveOwnerId && csrfToken) {
      Promise.all([
        fetchOwnerInfo(),
        fetchProperties(),
        fetchUserData(),
        activeTab === "reports" ? fetchReports() : Promise.all([fetchInvoices(), fetchInvoiceEstimate()]),
      ]).catch(() => setError("Failed to load initial data."));
    }
  }, [
    effectiveOwnerId,
    csrfToken,
    activeTab,
    selectedPropertyId,
    startDate,
    endDate,
    paymentType,
    hasAccess,
    fetchOwnerInfo,
    fetchProperties,
    fetchUserData,
    fetchReports,
    fetchInvoices,
    fetchInvoiceEstimate,
  ]);

  // Tab switch
  const handleTabSwitch = (tab: "reports" | "invoices") => {
    if (isDue && tab === "reports") return;
    setActiveTab(tab);
    setError(null);
    setSuccessMessage(null);
  };

  useEffect(() => {
    if (isDue && activeTab === "reports") {
      setActiveTab("invoices");
    }
  }, [isDue, activeTab]);

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

  // Sorting (unchanged)
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

  const handleOpenInvoicePayment = (propertyId?: string) => {
    setInvoicePaymentPropertyId(propertyId || "");
    setIsInvoicePaymentOpen(true);
  };

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

  // Export to Excel (unchanged)
  const exportToExcel = useCallback(async () => {
    if (!canExportReports) {
      setError("You do not have permission to export reports.");
      return;
    }
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
        const binaryString = atob(data.excel);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

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

  // Chart data (unchanged)
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
        backgroundColor: "rgba(66, 199, 117, 0.8)",
        borderColor: "#42c775",
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

  if (hasAccess === false) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
          <main className="max-w-7xl mx-auto">
            <div className="glass-panel rounded-3xl p-8 sm:p-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
              <Lock className="h-12 w-12 text-amber-500 mb-5" />
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-3">Access Restricted</h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mb-6">
                Your account does not have permission to view reports and invoices.
              </p>
              <button
                onClick={() => router.push("/property-owner-dashboard")}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-hover transition"
              >
                Back to Dashboard
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (hasAccess === null) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
          <main className="max-w-7xl mx-auto">
            <div className="flex justify-center items-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                {activeTab === "reports" ? (
                  <BarChart2 className="h-5 w-5 text-primary" />
                ) : (
                  <FileText className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                  {activeTab === "reports" ? "Financial Reports" : "Invoices"}
                </h1>
                {role === "teamMember" && ownerName && (
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    for {ownerName}
                  </p>
                )}
              </div>
            </div>
          </section>

          {isFree && (
            <div className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Premium only</p>
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                Reports & invoices insights are locked on Free tier
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Upgrade to Premium to access financial reports, exports, invoice analytics, and advanced statements.
              </p>
              <a
                href="/upgrade"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
              >
                Upgrade
              </a>
            </div>
          )}

          <PremiumGate
            locked={isFree}
            title="Upgrade to unlock reports & invoices"
            message="Free tier hides critical reporting, exports, and invoice analytics. Upgrade to Premium for full access."
          >
          {/* Tabs */}
          <div className="surface-card rounded-2xl px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {!isDue && (
                <button
                  onClick={() => handleTabSwitch("reports")}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition ${
                    activeTab === "reports"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  Reports
                </button>
              )}
              <button
                onClick={() => handleTabSwitch("invoices")}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition ${
                  activeTab === "invoices"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                Invoices
              </button>
            </div>
          </div>

          {/* Filters (Reports only) */}
          {activeTab === "reports" && (
            <div className="surface-card rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-tour="owner-report-filters">
              <div className="col-span-full flex flex-wrap gap-2">
                <button
                  onClick={() => applyDatePreset(7)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  Last 7 days
                </button>
                <button
                  onClick={() => applyDatePreset(30)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  Last 30 days
                </button>
                <button
                  onClick={() => applyDatePreset(90)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  Last 90 days
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={handlePropertyChange}
                  className="mt-2 w-full border border-gray-200 px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
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
                <label className="block text-xs font-medium text-gray-600">Payment Type</label>
                <select
                  value={paymentType}
                  onChange={handlePaymentTypeChange}
                  className="mt-2 w-full border border-gray-200 px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
                >
                  <option value="all">All Types</option>
                  <option value="Rent">Rent</option>
                  <option value="Utility">Utility</option>
                  <option value="Deposit">Deposit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Start Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={startDate}
                  onChange={handleDateChange}
                  className="mt-2 w-full border border-gray-200 px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={endDate}
                  onChange={handleDateChange}
                  className="mt-2 w-full border border-gray-200 px-3 py-2.5 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition"
                />
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-xl shadow text-xs sm:text-sm animate-pulse">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-primary/10 text-primary p-3 rounded-xl shadow text-xs sm:text-sm animate-pulse">
              {successMessage}
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === "reports" && (
            <>
              {/* Total Revenue */}
              <div className="surface-card rounded-2xl p-5 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Total Revenue</h2>
                <p className="text-xl sm:text-2xl font-semibold text-primary">
                  Ksh {totalRevenue.toFixed(2)}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {selectedPropertyId === "all" ? "All properties" : "Selected property"} •{" "}
                  {paymentType === "all" ? "All types" : paymentType}
                  {startDate && endDate ? ` • ${startDate} to ${endDate}` : ""}
                </p>
              </div>

              {/* Export Button */}
              <div className="mb-6">
                <button
                  onClick={exportToExcel}
                  disabled={!canExportReports || isExporting || reports.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary-hover transition ${
                    !canExportReports || isExporting || reports.length === 0 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export Monthly Report (Excel)"}
                </button>
              </div>

              {/* Chart */}
              {chartLabels.length > 0 && (
                <div className="surface-card rounded-2xl p-5 sm:p-6 h-80">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">Revenue Trends</h2>
                  <div className="h-full">
                    <Bar data={barChartData} options={barChartOptions} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Invoices Tab */}
          {activeTab === "invoices" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="surface-card rounded-2xl p-5 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Wallet Balance</h2>
                <p className="text-xl sm:text-2xl font-semibold text-primary">
                  Ksh {walletBalance !== null ? walletBalance.toFixed(2) : "Loading..."}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">Available for property management</p>
              </div>

              <div className="surface-card rounded-2xl p-5 sm:p-6 lg:col-span-2" data-tour="owner-invoice-estimate">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-foreground">Next Month Invoice Estimate</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {invoiceEstimate?.period?.label || "Upcoming billing period"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs sm:text-sm text-muted-foreground">Estimated total</p>
                    <p className="text-xl sm:text-2xl font-semibold text-primary">
                      Ksh {invoiceEstimate ? invoiceEstimate.total.toFixed(2) : "—"}
                    </p>
                  </div>
                </div>

                {isEstimateLoading ? (
                  <div className="mt-4 text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Calculating estimate...
                  </div>
                ) : invoiceEstimate?.items?.length ? (
                  <div className="mt-4 space-y-2 text-xs sm:text-sm text-muted-foreground">
                    {invoiceEstimate.items.map((item) => (
                      <div key={item.propertyId} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                        <div>
                          <p className="font-semibold text-foreground">{item.propertyName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.billingPlan} • {item.percentage.toFixed(2)}% • Expected income Ksh {item.expectedIncome.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right font-semibold text-foreground">
                          Ksh {item.estimatedAmount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-xs sm:text-sm text-muted-foreground">
                    No estimate available yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="text-center text-muted-foreground text-xs sm:text-sm py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span className="ml-2">Loading {activeTab}...</span>
            </div>
          ) : activeTab === "reports" ? (
            reports.length === 0 ? (
              <div className="surface-card rounded-2xl p-6 text-muted-foreground text-center text-xs sm:text-sm">
                No reports found.
              </div>
            ) : (
              <div className="table-shell" data-tour="owner-invoice-table">
                <div className="table-scroll">
                <table className="min-w-full table-auto">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("propertyName")}>
                        Property {getSortIcon("propertyName", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("tenantName")}>
                        Tenant {getSortIcon("tenantName", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("revenue")}>
                        Revenue (Ksh) {getSortIcon("revenue", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("date")}>
                        Date {getSortIcon("date", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("status")}>
                        Status {getSortIcon("status", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("reference")}>
                        Reference {getSortIcon("reference", reportSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("type")}>
                        Type {getSortIcon("type", reportSortConfig)}
                      </th>
                      {selectedPropertyId !== "all" && (
                        <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("unitType")}>
                          Unit Type {getSortIcon("unitType", reportSortConfig)}
                        </th>
                      )}
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleReportSort("tenantPaymentStatus")}>
                        Payment Status {getSortIcon("tenantPaymentStatus", reportSortConfig)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r._id} className="hover:bg-primary/5">
                        <td className="px-4 py-3">{r.propertyName}</td>
                        <td className="px-4 py-3">{r.tenantName}</td>
                        <td className="px-4 py-3">Ksh {r.revenue.toFixed(2)}</td>
                        <td className="px-4 py-3">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">{r.status}</td>
                        <td className="px-4 py-3">{getReportReference(r)}</td>
                        <td className="px-4 py-3">{r.type}</td>
                        {selectedPropertyId !== "all" && <td className="px-4 py-3">{r.unitType || "N/A"}</td>}
                        <td className="px-4 py-3">{r.tenantPaymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )
          ) : (
            invoices.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                No invoices found.
              </div>
            ) : (
              <div className="table-shell">
                <div className="table-scroll">
                <table className="min-w-full table-auto">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleInvoiceSort("reference")}>
                        Reference {getSortIcon("reference", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleInvoiceSort("description")}>
                        Description {getSortIcon("description", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleInvoiceSort("amount")}>
                        Amount (Ksh) {getSortIcon("amount", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleInvoiceSort("createdAt")}>
                        Created {getSortIcon("createdAt", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100/70" onClick={() => handleInvoiceSort("status")}>
                        Status {getSortIcon("status", invoiceSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i._id} className="hover:bg-primary/5">
                        <td className="px-4 py-3">{i.reference}</td>
                        <td className="px-4 py-3">{i.description}</td>
                        <td className="px-4 py-3">Ksh {i.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">{new Date(i.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{i.status}</td>
                        <td className="px-4 py-3">
                          {role === "propertyOwner" && i.status === "pending" ? (
                            <button
                              onClick={() => handleOpenInvoicePayment(i.propertyId)}
                              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition"
                            >
                              Pay Now
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )
          )}
          </PremiumGate>
        </main>
      </div>

      <PaymentModal
        isOpen={isInvoicePaymentOpen}
        onClose={() => setIsInvoicePaymentOpen(false)}
        onSuccess={() => {
          setIsInvoicePaymentOpen(false);
          fetchInvoices();
          fetchUserData();
          fetchInvoiceEstimate();
          fetchDueStatus();
          setSuccessMessage("Invoice payment completed successfully.");
        }}
        onError={(message) => setError(message)}
        properties={paymentModalProperties}
        initialPropertyId={invoicePaymentPropertyId}
        initialPhone={invoicePaymentPhone}
        userId={effectiveOwnerId}
      />

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}

export default function ReportsAndInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <Navbar />
          <Sidebar />
          <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
            <main className="max-w-7xl mx-auto">
              <div className="flex justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
              </div>
            </main>
          </div>
        </div>
      }
    >
      <ReportsAndInvoicesPageInner />
    </Suspense>
  );
}
















