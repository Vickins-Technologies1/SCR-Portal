"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  Receipt,
  PlusCircle,
  DollarSign,
  Wrench,
  Lightbulb,
  Hammer,
  FileText,
  AlertCircle,
  Calendar,
  Search,
  Download,
  Filter,
  TrendingUp,
  ArrowDownRight,
  X,
  Lock,
  Loader2,
  BarChart2,
  Upload,
  FileUp,
  XCircle,
  Eye,
} from "lucide-react";
import Cookies from "js-cookie";
import { motion, AnimatePresence } from "framer-motion";
import { Inter } from "next/font/google";
import { format, startOfMonth, startOfYear } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Expense {
  _id: string;
  description: string;
  amount: number;
  category: "maintenance" | "utilities" | "repairs" | "taxes" | "management" | "other";
  date: string;
  propertyName?: string;
  propertyId?: string;
  receiptUrl?: string;
  notes?: string;
}

interface Property {
  _id: string;
  name: string;
}

interface Report {
  revenue: number;
}

const categoryConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  maintenance: { icon: Wrench, color: "#10b981", bg: "#ecfdf5" },
  utilities: { icon: Lightbulb, color: "#3b82f6", bg: "#eff6ff" },
  repairs: { icon: Hammer, color: "#ef4444", bg: "#fef2f2" },
  taxes: { icon: FileText, color: "#8b5cf6", bg: "#f3e8ff" },
  management: { icon: DollarSign, color: "#f59e0b", bg: "#fffbeb" },
  other: { icon: Receipt, color: "#6b7280", bg: "#f9fafb" },
};

export default function ExpensesPage() {
  const router = useRouter();
  const perm = usePermissions();

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  // Filters & states
  const [period, setPeriod] = useState<"month" | "year" | "custom">("year");
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [isApplyingFilters, setIsApplyingFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: "maintenance" as Expense["category"],
    date: new Date().toISOString().split("T")[0],
    propertyId: "",
    notes: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // View modal
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [totalIncome, setTotalIncome] = useState(0);

  // ─── Auth & Permission Check ────────────────────────────────────────────────
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    const oid = Cookies.get("ownerId") || uid;

    if (!uid || !["propertyOwner", "teamMember"].includes(r || "")) {
      router.replace("/login");
      return;
    }

    setUserId(uid);
    setRole(r || null);
    setOwnerId(oid || null);

    let allowed = r === "propertyOwner" || perm.hasPermission("expenses:view");

    setHasAccess(allowed);

    if (!allowed) {
      setIsLoading(false);
      return;
    }

    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            token = data.csrfToken;
          }
        } catch {}
      }
      setCsrfToken(token || null);
    };

    fetchCsrf();
  }, [router, perm]);

  // Fetch properties
  useEffect(() => {
    if (!ownerId || !csrfToken || !hasAccess) return;

    const fetchProps = async () => {
      try {
        const res = await fetch(`/api/properties?userId=${ownerId}&simple=true`, {
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) setProperties(data.properties || []);
      } catch {}
    };
    fetchProps();
  }, [ownerId, csrfToken, hasAccess]);

  const buildQueryUrl = useCallback(() => {
    let url = `/api/expenses?ownerId=${ownerId}`;
    if (period === "custom" && customStart && customEnd) {
      url += `&startDate=${customStart}&endDate=${customEnd}`;
    } else {
      url += `&period=${period}`;
    }
    if (selectedProperty !== "all") url += `&propertyId=${selectedProperty}`;
    return url;
  }, [ownerId, period, customStart, customEnd, selectedProperty]);

  const fetchExpenses = useCallback(async () => {
    if (!ownerId || !csrfToken || !hasAccess) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = buildQueryUrl();
      const res = await fetch(url, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setExpenses(data.expenses || []);
      } else {
        throw new Error(data.message || "Failed");
      }
    } catch (err) {
      setError("Failed to load expenses. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [ownerId, csrfToken, hasAccess, buildQueryUrl]);

  const fetchIncome = useCallback(async () => {
    if (!ownerId || !csrfToken || !hasAccess) return;
    try {
      let url = `/api/reports?ownerId=${ownerId}&type=all`;
      if (period === "custom" && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      } else if (period === "month") {
        const now = new Date();
        url += `&startDate=${format(startOfMonth(now), "yyyy-MM-dd")}`;
      } else {
        const now = new Date();
        url += `&startDate=${format(startOfYear(now), "yyyy-MM-dd")}`;
      }
      if (selectedProperty !== "all") url += `&propertyId=${selectedProperty}`;

      const res = await fetch(url, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setTotalIncome(data.data?.reduce((sum: number, r: Report) => sum + r.revenue, 0) ?? 0);
      }
    } catch {}
  }, [ownerId, csrfToken, period, customStart, customEnd, selectedProperty, hasAccess]);

  useEffect(() => {
    if (hasAccess && csrfToken && ownerId) {
      fetchExpenses();
      fetchIncome();
    }
  }, [hasAccess, csrfToken, ownerId, fetchExpenses, fetchIncome]);

  // ─── Computed Values ─────────────────────────────────────────────────────────
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const filteredExpenses = useMemo(() =>
    expenses.filter(e =>
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    ), [expenses, searchTerm]);

  const categoryTotals = useMemo(() => expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>), [expenses]);

  const netPosition = totalIncome - totalExpenses;

  const monthlyTrend = useMemo(() => {
    const months: Record<string, number> = {};
    expenses.forEach(e => {
      const key = format(new Date(e.date), "MMM yyyy");
      months[key] = (months[key] || 0) + e.amount;
    });
    return Object.entries(months)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(-6);
  }, [expenses]);

  const maxMonthly = Math.max(...monthlyTrend.map(([, v]) => v), 1);

  // ─── Action Handlers ────────────────────────────────────────────────────────
  const handleApplyFilters = async () => {
    setIsApplyingFilters(true);
    await Promise.all([fetchExpenses(), fetchIncome()]);
    setIsApplyingFilters(false);
  };

  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ["Date", "Description", "Property", "Category", "Amount", "Receipt URL"];
      const rows = filteredExpenses.map(e => [
        format(new Date(e.date), "yyyy-MM-dd"),
        `"${e.description.replace(/"/g, '""')}"`,
        e.propertyName || "—",
        e.category,
        e.amount,
        e.receiptUrl || "",
      ]);
      const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${format(new Date(), "yyyy-MM")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 400);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken || !ownerId) return;

    setIsSavingExpense(true);

    let receiptUrl: string | undefined = undefined;

    if (receiptFile) {
      setUploading(true);
      try {
        const formDataUpload = new FormData();
        formDataUpload.append("images", receiptFile);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "X-CSRF-Token": csrfToken || "" },
          credentials: "include",
          body: formDataUpload,
        });

        const data = await res.json();

        if (!data.success || !data.urls?.length) {
          throw new Error(data.message || "Receipt upload failed");
        }

        receiptUrl = data.urls[0];
      } catch (err: any) {
        alert("Failed to upload receipt: " + (err.message || "Unknown error"));
        setIsSavingExpense(false);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          ownerId,
          ...formData,
          amount: Number(formData.amount),
          receiptUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setFormData({
          description: "",
          amount: "",
          category: "maintenance",
          date: new Date().toISOString().split("T")[0],
          propertyId: "",
          notes: "",
        });
        setReceiptFile(null);
        setReceiptPreview(null);

        await Promise.all([fetchExpenses(), fetchIncome()]);
      } else {
        alert(data.message || "Failed to save expense");
      }
    } catch {
      alert("Error saving expense. Please try again.");
    } finally {
      setIsSavingExpense(false);
    }
  };

  const openExpenseDetails = (expense: Expense) => {
    setSelectedExpense(expense);
  };

  const closeExpenseDetails = () => {
    setSelectedExpense(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (hasAccess === false) {
    return (
      <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[70vh] text-center"
          >
            <Lock className="h-16 w-16 text-amber-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Access Restricted</h2>
            <p className="text-lg text-gray-600 max-w-md mb-8">
              Your team member account does not have permission to view expenses.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-8 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition"
            >
              Back to Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-16 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10 mt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-sm">
                <Receipt className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">Expenses</h1>
                <p className="text-gray-600 mt-1">Track, categorize and optimize property costs</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleExportCSV}
                disabled={isExporting || filteredExpenses.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download size={18} />
                )}
                {isExporting ? "Exporting..." : "Export CSV"}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-200/30 hover:bg-emerald-700 transition-all font-medium"
              >
                <PlusCircle size={20} />
                Add Expense
              </motion.button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl flex items-center gap-3"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-10 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {/* Period, custom dates, property, search – same as before */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Period</label>
                <div className="flex flex-wrap gap-2">
                  {(["month", "year", "custom"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-4 py-2 text-sm rounded-lg transition-all ${
                        period === p
                          ? "bg-emerald-600 text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {p === "month" ? "This Month" : p === "year" ? "This Year" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {period === "custom" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">From</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">To</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Property</label>
                <select
                  value={selectedProperty}
                  onChange={e => setSelectedProperty(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition-all"
                >
                  <option value="all">All Properties</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2 xl:col-span-1">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Description or property..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleApplyFilters}
                  disabled={isApplyingFilters}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm font-medium flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isApplyingFilters ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Filter size={16} />
                      Apply Filters
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-36 animate-pulse shadow-sm" />
              ))}
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                }}
              >
                {[
                  { title: "Total Expenses", value: `Ksh ${totalExpenses.toLocaleString()}`, icon: Receipt, color: "emerald" },
                  { title: "Avg Monthly", value: `Ksh ${(totalExpenses / 12).toFixed(0).toLocaleString()}`, icon: TrendingUp, color: "amber" },
                  {
                    title: "Net Position",
                    value: `Ksh ${netPosition.toLocaleString()}`,
                    icon: ArrowDownRight,
                    color: netPosition >= 0 ? "emerald" : "red",
                    subtitle: `Income: Ksh ${totalIncome.toLocaleString()}`
                  },
                  { title: "Active Months", value: `${monthlyTrend.length}`, icon: Calendar, color: "blue", subtitle: "in selected period" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 font-medium">{item.title}</p>
                        <p className={`text-3xl font-bold mt-2 ${item.color === "red" ? "text-red-600" : `text-${item.color}-600`}`}>
                          {item.value}
                        </p>
                        {item.subtitle && <p className="text-xs text-gray-500 mt-1">{item.subtitle}</p>}
                      </div>
                      <div className={`p-3 rounded-xl bg-${item.color}-50/70 group-hover:bg-${item.color}-100 transition-colors`}>
                        <item.icon className={`h-8 w-8 text-${item.color}-600`} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Charts & Breakdowns – same as before */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                {/* Monthly Trend Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="lg:col-span-8 bg-white rounded-2xl p-7 shadow-sm border border-gray-100 overflow-hidden"
                >
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    Monthly Expense Trend
                  </h2>
                  <div className="h-80 relative">
                    <div className="absolute inset-0 flex items-end gap-4 pb-10 px-2">
                      {monthlyTrend.map(([month, amt], index) => {
                        const heightPercent = (amt / maxMonthly) * 100;
                        const delay = index * 0.08;
                        return (
                          <motion.div
                            key={month}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: `${heightPercent}%`, opacity: 1 }}
                            transition={{ duration: 0.8, delay, ease: "easeOut" }}
                            className="flex-1 flex flex-col items-center justify-end group relative"
                          >
                            <div className="w-full bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-400 rounded-t-xl shadow-md group-hover:shadow-lg group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>
                            <div className="mt-3 text-center">
                              <p className="text-xs font-medium text-gray-700">{month}</p>
                              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                                {amt.toLocaleString()}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    {monthlyTrend.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        No expense data for the selected period
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Category Breakdown */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="lg:col-span-4 bg-white rounded-2xl p-7 shadow-sm border border-gray-100"
                >
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                    <BarChart2 className="h-5 w-5 text-indigo-600" />
                    Category Breakdown
                  </h2>
                  <div className="space-y-6">
                    {Object.entries(categoryTotals).map(([cat, amt]) => {
                      const cfg = categoryConfig[cat] || categoryConfig.other;
                      const pct = totalExpenses ? Math.round((amt / totalExpenses) * 100) : 0;
                      const Icon = cfg.icon;
                      return (
                        <div key={cat} className="group">
                          <div className="flex items-center gap-4 mb-2">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: cfg.bg }}>
                              <Icon className="h-6 w-6 transition-colors" style={{ color: cfg.color }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-baseline">
                                <span className="font-medium capitalize text-gray-800">{cat}</span>
                                <span className="text-lg font-semibold text-gray-900">Ksh {amt.toLocaleString()}</span>
                              </div>
                              <div className="mt-2 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 1.2, ease: "easeOut" }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: cfg.color }}
                                />
                              </div>
                              <div className="text-right text-xs text-gray-500 mt-1 font-medium">{pct}%</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>

              {/* Expense List – now clickable */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer"
              >
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Recent Expenses</h2>
                  <p className="text-sm text-gray-600">
                    {filteredExpenses.length} {filteredExpenses.length === 1 ? "expense" : "expenses"}
                  </p>
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="py-20 text-center text-gray-500">
                    <Receipt className="h-16 w-16 mx-auto mb-6 text-gray-300" />
                    <p className="text-xl font-medium">No expenses found</p>
                    <p className="mt-2">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredExpenses.slice(0, 25).map((exp, index) => {
                      const cfg = categoryConfig[exp.category];
                      const Icon = cfg.icon;

                      return (
                        <motion.div
                          key={exp._id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.5 }}
                          onClick={() => openExpenseDetails(exp)}
                          className="px-6 py-5 hover:bg-gray-50 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer"
                        >
                          <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: cfg.bg }}>
                              <Icon className="h-5 w-5 transition-colors" style={{ color: cfg.color }} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                                {exp.description}
                              </p>
                              {exp.propertyName && (
                                <p className="text-sm text-gray-600 mt-0.5 truncate">{exp.propertyName}</p>
                              )}
                            </div>
                          </div>

                          <div className="text-right whitespace-nowrap flex flex-col items-end gap-1">
                            <p className="text-xl font-semibold text-red-600">
                              -Ksh {exp.amount.toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1.5 justify-end">
                              <Calendar size={14} />
                              {format(new Date(exp.date), "dd MMM yyyy")}
                            </p>
                            {exp.receiptUrl && (
                              <div className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                                <FileUp size={14} />
                                Receipt available
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {filteredExpenses.length > 25 && (
                  <div className="px-6 py-5 text-center text-sm text-emerald-600 border-t border-gray-100 bg-gray-50/50">
                    Showing first 25 of {filteredExpenses.length} expenses • refine filters for more
                  </div>
                )}
              </motion.div>
            </>
          )}
        </main>
      </div>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-7 sm:p-8">
                <div className="flex justify-between items-center mb-7">
                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900">Add New Expense</h3>
                    <p className="text-gray-600 text-sm mt-1">Record property-related costs</p>
                  </div>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-100"
                  >
                    <X size={28} />
                  </button>
                </div>

                <form onSubmit={handleAddExpense} className="space-y-6">
                  {/* ... same form content as before ... */}
                  {/* Description, Amount, Date, Category, Property, Notes, Receipt upload */}
                  {/* (keeping it unchanged for brevity – copy your original form fields here) */}
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── VIEW EXPENSE DETAILS MODAL ───────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedExpense && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: categoryConfig[selectedExpense.category].bg }}>
                    {React.createElement(categoryConfig[selectedExpense.category].icon, {
                      className: "h-5 w-5",
                      style: { color: categoryConfig[selectedExpense.category].color }
                    })}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">Expense Details</h3>
                    <p className="text-sm text-gray-500">{selectedExpense.description}</p>
                  </div>
                </div>
                <button
                  onClick={closeExpenseDetails}
                  className="text-gray-500 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs uppercase text-gray-500 font-medium">Amount</label>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      -Ksh {selectedExpense.amount.toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs uppercase text-gray-500 font-medium">Date</label>
                    <p className="text-lg font-medium mt-1">
                      {format(new Date(selectedExpense.date), "dd MMMM yyyy")}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs uppercase text-gray-500 font-medium">Category</label>
                    <div className="flex items-center gap-2 mt-1">
                      {React.createElement(categoryConfig[selectedExpense.category].icon, {
                        className: "h-5 w-5",
                        style: { color: categoryConfig[selectedExpense.category].color }
                      })}
                      <span className="font-medium capitalize">{selectedExpense.category}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase text-gray-500 font-medium">Property</label>
                    <p className="text-lg font-medium mt-1">
                      {selectedExpense.propertyName || "General / Unassigned"}
                    </p>
                  </div>
                </div>

                {selectedExpense.notes && (
                  <div className="mt-6">
                    <label className="text-xs uppercase text-gray-500 font-medium block mb-2">Notes</label>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-800 whitespace-pre-wrap">
                      {selectedExpense.notes}
                    </div>
                  </div>
                )}

                {selectedExpense.receiptUrl && (
                  <div className="mt-8">
                    <label className="text-xs uppercase text-gray-500 font-medium block mb-3">Receipt / Document</label>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                      <img
                        src={selectedExpense.receiptUrl}
                        alt="Receipt preview"
                        className="w-full max-h-80 object-contain mx-auto"
                        onError={(e) => {
                          e.currentTarget.src = "/fallback-receipt.png"; // optional fallback
                          e.currentTarget.alt = "Receipt preview not available";
                        }}
                      />
                      <div className="p-4 flex justify-center bg-white border-t border-gray-200">
                        <a
                          href={selectedExpense.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium"
                        >
                          <Eye size={18} />
                          View Full Receipt
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-gray-200 flex justify-end">
                <button
                  onClick={closeExpenseDetails}
                  className="px-6 py-2.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}