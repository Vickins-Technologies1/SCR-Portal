// src/app/tenant-dashboard/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  Home,
  DollarSign,
  User,
  AlertCircle,
  LogOut,
  Loader2,
  Shield,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Property } from "../../types/property";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  wallet: number;
  leaseStartDate?: string;
  leaseEndDate?: string;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
  dues?: {
    rentDues: number;
    utilityDues: number;
    depositDues: number;
    totalRemainingDues: number;
  };
  monthsStayed?: number;
}

interface MonthlyPayment {
  month: string;
  rent: number;
  utility: number;
  total: number;
  paid: boolean;
}

interface Analytics {
  monthlyPayments: MonthlyPayment[];
  paymentBreakdown: Array<{
    name: string;
    value: number;
  }>;
}

/* -------------------------------------------------
   Skeleton Card
   ------------------------------------------------- */
function SkeletonCard() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 bg-gray-200 rounded-full"></div>
        <div className="h-5 w-32 bg-gray-200 rounded"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-gray-200 rounded"></div>
        <div className="h-4 w-4/5 bg-gray-200 rounded"></div>
        <div className="h-4 w-3/5 bg-gray-200 rounded"></div>
        <div className="h-4 w-2/5 bg-gray-200 rounded"></div>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   Info Card Component
   ------------------------------------------------- */
function InfoCard({
  icon,
  title,
  children,
  isLoading,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
      <h3 className="flex items-center gap-3 text-xl font-bold text-gray-800 mb-4">
        {icon}
        {title}
      </h3>
      <div className="text-gray-700 space-y-2">
        {isLoading ? <SkeletonCard /> : children}
      </div>
    </div>
  );
}

/* -------------------------------------------------
   Badge Component
   ------------------------------------------------- */
function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    Active: "bg-green-100 text-green-800",
    Inactive: "bg-gray-100 text-gray-800",
    Pending: "bg-yellow-100 text-yellow-800",
  };

  const base = "inline-flex px-3 py-1 text-xs font-semibold rounded-full";
  const color = styles[status || ""] || "bg-gray-100 text-gray-800";

  return <span className={`${base} ${color}`}>{children}</span>;
}

/* -------------------------------------------------
   Shared currency formatter (safe for undefined/null values)
   ------------------------------------------------- */
const currencyFormatter = (value: number | string | undefined): string => {
  if (value === undefined || value === null) return "—";
  const num = Number(value);
  return isNaN(num) ? "—" : `Ksh ${num.toLocaleString()}`;
};

/* -------------------------------------------------
   Payment Trend Chart Component
   ------------------------------------------------- */
function PaymentTrendChart({ data }: { data: Array<{ month: string; paid: number; due: number }> }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-500 text-center py-10">No payment trend data available.</p>;
  }

  return (
    <InfoCard
      icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
      title="Payment Trend (Last 12 Months)"
      isLoading={false}
    >
      <div className="h-80">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={currencyFormatter} />
            <Legend />
            <Bar dataKey="due" name="Due" fill="#d1d5db" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" name="Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="paid"
              stroke="#059669"
              strokeWidth={3}
              dot={{ r: 5 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </InfoCard>
  );
}

/* -------------------------------------------------
   Payment Breakdown Chart Component
   ------------------------------------------------- */
function PaymentBreakdownChart({
  breakdown,
}: {
  breakdown: Array<{ name: string; value: number }>;
}) {
  const COLORS = ["#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

  if (!breakdown || breakdown.every((b) => b.value === 0)) {
    return <p className="text-gray-500 text-center py-10">No payment data yet.</p>;
  }

  return (
    <InfoCard
      icon={<PieChartIcon className="w-6 h-6 text-purple-600" />}
      title="Payment Composition"
      isLoading={false}
    >
      <div className="h-72">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={breakdown}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={90}
              fill="#8884d8"
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {breakdown.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={currencyFormatter} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </InfoCard>
  );
}

/* -------------------------------------------------
   Main Page
   ------------------------------------------------- */
export default function TenantDashboardPage() {
  const router = useRouter();

  /* ---- auth & impersonation ---- */
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  /* ---- data ---- */
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* ---- CSRF ---- */
  const [csrfToken, setCsrfToken] = useState<string | null>(
    Cookies.get("csrf-token") || null
  );
  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 1000;

  const fetchCsrfToken = useCallback(async () => {
    if (requestInProgress.current) return csrfToken;
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((r) =>
        setTimeout(r, rateLimitDelay - (now - lastRequestTime.current))
      );
    }
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.csrfToken) {
        const token = data.csrfToken as string;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, {
          path: "/",
          secure: true,
          sameSite: "strict",
        });
        return token;
      }
    } catch (e) {
      console.error("[CSRF] error", e);
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
    return null;
  }, [csrfToken]);

  const fetchDues = useCallback(
    async (token: string) => {
      if (!userId || !token) return;
      setIsDuesLoading(true);
      try {
        const impersonatingTenantId = Cookies.get("impersonatingTenantId");
        const isImpersonating = Cookies.get("isImpersonating") === "true";
        const res = await fetch("/api/tenants/check-dues", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          credentials: "include",
          body: JSON.stringify({
            tenantId: isImpersonating ? impersonatingTenantId : userId,
            userId,
          }),
        });

        if (!res.ok) throw new Error("Failed to fetch dues");
        const data = await res.json();

        if (data.success) {
          setTenant((prev) =>
            prev
              ? {
                  ...prev,
                  dues: data.dues,
                  monthsStayed: data.monthsStayed,
                  totalRentPaid: data.tenant.totalRentPaid,
                  totalUtilityPaid: data.tenant.totalUtilityPaid,
                  totalDepositPaid: data.tenant.totalDepositPaid,
                  paymentStatus: data.tenant.paymentStatus,
                }
              : null
          );
        }
      } catch (e) {
        console.error("Dues fetch error:", e);
      } finally {
        setIsDuesLoading(false);
      }
    },
    [userId]
  );

  /* -------------------------------------------------
     Auth & Impersonation Detection
     ------------------------------------------------- */
  useEffect(() => {
    const uid = Cookies.get("userId");
    const currentRole = Cookies.get("role");
    const isImpersonating = Cookies.get("isImpersonating") === "true";
    const impersonatingTenantId = Cookies.get("impersonatingTenantId");

    if (
      !uid ||
      (currentRole !== "tenant" &&
        !(currentRole === "propertyOwner" && isImpersonating))
    ) {
      router.replace("/");
      return;
    }

    setUserId(uid);
    setRole(currentRole);
    setIsImpersonated(isImpersonating);
  }, [router]);

  /* -------------------------------------------------
     Load Tenant Data
     ------------------------------------------------- */
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let token = csrfToken || (await fetchCsrfToken());
        if (!token) throw new Error("Failed to get CSRF token");

        const tenantRes = await fetch("/api/tenant/profile", {
          headers: { "X-CSRF-Token": token },
          credentials: "include",
        });
        if (!tenantRes.ok) throw new Error("Failed to load profile");
        const tenantData = await tenantRes.json();
        if (!tenantData.success)
          throw new Error(tenantData.message || "Profile error");

        setTenant(tenantData.tenant);
        setAnalytics(tenantData.analytics || null);

        if (tenantData.tenant.propertyId) {
          const propRes = await fetch(
            `/api/properties/${tenantData.tenant.propertyId}`,
            {
              headers: { "X-CSRF-Token": token },
              credentials: "include",
            }
          );
          if (propRes.ok) {
            const propData = await propRes.json();
            if (propData.success) setProperty(propData.property);
          }
        }

        await fetchDues(token);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userId, csrfToken, fetchCsrfToken, fetchDues]);

  /* -------------------------------------------------
     Revert Impersonation
     ------------------------------------------------- */
  const handleRevertImpersonation = async () => {
    if (isReverting) return;
    setIsReverting(true);
    setError(null);

    try {
      const res = await fetch("/api/revert-impersonation", {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Successfully reverted to Property Owner view");
        Cookies.remove("impersonatingTenantId", { path: "/" });
        Cookies.remove("isImpersonating", { path: "/" });

        setTimeout(() => {
          router.push("/property-owner-dashboard");
        }, 800);
      } else {
        setError(data.message || "Failed to revert impersonation");
      }
    } catch (err) {
      setError("Network error while reverting");
    } finally {
      setIsReverting(false);
    }
  };

  // Prepare chart data
  const paymentTrendData = analytics?.monthlyPayments.map((item) => ({
    month: item.month,
    paid: item.total,
    due: item.rent + item.utility,
  })) || [];

  const paymentBreakdown = [
    { name: "Rent", value: tenant?.totalRentPaid || 0 },
    { name: "Utility", value: tenant?.totalUtilityPaid || 0 },
    { name: "Deposit", value: tenant?.totalDepositPaid || 0 },
  ];

  /* -------------------------------------------------
     UI
     ------------------------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {isImpersonated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6" />
              <div>
                <p className="font-bold">Impersonation Mode Active</p>
                <p className="text-sm opacity-90">
                  You are viewing this dashboard as{" "}
                  <strong>{tenant?.name || "tenant"}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={handleRevertImpersonation}
              disabled={isReverting}
              className="flex items-center gap-2 bg-white text-red-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition disabled:opacity-70"
            >
              {isReverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reverting...
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  Exit Impersonation
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className={isImpersonated ? "pt-24" : "pt-16"}>
        <section className="relative overflow-hidden bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl mx-4 sm:mx-6 lg:mx-8 p-8 shadow-xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Welcome back, {tenant?.name?.split(" ")[0] || "Tenant"}!
            </h1>
            <p className="mt-2 text-lg opacity-90">
              Here's your rental overview and account status.
            </p>
          </div>
        </section>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-6 space-y-3">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="flex items-center gap-3 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200">
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InfoCard icon={<Home />} title="Leased Property" isLoading={isLoading}>
            {property && tenant ? (
              <>
                <p className="font-semibold text-lg">{property.name}</p>
                <p className="text-gray-600">{property.address}</p>
                <p className="mt-3">
                  Unit: <strong>{tenant.houseNumber}</strong> ({tenant.unitType})
                </p>
                <p>
                  Rent: <strong>Ksh {tenant.price.toLocaleString()}</strong>
                  /month
                </p>
                <p>
                  Deposit: <strong>Ksh {tenant.deposit.toLocaleString()}</strong>
                </p>
                <p className="text-sm mt-2">
                  Lease: {tenant.leaseStartDate ? fmt(tenant.leaseStartDate) : "—"}{" "}
                  → {tenant.leaseEndDate ? fmt(tenant.leaseEndDate) : "—"}
                </p>
                <p>
                  Months stayed: <strong>{tenant.monthsStayed ?? "—"}</strong>
                </p>
              </>
            ) : (
              <p className="text-gray-500">No property assigned yet.</p>
            )}
          </InfoCard>

          <InfoCard icon={<DollarSign />} title="Payment Summary" isLoading={isLoading}>
            {tenant ? (
              <>
                <p>
                  Status:{" "}
                  <Badge status={tenant.paymentStatus}>
                    {tenant.paymentStatus || "Unknown"}
                  </Badge>
                </p>
                <p className="mt-3">
                  Total Rent Paid:{" "}
                  <strong>Ksh {(tenant.totalRentPaid || 0).toLocaleString()}</strong>
                </p>
                <p>
                  Utility Paid:{" "}
                  <strong>Ksh {(tenant.totalUtilityPaid || 0).toLocaleString()}</strong>
                </p>
                <p>
                  Deposit Paid:{" "}
                  <strong>Ksh {(tenant.totalDepositPaid || 0).toLocaleString()}</strong>
                </p>
              </>
            ) : (
              <p className="text-gray-500">No payment history.</p>
            )}
          </InfoCard>

          <InfoCard
            icon={<AlertCircle />}
            title="Outstanding Dues"
            isLoading={isDuesLoading}
          >
            {tenant?.dues ? (
              <>
                <p>
                  Rent Due:{" "}
                  <strong className="text-red-600">
                    Ksh {tenant.dues.rentDues.toLocaleString()}
                  </strong>
                </p>
                <p>
                  Utility Due:{" "}
                  <strong className="text-orange-600">
                    Ksh {tenant.dues.utilityDues.toLocaleString()}
                  </strong>
                </p>
                <p>
                  Deposit Due:{" "}
                  <strong className="text-purple-600">
                    Ksh {tenant.dues.depositDues.toLocaleString()}
                  </strong>
                </p>
                <p className="mt-4 text-lg font-bold text-red-700">
                  Total Remaining: Ksh{" "}
                  {tenant.dues.totalRemainingDues.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-gray-500">Loading dues...</p>
            )}
          </InfoCard>

          <InfoCard icon={<User />} title="Your Profile" isLoading={isLoading}>
            {tenant ? (
              <>
                <p className="font-semibold text-lg">{tenant.name}</p>
                <p className="text-gray-600">{tenant.email}</p>
                <p className="mt-2">{tenant.phone || "No phone"}</p>
                <p className="mt-3">
                  Status: <Badge status={tenant.status}>{tenant.status}</Badge>
                </p>
              </>
            ) : (
              <p className="text-gray-500">Profile loading...</p>
            )}
          </InfoCard>
        </div>

        <section className="mx-4 sm:mx-6 lg:mx-8 mt-12 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PaymentTrendChart data={paymentTrendData} />
            <PaymentBreakdownChart breakdown={paymentBreakdown} />
          </div>
        </section>
      </div>
    </div>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}