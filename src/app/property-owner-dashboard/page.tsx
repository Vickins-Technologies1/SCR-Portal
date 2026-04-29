"use client";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MaintenanceRequests from "./components/MaintenanceRequests";
import VacateRequests from "./components/VacateRequests";
import TenantDeletionRequests from "./components/TenantDeletionRequests";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Info,
  Building2,
  Users,
  DollarSign,
  AlertCircle,
  BarChart2,
  Home,
  MapPin,
  Lock,
  Sparkles,
} from "lucide-react";
import Cookies from "js-cookie";
import { Bar, Pie } from "react-chartjs-2";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

import { Property } from "../../types/property";
import { OwnerStats } from "../../types/stats";
import { usePermissions } from "@/hooks/usePermissions"; // ← import your permissions hook
import PaymentModal from "./components/PaymentModal";
import { useAccountTier } from "@/hooks/useAccountTier";

ChartJS.register(BarElement, LinearScale, Title, CategoryScale, Tooltip, Legend, ArcElement);

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const perm = usePermissions(); // ← use your permissions hook
  const { isFree } = useAccountTier();

  // Read cookies directly
  const loggedInUserId = Cookies.get("userId") ?? null;
  const role = Cookies.get("role") ?? null;
  const ownerIdFromCookie = Cookies.get("ownerId") ?? null;
  const effectiveOwnerId =
    role === "propertyOwner"
      ? loggedInUserId
      : ownerIdFromCookie || loggedInUserId;

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);
  const [hasDashboardAccess, setHasDashboardAccess] = useState<boolean | null>(null); // ← new: permission check
  const [isInvoicePaymentOpen, setIsInvoicePaymentOpen] = useState(false);
  const [invoicePaymentPropertyId, setInvoicePaymentPropertyId] = useState<string>("");
  const [invoicePaymentPhone, setInvoicePaymentPhone] = useState<string>("");

  const [stats, setStats] = useState<OwnerStats>({
    activeProperties: 0,
    totalTenants: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    expectedMonthlyRent: 0,
    totalMonthlyRent: 0,
    totalRentPaid: 0,
    overduePayments: 0,
    totalPayments: 0,
    totalOverdueAmount: 0,
    totalPenaltyAmount: 0,
    totalDepositPaid: 0,
    totalUtilityPaid: 0,
  });

  const [chartData, setChartData] = useState<ChartData | null>(null);

  // ─── AUTH CHECK + PERMISSION CHECK ──────────────────────────────────────────
  useEffect(() => {
    if (!loggedInUserId) {
      router.replace("/");
      return;
    }

    // Only allow property owners and team members at all
    if (!["propertyOwner", "teamMember"].includes(role ?? "")) {
      router.replace("/");
      return;
    }

    // Determine dashboard access
    let allowed = false;

    if (role === "propertyOwner") {
      allowed = true; // Owners always have access
    } else if (role === "teamMember") {
      allowed = perm.hasPermission("dashboard:view"); // ← key check using your permissions hook
    }

    setHasDashboardAccess(allowed);

    if (!allowed) {
      setIsLoading(false);
      return; // No need to fetch data
    }

    // Determine effective ownerId
    const effectiveOwnerId =
      role === "propertyOwner"
        ? loggedInUserId
        : ownerIdFromCookie || loggedInUserId;

    if (!effectiveOwnerId) {
      console.warn("No valid ownerId found for dashboard data");
      setError("Session error: Cannot determine property owner. Please log in again.");
      setIsLoading(false);
      return;
    }

    const fetchCsrfAndData = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/" });
            token = data.csrfToken;
          }
        } catch (err) {
          console.error("CSRF fetch failed:", err);
        }
      }
      setCsrfToken(token || null);

      // Data fetch will happen in next useEffect
    };

    fetchCsrfAndData();
  }, [loggedInUserId, role, ownerIdFromCookie, router, perm]);

  const fetchDueStatus = useCallback(async () => {
    if (!loggedInUserId || !["propertyOwner", "teamMember"].includes(role ?? "")) return;
    try {
      const res = await fetch("/api/owner-dues", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setDueStatus(data);
      }
    } catch {
      // ignore
    }
  }, [loggedInUserId, role]);

  useEffect(() => {
    fetchDueStatus();
  }, [fetchDueStatus]);

  // ─── DATA FETCHING ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!hasDashboardAccess || !csrfToken) return;

    const effectiveOwnerId =
      role === "propertyOwner"
        ? loggedInUserId
        : ownerIdFromCookie || loggedInUserId;

    if (!effectiveOwnerId) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers = { "x-csrf-token": csrfToken };

      const [propsRes, statsRes, chartsRes] = await Promise.all([
        fetch(`/api/properties?userId=${effectiveOwnerId}`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/ownerstats?userId=${effectiveOwnerId}`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/ownercharts?propertyOwnerId=${effectiveOwnerId}`, {
          headers,
          credentials: "include",
        }),
      ]);

      if (!propsRes.ok || !statsRes.ok || !chartsRes.ok) {
        throw new Error("One or more dashboard API calls failed");
      }

      const [propsData, statsData, chartsData] = await Promise.all([
        propsRes.json(),
        statsRes.json(),
        chartsRes.json(),
      ]);

      setProperties(propsData.success ? propsData.properties || [] : []);
      setStats(statsData.success ? statsData.stats : stats);
      setChartData(chartsData.success ? chartsData.chartData : null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [hasDashboardAccess, csrfToken, role, loggedInUserId, ownerIdFromCookie]);

  // Trigger data fetch when ready
  useEffect(() => {
    if (hasDashboardAccess && csrfToken) {
      fetchData();
    }
  }, [hasDashboardAccess, csrfToken, fetchData]);

  // Derived values
  const formatCurrency = (value: number) => `Ksh ${Math.max(0, value).toLocaleString("en-US")}`;
  const totalVacantUnits = Math.max(0, stats.totalUnits - stats.occupiedUnits);
  const vacancyRate =
    stats.totalUnits > 0 ? Math.round((totalVacantUnits / stats.totalUnits) * 100) : 0;
  const occupancyRate =
    stats.totalUnits > 0 ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100) : 0;

  const pieData = {
    labels: ["Current", "Overdue", "Lease Expired"],
    datasets: [
      {
        data: [
          Math.max(0, stats.totalTenants - stats.overduePayments),
          stats.overduePayments,
          0,
        ],
        backgroundColor: ["#42c775", "#ef4444", "#f59e0b"],
        borderWidth: 0,
        hoverOffset: 16,
      },
    ],
  };

  const barData = {
    labels: chartData?.months || ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: "Rent",
        data: chartData?.rentPayments || [],
        backgroundColor: "rgba(66,199,117,0.7)",
        borderRadius: 6,
      },
      {
        label: "Utility",
        data: chartData?.utilityPayments || [],
        backgroundColor: "rgba(30,58,138,0.7)",
        borderRadius: 6,
      },
      {
        label: "Deposit",
        data: chartData?.depositPayments || [],
        backgroundColor: "rgba(245,158,11,0.7)",
        borderRadius: 6,
      },
    ],
  };

  const handleOpenInvoicePayment = (propertyId?: string) => {
    setInvoicePaymentPropertyId(propertyId || "");
    setIsInvoicePaymentOpen(true);
  };

  const paymentModalProperties = useMemo(
    () =>
      properties.map((property) => ({
        ...property,
        _id: typeof property._id === "string" ? property._id : property._id.toString(),
        ownerId: typeof property.ownerId === "string" ? property.ownerId : property.ownerId.toString(),
        createdAt:
          property.createdAt instanceof Date
            ? property.createdAt.toISOString()
            : (property.createdAt as unknown as string),
        updatedAt:
          property.updatedAt instanceof Date
            ? property.updatedAt.toISOString()
            : (property.updatedAt as unknown as string | undefined),
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

  const statColorStyles = {
    green: { bg: "bg-primary/10", text: "text-primary" },
    emerald: { bg: "bg-primary/10", text: "text-primary" },
    blue: { bg: "bg-blue-100/80", text: "text-blue-600" },
    red: { bg: "bg-red-100/80", text: "text-red-600" },
    orange: { bg: "bg-orange-100/80", text: "text-orange-600" },
    purple: { bg: "bg-purple-100/80", text: "text-purple-600" },
    indigo: { bg: "bg-indigo-100/80", text: "text-indigo-600" },
    pink: { bg: "bg-pink-100/80", text: "text-pink-600" },
  } as const;

  const getStatColorClasses = (color: string) =>
    statColorStyles[color as keyof typeof statColorStyles] ?? {
      bg: "bg-gray-100",
      text: "text-gray-600",
    };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <Sidebar />

      <div className="relative md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="relative max-w-7xl mx-auto">
          {/* Show restriction message if no access */}
          {hasDashboardAccess === false ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="glass-panel rounded-3xl p-8 sm:p-10 flex flex-col items-center justify-center min-h-[60vh] text-center"
            >
              <Lock className="h-12 w-12 text-amber-500 mb-5" />
              <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-foreground mb-3">
                Access Restricted
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-6">
                Your account does not have permission to view the dashboard at this time.
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mb-6">
                Please contact the property owner to request access or check your assigned permissions.
              </p>
              <button
                onClick={() => router.push("/")}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-hover transition"
              >
                Back to Home
              </button>
            </motion.div>
          ) : hasDashboardAccess === null ? (
            // Loading state while checking permissions
            <div className="flex justify-center items-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-11 w-11 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Normal dashboard content */}
              <section className="glass-panel rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
                <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[#1e3a8a]/10 blur-2xl" />
                <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-muted-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Owner Command Center
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-display text-foreground">
                      Portfolio Overview
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                      Monitor revenue, occupancy, and tenant activity with a clear, real-time view of your portfolio.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                        {stats.activeProperties} properties
                      </span>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                        Occupancy {occupancyRate}%
                      </span>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/70 text-amber-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                        {stats.totalTenants} tenants
                      </span>
                    </div>
                  </div>

                  <div className="bg-white/70 border border-white/50 rounded-2xl px-4 py-3 shadow-sm backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Monthly revenue</p>
                    <p className="text-lg sm:text-xl font-semibold text-foreground mt-1">
                      {formatCurrency(stats.totalMonthlyRent)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Expected {formatCurrency(stats.expectedMonthlyRent)}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      {stats.overduePayments} overdue tenants
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-4 space-y-3">
                {error && (
                  <div className="flex items-center gap-2.5 p-3 bg-red-50 text-red-800 rounded-xl border border-red-200 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {dueStatus?.isDue && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600" />
                      <div>
                        <p className="font-semibold text-amber-900">Payment required</p>
                        <p className="text-xs sm:text-sm text-amber-800">
                          Your grace period has ended for at least one property. Please settle your invoice to regain full access.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {role === "propertyOwner" && (
                        <button
                          onClick={() => handleOpenInvoicePayment(dueStatus?.dueProperties?.[0]?.propertyId)}
                          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-primary-hover"
                        >
                          Pay Now
                        </button>
                      )}
                      <Link
                        href="/property-owner-dashboard/reports?tab=invoices"
                        className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
                      >
                        View Invoices
                      </Link>
                    </div>
                  </div>
                )}
              </div>
              {isLoading ? (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="surface-card rounded-2xl p-4 sm:p-5 animate-pulse">
                      <div className="space-y-3">
                        <div className="h-3.5 bg-gray-200 rounded-lg w-24" />
                        <div className="h-8 bg-gray-300 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* TOP STATS */}
                  <section className="mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      <h2 className="text-lg sm:text-xl font-semibold text-foreground">Performance Metrics</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {[
                        {
                          title: "Expected Monthly Revenue",
                          value: formatCurrency(stats.expectedMonthlyRent),
                          icon: DollarSign,
                          color: "green",
                          subtitle: `${stats.totalTenants} active tenants`,
                          explanation: "Projected rent for this month based on active tenants and their current rent.",
                        },
                        {
                          title: "Monthly Rent",
                          value: formatCurrency(stats.totalMonthlyRent),
                          icon: DollarSign,
                          color: "emerald",
                          explanation: "Total rent collected in the current month (completed rent payments only).",
                        },
                        {
                          title: "Total Rent Paid",
                          value: formatCurrency(stats.totalRentPaid),
                          icon: DollarSign,
                          color: "blue",
                          explanation: "All-time rent payments received from tenants (completed rent transactions only).",
                        },
                        {
                          title: "Overdue Amount",
                          value: formatCurrency(stats.totalOverdueAmount),
                          icon: AlertCircle,
                          color: "red",
                          subtitle: `${stats.overduePayments} tenants overdue`,
                          explanation: "Total unpaid rent + deposits that are currently past due across all tenants.",
                        },
                        {
                          title: "Late Payment Penalties",
                          value: formatCurrency(stats.totalPenaltyAmount),
                          icon: AlertCircle,
                          color: "orange",
                          explanation: "Total penalties accrued from overdue rent based on property penalty rules.",
                        },
                        {
                          title: "Active Tenants",
                          value: stats.totalTenants,
                          icon: Users,
                          color: "green",
                          subtitle: `${stats.occupiedUnits} units occupied`,
                          explanation: "Total number of tenants with active leases across all your properties.",
                        },
                        {
                          title: "Vacant Units",
                          value: totalVacantUnits,
                          icon: Home,
                          color: "orange",
                          subtitle: `${vacancyRate}% vacancy`,
                          explanation: "Number of unoccupied units across all properties (calculated from total units minus occupied units).",
                        },
                        {
                          title: "Properties",
                          value: stats.activeProperties,
                          icon: Building2,
                          color: "purple",
                          explanation: "Number of properties currently listed and managed under your account.",
                        },
                        {
                          title: "Deposits",
                          value: formatCurrency(stats.totalDepositPaid),
                          icon: DollarSign,
                          color: "indigo",
                          explanation: "Total security deposits collected and marked as paid from all tenants.",
                        },
                        {
                          title: "Utilities Paid",
                          value: formatCurrency(stats.totalUtilityPaid),
                          icon: DollarSign,
                          color: "pink",
                          explanation: "Total amount tenants have paid for utilities (water, electricity, etc.) to date.",
                        },
                      ].map((s, i) => {
                        const colorClasses = getStatColorClasses(s.color);
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="relative surface-card rounded-2xl p-4 sm:p-5 transition-shadow hover:shadow-lg"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                                {s.title}
                              </p>
                              <div className="relative group flex items-center justify-center">
                                <button
                                  type="button"
                                  aria-label={`${s.title} details`}
                                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                >
                                  <Info className="h-4 w-4" />
                                </button>
                                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block group-focus-within:block group-active:block z-[100] pointer-events-none">
                                  <div className="bg-white text-slate-900 text-[11px] rounded-lg border border-slate-200 py-2 px-2.5 min-w-[180px] max-w-[260px] leading-snug shadow-xl">
                                    {s.explanation}
                                    {s.subtitle && (
                                      <span className="block pt-1 text-primary font-medium">{s.subtitle}</span>
                                    )}
                                  </div>
                                  <div
                                    className="absolute bottom-[-6px] right-3 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-base sm:text-lg font-semibold text-foreground mt-1">{s.value}</p>
                                {isFree && (
                                  <p className="mt-1 text-[10px] text-amber-700 flex items-center gap-1">
                                    <Lock className="h-3 w-3" />
                                    <span>
                                      Upgrade for full access:{" "}
                                      <a href="/upgrade" className="underline underline-offset-2 font-semibold">
                                        {s.title}
                                      </a>
                                    </span>
                                  </p>
                                )}
                                {s.subtitle && !s.explanation.includes(s.subtitle) && (
                                  <p className="text-[11px] text-muted-foreground mt-1">{s.subtitle}</p>
                                )}
                              </div>

                              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${colorClasses.bg}`}>
                                <s.icon className={`h-5 w-5 ${colorClasses.text}`} />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>

                  {/* CHARTS */}
                  <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="surface-card rounded-3xl p-5 sm:p-6">
                      <h2 className="text-sm sm:text-base font-semibold mb-4 text-foreground">Payment Trends</h2>
                      <div className="h-64 sm:h-72">
                        <Bar
                          data={barData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                              y: { beginAtZero: true },
                            },
                          }}
                        />
                      </div>
                    </div>
                    <div className="surface-card rounded-3xl p-5 sm:p-6">
                      <h2 className="text-sm sm:text-base font-semibold mb-4 text-foreground">Tenant Payment Status</h2>
                      <div className="h-64 sm:h-72">
                        <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false }} />
                      </div>
                    </div>
                  </section>

                  {/* MAINTENANCE REQUESTS */}
                  <div className="mt-8 space-y-8">
                    {role === "propertyOwner" && <TenantDeletionRequests csrfToken={csrfToken!} />}
                    <VacateRequests csrfToken={csrfToken!} />
                    <MaintenanceRequests
                      userId={ownerIdFromCookie || loggedInUserId!}
                      csrfToken={csrfToken!}
                      properties={properties}
                    />
                  </div>

                  {/* PROPERTIES GRID */}
                  <section className="mt-10">
                    <h2 className="text-lg sm:text-xl font-semibold mb-5 flex items-center gap-2">
                      <Building2 className="h-6 w-6 text-primary" />
                      Your Properties
                    </h2>

                    {properties.length === 0 ? (
                      <div className="text-center py-24 bg-white/70 backdrop-blur-sm rounded-3xl shadow-inner border border-white/20">
                        <div className="w-24 h-24 mx-auto bg-gray-200 border-2 border-dashed rounded-xl mb-6" />
                        <p className="text-lg font-semibold text-gray-700">No properties yet</p>
                        <p className="text-gray-500 mt-2 text-sm">
                          {role === "propertyOwner"
                            ? "Add your first property to get started"
                            : "Ask the property owner to grant you access to properties"}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                        {properties.map((property) => {
                          const propertyIdStr = property._id.toString();

                          const totalUnits = property.unitTypes?.reduce((sum, ut) => sum + (ut.quantity || 0), 0) || 0;

                          let occupiedUnits = property.occupiedUnits ?? null;

                          if (occupiedUnits === null || occupiedUnits === undefined) {
                            const globalOccupancyRate = stats.totalUnits > 0
                              ? stats.occupiedUnits / stats.totalUnits
                              : 0;
                            occupiedUnits = Math.round(totalUnits * globalOccupancyRate);
                          }

                          const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
                          const occupancyRate = totalUnits > 0
                            ? Math.round((occupiedUnits / totalUnits) * 100)
                            : 0;

                          const isFullyOccupied = occupiedUnits === totalUnits && totalUnits > 0;
                          const isCompletelyVacant = occupiedUnits === 0 && totalUnits > 0;

                          return (
                            <motion.div
                              key={propertyIdStr}
                              initial={{ opacity: 0, y: 30 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true }}
                              whileHover={{ y: -6, scale: 1.02 }}
                              transition={{ duration: 0.4, ease: "easeOut" }}
                              className="group relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer transition-all border border-gray-100"
                            >
                              <div className="h-1.5 bg-gradient-to-r from-primary via-teal-500 to-cyan-600" />

                              <div className="p-5 pb-4">
                                <h3 className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-1">
                                  {property.name}
                                </h3>
                                <p className="text-xs sm:text-sm text-gray-600 mt-1.5 flex items-center gap-1.5">
                                  <MapPin className="w-4 h-4 text-primary" />
                                  <span className="truncate">{property.address || "No address"}</span>
                                </p>
                              </div>

                              {/* Occupancy ring */}
                              <div className="absolute top-4 right-4 bg-white rounded-full shadow-2xl p-2.5 border border-gray-100">
                                <div className="relative w-12 h-12">
                                  <svg className="w-full h-full -rotate-90">
                                    <circle cx="50%" cy="50%" r="38%" stroke="#e5e7eb" strokeWidth="7" fill="none" />
                                    <circle
                                      cx="50%"
                                      cy="50%"
                                      r="38%"
                                      stroke="#42c775"
                                      strokeWidth="8"
                                      fill="none"
                                      strokeDasharray={`${(occupancyRate / 100) * 119.38} 119.38`}
                                      className="transition-all duration-1000 ease-out"
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs font-bold text-primary">{occupancyRate}%</span>
                                  </div>
                                </div>
                              </div>

                              <div className="px-5 pb-5 pt-2">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl py-2.5 border border-primary/30">
                                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Total</p>
                                    <p className="text-base sm:text-lg font-bold text-foreground mt-1">{totalUnits}</p>
                                  </div>
                                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl py-2.5 border border-amber-200">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Vacant</p>
                                    <p className="text-base sm:text-lg font-bold text-amber-900 mt-1">{vacantUnits}</p>
                                  </div>
                                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl py-2.5 border border-blue-200">
                                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Occupied</p>
                                    <p className="text-base sm:text-lg font-bold text-blue-900 mt-1">{occupiedUnits}</p>
                                  </div>
                                </div>

                                <div className="mt-4 text-center">
                                  <span
                                    className={`inline-block px-4 py-2 rounded-full text-[11px] font-semibold shadow-md transition-all ${isFullyOccupied
                                      ? "bg-primary/10 text-primary ring-2 ring-primary/30"
                                      : isCompletelyVacant
                                        ? "bg-gray-100 text-gray-700 ring-2 ring-gray-300"
                                        : "bg-purple-100 text-purple-800 ring-2 ring-purple-300"
                                      }`}
                                  >
                                    {isFullyOccupied
                                      ? "Fully Occupied"
                                      : isCompletelyVacant
                                        ? "Completely Vacant"
                                        : "Partially Occupied"}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      <PaymentModal
        isOpen={isInvoicePaymentOpen}
        onClose={() => setIsInvoicePaymentOpen(false)}
        onSuccess={() => {
          setIsInvoicePaymentOpen(false);
          fetchDueStatus();
          fetchData();
        }}
        onError={(message) => setError(message)}
        properties={paymentModalProperties}
        initialPropertyId={invoicePaymentPropertyId}
        initialPhone={invoicePaymentPhone}
        userId={effectiveOwnerId}
      />
    </div>
  );
}













