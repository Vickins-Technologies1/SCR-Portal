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
  AreaChart,
  Area,
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
  deposit: number;
  total: number;
  paid: boolean;
}

interface Analytics {
  monthlyPayments: MonthlyPayment[];
  paymentBreakdown: Array<{ name: string; value: number }>;
}

function SkeletonCard() {
  return (
    <div className="bg-white/70 rounded-xl p-4 animate-pulse border border-gray-200">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
        <div className="h-4 w-28 bg-gray-200 rounded"></div>
      </div>
      <div className="space-y-2">
        <div className="h-3.5 w-full bg-gray-200 rounded"></div>
        <div className="h-3.5 w-5/6 bg-gray-200 rounded"></div>
        <div className="h-3.5 w-2/3 bg-gray-200 rounded"></div>
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200/70 p-4 sm:p-5 hover:shadow-md transition-shadow">
      <h3 className="flex items-center gap-2.5 text-base sm:text-lg font-semibold text-gray-800 mb-3">
        {icon}
        {title}
      </h3>
      <div className="text-gray-700 text-xs sm:text-sm space-y-1.5 leading-relaxed">
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

  const color = styles[status || ""] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${color}`}>
      {children}
    </span>
  );
}

const formatCurrency = (value: unknown): string => {
  if (value == null) return "—";
  const num = Number(value);
  return isNaN(num) ? "—" : `Ksh ${num.toLocaleString("en-US")}`;
};

function PaymentTrendChart({
  data,
}: {
  data: Array<{ month: string; rent: number; utility: number; deposit: number; total: number }>;
}) {
  if (!data?.length) {
    return <div className="text-gray-400 text-center py-10 text-sm italic">No payment history yet</div>;
  }

  return (
    <InfoCard icon={<DollarSign className="w-5 h-5 text-emerald-600" />} title="Monthly Payments" isLoading={false}>
      <div className="h-64 sm:h-72 md:h-80 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 16, left: -12, bottom: 16 }}>
            <defs>
              <linearGradient id="rentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="utilityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="depositGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.85} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 11 }} dy={8} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(17,24,39,0.95)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                padding: "8px 12px",
                fontSize: "0.8rem",
              }}
              formatter={(value: number | undefined) => [formatCurrency(value), null]}
              labelStyle={{ color: "#e5e7eb", fontSize: "0.85rem", fontWeight: 500 }}
            />
            <Legend wrapperStyle={{ fontSize: "0.8rem", paddingTop: 4 }} iconSize={8} />
            <Area type="monotone" dataKey="rent" name="Rent" stackId="1" stroke="#10b981" fill="url(#rentGradient)" strokeWidth={2} />
            <Area type="monotone" dataKey="utility" name="Utility" stackId="1" stroke="#6366f1" fill="url(#utilityGradient)" strokeWidth={2} />
            <Area type="monotone" dataKey="deposit" name="Deposit" stackId="1" stroke="#f59e0b" fill="url(#depositGradient)" strokeWidth={2} />
            <Line type="monotone" dataKey="total" name="Total Paid" stroke="#111827" strokeWidth={2} dot={{ r: 2, strokeWidth: 2, fill: "white" }} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </InfoCard>
  );
}

function PaymentBreakdownChart({ breakdown }: { breakdown: Array<{ name: string; value: number }> }) {
  const total = breakdown.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <div className="text-gray-400 text-center py-10 text-sm italic">No payments recorded</div>;
  }

  return (
    <InfoCard icon={<PieChartIcon className="w-5 h-5 text-purple-600" />} title="Payment Mix" isLoading={false}>
      <div className="h-64 sm:h-72 md:h-80 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={breakdown} layout="vertical" margin={{ top: 6, right: 24, left: 10, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            />
            <YAxis
              dataKey="name"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 12 }}
              width={70}
            />
            <Tooltip
              formatter={(value, name) => [formatCurrency(value), name]}
              contentStyle={{
                backgroundColor: "rgba(17,24,39,0.95)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                padding: "8px 12px",
                fontSize: "0.8rem",
              }}
            />
            <Bar dataKey="value" name="Paid" radius={[6, 6, 6, 6]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Total paid: <span className="font-semibold text-gray-700">{formatCurrency(total)}</span>
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
        const token = data.csrfToken;
        setCsrfToken(token);
        const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
        Cookies.set("csrf-token", token, { path: "/", secure: isSecure, sameSite: "strict" });
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
      (currentRole !== "tenant" && !(currentRole === "propertyOwner" && isImpersonating))
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

        // ── 1. Get tenant profile (main source of truth) ────────────────
        const tenantRes = await fetch("/api/tenant/profile", {
          headers: { "X-CSRF-Token": token },
          credentials: "include",
        });

        if (!tenantRes.ok) {
          throw new Error(`Profile request failed: ${tenantRes.status}`);
        }

        const tenantData = await tenantRes.json();

        if (!tenantData.success) {
          throw new Error(tenantData.message || "Failed to load tenant profile");
        }

        const profileTenant = tenantData.tenant;
        setTenant(profileTenant);
        setAnalytics(tenantData.analytics || null);

        // ── 2. Set property from profile response (preferred) ───────────
        if (tenantData.property) {
          setProperty(tenantData.property);
        }
        // ── 3. Fallback: try direct property endpoint if needed ─────────
        else if (profileTenant?.propertyId) {
          try {
            const propRes = await fetch(`/api/properties/${profileTenant.propertyId}`, {
              headers: { "X-CSRF-Token": token },
              credentials: "include",
            });

            if (propRes.ok) {
              const propData = await propRes.json();
              if (propData.success && propData.property) {
                setProperty(propData.property);
              }
            }
            // silent fail – we already have profile fallback
          } catch (propErr) {
            console.warn("[Property fallback fetch failed]", propErr);
          }
        }

        await fetchDues(token);
      } catch (err) {
        console.error("Dashboard load error:", err);
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
      const res = await fetch("/api/revert-impersonation", { method: "POST", credentials: "include" });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Reverted to owner view");
        Cookies.remove("impersonatingTenantId", { path: "/" });
        Cookies.remove("isImpersonating", { path: "/" });
        setTimeout(() => router.push("/property-owner-dashboard"), 700);
      } else {
        setError(data.message || "Revert failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setIsReverting(false);
    }
  };

  const paymentTrendData = (analytics?.monthlyPayments ?? []).map((item) => ({
    month: item.month,
    rent: item.rent,
    utility: item.utility,
    deposit: item.deposit,
    total: item.total,
  }));

  const paymentBreakdown = [
    { name: "Rent", value: tenant?.totalRentPaid || 0 },
    { name: "Utility", value: tenant?.totalUtilityPaid || 0 },
    { name: "Deposit", value: tenant?.totalDepositPaid || 0 },
  ];

  const fmt = (date?: string) =>
    date
      ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-6 sm:pb-10">
      {isImpersonated && (
        <div className="fixed top-0 inset-x-0 z-50 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5" />
              <div>
                <p className="font-medium">Impersonating tenant</p>
                <p className="text-xs opacity-90">{tenant?.name || "Tenant"}</p>
              </div>
            </div>
            <button
              onClick={handleRevertImpersonation}
              disabled={isReverting}
              className="flex items-center gap-2 bg-white/95 text-red-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-60 transition"
            >
              {isReverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reverting…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  Exit
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className={`${isImpersonated ? "pt-16 sm:pt-20" : "pt-10 sm:pt-14"}`}>
        <section
          className="
            mx-4 sm:mx-6 lg:mx-8
            mt-3 sm:mt-6
            bg-gradient-to-r from-emerald-600 to-emerald-700
            text-white
            rounded-xl sm:rounded-2xl
            p-5 sm:p-7 md:p-8
            shadow-xl
          "
        >
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
            Welcome{tenant?.name ? `, ${tenant.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1.5 text-sm sm:text-base opacity-90">Rental overview – real-time</p>
        </section>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 sm:mt-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-green-50 text-green-800 rounded-lg border border-green-200 text-sm">
              {successMessage}
            </div>
          )}
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <InfoCard icon={<Home className="w-5 h-5 text-blue-600" />} title="Property" isLoading={isLoading}>
            {property && tenant ? (
              <div className="space-y-1 text-xs sm:text-sm">
                <p className="font-medium text-gray-900">{property.name}</p>
                <p className="text-gray-600 truncate">{property.address}</p>
                <div className="mt-2 space-y-0.5">
                  <p>
                    Unit: <strong>{tenant.houseNumber}</strong> ({tenant.unitType})
                  </p>
                  <p>
                    Rent: <strong>Ksh {tenant.price.toLocaleString()}</strong>/mo
                  </p>
                  <p>
                    Deposit: <strong>Ksh {tenant.deposit.toLocaleString()}</strong>
                  </p>
                  <p>
                    Lease:{" "}
                    <strong className="whitespace-nowrap">
                      {fmt(tenant.leaseStartDate)} – {fmt(tenant.leaseEndDate)}
                    </strong>
                  </p>
                  <p>
                    Months stayed: <strong>{tenant.monthsStayed ?? "—"}</strong>
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="text-gray-500 text-sm">Loading property details...</div>
            ) : (
              <div className="text-amber-700 text-sm">
                Property information not available
                {tenant?.propertyId && (
                  <div className="text-xs mt-1 opacity-80">
                    (Property ID: {tenant.propertyId.slice(-8)}...)
                  </div>
                )}
              </div>
            )}
          </InfoCard>

          <InfoCard icon={<DollarSign className="w-5 h-5 text-emerald-600" />} title="Payments" isLoading={isLoading}>
            {tenant ? (
              <div className="space-y-1.5 text-xs sm:text-sm">
                <p>
                  Status: <Badge status={tenant.paymentStatus}>{tenant.paymentStatus || "?"}</Badge>
                </p>
                <p>
                  Rent paid: <strong>{formatCurrency(tenant.totalRentPaid)}</strong>
                </p>
                <p>
                  Utility paid: <strong>{formatCurrency(tenant.totalUtilityPaid)}</strong>
                </p>
                <p>
                  Deposit paid: <strong>{formatCurrency(tenant.totalDepositPaid)}</strong>
                </p>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No payment data available</p>
            )}
          </InfoCard>

          <InfoCard icon={<AlertCircle className="w-5 h-5 text-red-600" />} title="Dues" isLoading={isDuesLoading}>
            {tenant?.dues ? (
              <div className="space-y-1 text-xs sm:text-sm">
                <p>
                  Rent due: <strong className="text-red-700">{formatCurrency(tenant.dues.rentDues)}</strong>
                </p>
                <p>
                  Utility due: <strong className="text-orange-700">{formatCurrency(tenant.dues.utilityDues)}</strong>
                </p>
                <p>
                  Deposit due: <strong className="text-purple-700">{formatCurrency(tenant.dues.depositDues)}</strong>
                </p>
                <p className="mt-2 pt-2 border-t font-semibold text-red-800 text-sm sm:text-base">
                  Total remaining: {formatCurrency(tenant.dues.totalRemainingDues)}
                </p>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Loading dues…</p>
            )}
          </InfoCard>

          <InfoCard icon={<User className="w-5 h-5 text-indigo-600" />} title="Profile" isLoading={isLoading}>
            {tenant ? (
              <div className="space-y-1 text-xs sm:text-sm">
                <p className="font-medium text-gray-900">{tenant.name}</p>
                <p className="text-gray-600 break-all">{tenant.email}</p>
                <p>{tenant.phone || "—"}</p>
                <p className="mt-1.5">
                  Status: <Badge status={tenant.status}>{tenant.status}</Badge>
                </p>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Loading profile…</p>
            )}
          </InfoCard>
        </div>

        <section className="mx-4 sm:mx-6 lg:mx-8 mt-7 sm:mt-9 lg:mt-10 space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <PaymentTrendChart data={paymentTrendData} />
            <PaymentBreakdownChart breakdown={paymentBreakdown} />
          </div>
          
        </section>
      </div>
    </div>
  );
}
