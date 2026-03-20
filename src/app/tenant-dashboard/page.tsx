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
  Wallet,
  CalendarClock,
  BadgeCheck,
  Sparkles,
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
  wallet?: number;
  walletBalance?: number;
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
    <div className="bg-white/70 rounded-2xl p-4 animate-pulse border border-gray-200">
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
    <div className="surface-card rounded-2xl p-5 sm:p-6 relative overflow-hidden">
      <div className="absolute -top-10 right-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative">
        <h3 className="flex items-center gap-2.5 text-sm sm:text-base font-semibold text-gray-800 mb-3">
          {icon}
          {title}
        </h3>
        <div className="text-gray-700 text-xs sm:text-sm space-y-1.5 leading-relaxed">
          {isLoading ? <SkeletonCard /> : children}
        </div>
      </div>
    </div>
  );
}

function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    paid: "bg-primary/10 text-primary border-primary/30",
    overdue: "bg-red-100 text-red-800 border-red-200",
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Active: "bg-primary/10 text-primary border-primary/30",
    Inactive: "bg-gray-100 text-gray-800 border-gray-200",
    Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    "up-to-date": "bg-primary/10 text-primary border-primary/30",
  };

  const color = styles[status || ""] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-[11px] sm:text-xs font-medium rounded-full border ${color}`}>
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
    <InfoCard icon={<DollarSign className="w-5 h-5 text-primary" />} title="Monthly Payments" isLoading={false}>
      <div className="h-52 sm:h-60 md:h-72 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 16, left: -12, bottom: 16 }}>
            <defs>
              <linearGradient id="rentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#42c775" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#42c775" stopOpacity={0.2} />
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
            <Area type="monotone" dataKey="rent" name="Rent" stackId="1" stroke="#42c775" fill="url(#rentGradient)" strokeWidth={2} />
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
      <div className="h-52 sm:h-60 md:h-72 pt-4">
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
            <Bar dataKey="value" name="Paid" radius={[6, 6, 6, 6]} fill="#1E3A8A" />
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

  const walletBalance = tenant?.walletBalance ?? tenant?.wallet ?? 0;
  const totalPaid =
    (tenant?.totalRentPaid ?? 0) +
    (tenant?.totalUtilityPaid ?? 0) +
    (tenant?.totalDepositPaid ?? 0);
  const totalDue = tenant?.dues?.totalRemainingDues ?? 0;
  const hasDues = totalDue > 0;
  const paymentStatusLabel = tenant?.paymentStatus || "—";

  const statThemes = {
    primary: {
      ring: "ring-primary/20",
      icon: "text-primary",
      bg: "bg-primary/10",
      glow: "shadow-[0_18px_40px_-28px_rgba(66,199,117,0.65)]",
    },
    blue: {
      ring: "ring-[#1e3a8a]/15",
      icon: "text-[#1e3a8a]",
      bg: "bg-[#1e3a8a]/10",
      glow: "shadow-[0_18px_40px_-28px_rgba(30,58,138,0.55)]",
    },
    amber: {
      ring: "ring-amber-200/70",
      icon: "text-amber-600",
      bg: "bg-amber-100/70",
      glow: "shadow-[0_18px_40px_-28px_rgba(245,158,11,0.5)]",
    },
    red: {
      ring: "ring-red-200/70",
      icon: "text-red-600",
      bg: "bg-red-100/70",
      glow: "shadow-[0_18px_40px_-28px_rgba(239,68,68,0.45)]",
    },
  } as const;

  const quickStats = [
    {
      label: "Wallet Balance",
      value: formatCurrency(walletBalance),
      icon: Wallet,
      tone: "primary",
      helper: "Ready to use",
    },
    {
      label: "Total Paid",
      value: formatCurrency(totalPaid),
      icon: BadgeCheck,
      tone: "blue",
      helper: "All time",
    },
    {
      label: "Total Due",
      value: formatCurrency(totalDue),
      icon: AlertCircle,
      tone: hasDues ? "red" : "primary",
      helper: hasDues ? "Pending" : "Clear",
    },
    {
      label: "Lease Ends",
      value: fmt(tenant?.leaseEndDate),
      icon: CalendarClock,
      tone: "amber",
      helper: fmt(tenant?.leaseStartDate),
    },
  ] as const;

  return (
    <div className="relative min-h-screen pb-10 text-[13px] sm:text-sm">
      <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />

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

      <div className={`${isImpersonated ? "pt-16 sm:pt-20" : "pt-10 sm:pt-14"} relative z-10`}>
        <div className="mx-4 sm:mx-6 lg:mx-8">
          <section className="glass-panel rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
            <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[#1e3a8a]/10 blur-2xl" />

            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Tenant Command Center
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-display text-foreground">
                  Welcome{tenant?.name ? `, ${tenant.name.split(" ")[0]}` : ""}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Track your lease, payments, and requests with a real-time view built for clarity.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                    {property?.name || "Your Property"}
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                    Unit {tenant?.houseNumber || "—"}
                  </span>
                  <Badge status={paymentStatusLabel}>{paymentStatusLabel}</Badge>
                </div>
              </div>

              <div className="bg-white/70 border border-white/50 rounded-2xl px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Lease window</p>
                <p className="text-sm sm:text-base font-semibold text-foreground mt-1">
                  {fmt(tenant?.leaseStartDate)} – {fmt(tenant?.leaseEndDate)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Months stayed: <span className="font-semibold text-foreground">{tenant?.monthsStayed ?? "—"}</span>
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-primary/10 text-primary rounded-lg border border-primary/20 text-sm">
              {successMessage}
            </div>
          )}
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickStats.map((stat) => {
            const tone = statThemes[stat.tone];
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className={`surface-card rounded-2xl p-4 sm:p-5 ring-1 ${tone.ring} ${tone.glow}`}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-base sm:text-lg font-semibold text-foreground">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground">{stat.helper}</p>
                  </div>
                  <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${tone.bg}`}>
                    <Icon className={`h-5 w-5 ${tone.icon}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 surface-card rounded-3xl p-6 sm:p-7 relative overflow-hidden">
            <div className="absolute -top-12 right-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[#1e3a8a]/10 flex items-center justify-center">
                  <Home className="h-5 w-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Residency</p>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">Property Snapshot</h2>
                </div>
              </div>

              {property && tenant ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">{property.name}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{property.address}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {tenant.unitType}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] text-xs font-semibold">
                        Unit {tenant.houseNumber}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                    <p>
                      Rent: <span className="font-semibold text-foreground">Ksh {tenant.price.toLocaleString()}</span>
                    </p>
                    <p>
                      Deposit: <span className="font-semibold text-foreground">Ksh {tenant.deposit.toLocaleString()}</span>
                    </p>
                    <p>
                      Lease: <span className="font-semibold text-foreground">{fmt(tenant.leaseStartDate)} – {fmt(tenant.leaseEndDate)}</span>
                    </p>
                    <p>
                      Months stayed: <span className="font-semibold text-foreground">{tenant.monthsStayed ?? "—"}</span>
                    </p>
                  </div>
                </div>
              ) : isLoading ? (
                <SkeletonCard />
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
            </div>
          </div>

          <div className="space-y-6">
            <div className="surface-card rounded-3xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Payment Health</p>
                  <h2 className="text-lg font-semibold text-foreground">Dues & Status</h2>
                </div>
              </div>

              {tenant ? (
                <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <p>
                    Status: <Badge status={tenant.paymentStatus}>{tenant.paymentStatus || "?"}</Badge>
                  </p>
                  <p>
                    Rent paid: <span className="font-semibold text-foreground">{formatCurrency(tenant.totalRentPaid)}</span>
                  </p>
                  <p>
                    Utility paid: <span className="font-semibold text-foreground">{formatCurrency(tenant.totalUtilityPaid)}</span>
                  </p>
                  <p>
                    Deposit paid: <span className="font-semibold text-foreground">{formatCurrency(tenant.totalDepositPaid)}</span>
                  </p>
                  <div className="pt-3 mt-3 border-t border-border text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Total due</span>
                    <span className={hasDues ? "text-red-600" : "text-primary"}>
                      {formatCurrency(totalDue)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No payment data available</p>
              )}
            </div>

            <div className="surface-card rounded-3xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-2xl bg-[#1e3a8a]/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Tenant Profile</p>
                  <h2 className="text-lg font-semibold text-foreground">Contact Details</h2>
                </div>
              </div>

              {tenant ? (
                <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <p className="text-base font-semibold text-foreground">{tenant.name}</p>
                  <p className="break-all">{tenant.email}</p>
                  <p>{tenant.phone || "—"}</p>
                  <div className="pt-3 mt-3 border-t border-border">
                    Status: <Badge status={tenant.status}>{tenant.status}</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Loading profile…</p>
              )}
            </div>
          </div>
        </div>

        <section className="mx-4 sm:mx-6 lg:mx-8 mt-8 sm:mt-10 space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <PaymentTrendChart data={paymentTrendData} />
            <PaymentBreakdownChart breakdown={paymentBreakdown} />
          </div>
        </section>
      </div>
    </div>
  );
}
