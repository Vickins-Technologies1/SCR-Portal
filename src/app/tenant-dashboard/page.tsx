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
  BarChart,
  Bar,
  Line,
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
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow duration-300">
      <h3 className="flex items-center gap-3 text-xl font-bold text-gray-800 mb-4">
        {icon}
        {title}
      </h3>
      <div className="text-gray-700 space-y-2.5">
        {isLoading ? <SkeletonCard /> : children}
      </div>
    </div>
  );
}

function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-800 border-green-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Active: "bg-green-100 text-green-800 border-green-200",
    Inactive: "bg-gray-100 text-gray-800 border-gray-200",
    Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    "up-to-date": "bg-green-100 text-green-800 border-green-200",
  };

  const base = "inline-flex px-3 py-1 text-xs font-semibold rounded-full border";
  const color = styles[status || ""] || "bg-gray-100 text-gray-800 border-gray-200";

  return <span className={`${base} ${color}`}>{children}</span>;
}

const formatCurrency = (value: unknown): string => {
  if (value == null) return "—";
  const num = Number(value);
  return isNaN(num) ? "—" : `Ksh ${num.toLocaleString("en-US")}`;
};

function PaymentTrendChart({ data }: { data: Array<{ month: string; paid: number; due: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-gray-400 text-center py-12 italic">
        No payment history recorded yet.
      </div>
    );
  }

  return (
    <InfoCard
      icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
      title="Payment Trend — Last 12 Months"
      isLoading={false}
    >
      <div className="h-80 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: -10, bottom: 20 }}
            barCategoryGap="22%"
          >
            <defs>
              <linearGradient id="paidGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.5} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 13, fontWeight: 500 }}
              dy={12}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 13 }}
              tickFormatter={(v) => `Ksh ${(Number(v) / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(17, 24, 39, 0.96)",
                border: "none",
                borderRadius: "12px",
                color: "white",
                padding: "12px 16px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.4)",
              }}
              formatter={(value: number | string | undefined) => [
                formatCurrency(value),
                null,
              ]}
              labelStyle={{ color: "#e5e7eb", fontWeight: 600, marginBottom: 4 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 10 }}
              iconType="circle"
              iconSize={12}
            />

            <Bar dataKey="due" name="Amount Due" fill="#e5e7eb" radius={[8, 8, 0, 0]} />
            <Bar
              dataKey="paid"
              name="Amount Paid"
              fill="url(#paidGradient)"
              radius={[8, 8, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="paid"
              name="Paid Trend"
              stroke="#059669"
              strokeWidth={3}
              dot={{ r: 5, stroke: "#059669", strokeWidth: 2.5, fill: "white" }}
              activeDot={{ r: 8, stroke: "#059669", strokeWidth: 3, fill: "white" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </InfoCard>
  );
}

function PaymentBreakdownChart({
  breakdown,
}: {
  breakdown: Array<{ name: string; value: number }>;
}) {
  const COLORS = ["#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#6366f1"];

  const total = breakdown.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return (
      <div className="text-gray-400 text-center py-12 italic">
        No payments recorded yet.
      </div>
    );
  }

  return (
    <InfoCard
      icon={<PieChartIcon className="w-6 h-6 text-purple-600" />}
      title="Payment Composition"
      isLoading={false}
    >
      <div className="h-80 flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <defs>
              <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feOffset dx="3" dy="5" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.35" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <Pie
              data={breakdown}
              cx="50%"
              cy="50%"
              innerRadius={75}
              outerRadius={110}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              labelLine={false}
              label={({ name, percent = 0 }) =>
                percent > 0.07 ? `${name} ${Math.round(percent * 100)}%` : ""
              }
              filter="url(#shadow)"
            >
              {breakdown.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value),
                name || "—",
              ]}
              contentStyle={{
                backgroundColor: "rgba(17, 24, 39, 0.96)",
                border: "none",
                borderRadius: "12px",
                color: "white",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.4)",
              }}
            />

            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              className="text-2xl font-bold fill-gray-800"
            >
              {formatCurrency(total)}
            </text>
            <text
              x="50%"
              y="54%"
              textAnchor="middle"
              className="text-sm fill-gray-500 font-medium"
            >
              Total Paid
            </text>
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap justify-center gap-5 mt-5">
          {breakdown.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div
                className="w-3.5 h-3.5 rounded-full shadow-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-sm font-medium text-gray-700">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </InfoCard>
  );
}

export default function TenantDashboardPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);
  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 1000;

  const fetchCsrfToken = useCallback(async () => {
    if (requestInProgress.current) return csrfToken;
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((r) => setTimeout(r, rateLimitDelay - (now - lastRequestTime.current)));
    }
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.csrfToken) {
        const token = data.csrfToken as string;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, { path: "/", secure: true, sameSite: "strict" });
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
                  totalRentPaid: data.tenant?.totalRentPaid,
                  totalUtilityPaid: data.tenant?.totalUtilityPaid,
                  totalDepositPaid: data.tenant?.totalDepositPaid,
                  paymentStatus: data.tenant?.paymentStatus,
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

  useEffect(() => {
    const uid = Cookies.get("userId");
    const currentRole = Cookies.get("role");
    const isImpersonating = Cookies.get("isImpersonating") === "true";

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
        if (!tenantData.success) throw new Error(tenantData.message || "Profile error");

        setTenant(tenantData.tenant);
        setAnalytics(tenantData.analytics || null);

        if (tenantData.tenant.propertyId) {
          const propRes = await fetch(`/api/properties/${tenantData.tenant.propertyId}`, {
            headers: { "X-CSRF-Token": token },
            credentials: "include",
          });
          if (propRes.ok) {
            const propData = await propRes.json();
            if (propData.success) setProperty(propData.property);
          }
        }

        await fetchDues(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userId, csrfToken, fetchCsrfToken, fetchDues]);

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

  // ── Chart data preparation ───────────────────────────────────────────────
  const paymentTrendData = (analytics?.monthlyPayments ?? []).map((item) => ({
    month: item.month,
    paid: item.total,           // ← total includes rent + utility + deposit
    due: item.rent + item.utility, // deposit usually not monthly → not added to due
  }));

  const paymentBreakdown = [
    { name: "Rent", value: tenant?.totalRentPaid || 0 },
    { name: "Utility", value: tenant?.totalUtilityPaid || 0 },
    { name: "Deposit", value: tenant?.totalDepositPaid || 0 },
  ];

  const fmt = (date?: string) =>
    date
      ? new Date(date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-12">
      {isImpersonated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6" />
              <div>
                <p className="font-bold">Impersonation Mode Active</p>
                <p className="text-sm opacity-90">
                  Viewing dashboard as <strong>{tenant?.name || "tenant"}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={handleRevertImpersonation}
              disabled={isReverting}
              className="flex items-center gap-2 bg-white text-red-700 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition disabled:opacity-60 shadow-sm"
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
        <section className="relative overflow-hidden bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl mx-4 sm:mx-6 lg:mx-8 mt-6 p-8 shadow-2xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Welcome back, {tenant?.name?.split(" ")[0] || "Tenant"}!
            </h1>
            <p className="mt-3 text-lg opacity-90">
              Your rental overview and account status — updated real-time.
            </p>
          </div>
        </section>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-8 space-y-4">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 shadow-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="flex items-center gap-3 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 shadow-sm">
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <InfoCard icon={<Home className="text-blue-600" />} title="Leased Property" isLoading={isLoading}>
            {property && tenant ? (
              <>
                <p className="font-semibold text-lg text-gray-900">{property.name}</p>
                <p className="text-gray-600 mt-1">{property.address}</p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <p>
                    Unit: <strong>{tenant.houseNumber}</strong> ({tenant.unitType})
                  </p>
                  <p>
                    Rent: <strong>Ksh {tenant.price.toLocaleString("en-US")}</strong>/month
                  </p>
                  <p>
                    Deposit: <strong>Ksh {tenant.deposit.toLocaleString("en-US")}</strong>
                  </p>
                  <p>
                    Lease: <strong>{fmt(tenant.leaseStartDate)} → {fmt(tenant.leaseEndDate)}</strong>
                  </p>
                  <p>
                    Months stayed: <strong>{tenant.monthsStayed ?? "—"}</strong>
                  </p>
                </div>
              </>
            ) : (
              <p className="text-gray-500">No property assigned yet.</p>
            )}
          </InfoCard>

          <InfoCard icon={<DollarSign className="text-emerald-600" />} title="Payment Summary" isLoading={isLoading}>
            {tenant ? (
              <div className="space-y-2.5 text-sm">
                <p>
                  Status: <Badge status={tenant.paymentStatus}>{tenant.paymentStatus || "Unknown"}</Badge>
                </p>
                <p>
                  Total Rent Paid: <strong>{formatCurrency(tenant.totalRentPaid)}</strong>
                </p>
                <p>
                  Utility Paid: <strong>{formatCurrency(tenant.totalUtilityPaid)}</strong>
                </p>
                <p>
                  Deposit Paid: <strong>{formatCurrency(tenant.totalDepositPaid)}</strong>
                </p>
              </div>
            ) : (
              <p className="text-gray-500">No payment history available.</p>
            )}
          </InfoCard>

          <InfoCard
            icon={<AlertCircle className="text-red-600" />}
            title="Outstanding Dues"
            isLoading={isDuesLoading}
          >
            {tenant?.dues ? (
              <div className="space-y-2 text-sm">
                <p>
                  Rent Due: <strong className="text-red-700">{formatCurrency(tenant.dues.rentDues)}</strong>
                </p>
                <p>
                  Utility Due: <strong className="text-orange-700">{formatCurrency(tenant.dues.utilityDues)}</strong>
                </p>
                <p>
                  Deposit Due: <strong className="text-purple-700">{formatCurrency(tenant.dues.depositDues)}</strong>
                </p>
                <p className="mt-4 text-lg font-bold text-red-800 pt-2 border-t border-red-100">
                  Total Remaining: {formatCurrency(tenant.dues.totalRemainingDues)}
                </p>
              </div>
            ) : (
              <p className="text-gray-500">Loading dues...</p>
            )}
          </InfoCard>

          <InfoCard icon={<User className="text-indigo-600" />} title="Your Profile" isLoading={isLoading}>
            {tenant ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-lg text-gray-900">{tenant.name}</p>
                <p className="text-gray-600">{tenant.email}</p>
                <p>{tenant.phone || "No phone number"}</p>
                <p className="mt-3">
                  Status: <Badge status={tenant.status}>{tenant.status}</Badge>
                </p>
              </div>
            ) : (
              <p className="text-gray-500">Profile loading...</p>
            )}
          </InfoCard>
        </div>

        <section className="mx-4 sm:mx-6 lg:mx-8 mt-12 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PaymentTrendChart data={paymentTrendData} />
            <PaymentBreakdownChart breakdown={paymentBreakdown} />
          </div>
        </section>
      </div>
    </div>
  );
}