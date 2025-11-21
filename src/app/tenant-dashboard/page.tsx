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
} from "lucide-react";
import MaintenanceRequests from "./components/MaintenanceRequests";
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

/* -------------------------------------------------
   Skeleton Card – modern box shimmer
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
   Main Page
   ------------------------------------------------- */
export default function TenantDashboardPage() {
  const router = useRouter();

  /* ---- auth & impersonation ---- */
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isImpersonated, setIsImpersonated] = useState(false);

  /* ---- data ---- */
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /* ---- CSRF ---- */
  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);
  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 1000;

  /* -------------------------------------------------
     CSRF token fetch (unchanged – only formatting)
     ------------------------------------------------- */
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
        Cookies.set("csrf-token", token, { path: "/", secure: true, sameSite: "strict", expires: 1 });
        return token;
      }
      throw new Error(data.message ?? "No token");
    } catch (e) {
      console.error("[CSRF] error", e);
      return null;
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  }, [csrfToken]);

  useEffect(() => {
    if (!csrfToken) fetchCsrfToken();
  }, [csrfToken, fetchCsrfToken]);

  /* -------------------------------------------------
     Dues fetch (unchanged – only formatting)
     ------------------------------------------------- */
  const fetchDues = useCallback(
    async (token: string) => {
      if (!userId || !token) return;
      if (requestInProgress.current) return;
      requestInProgress.current = true;
      const now = Date.now();
      if (now - lastRequestTime.current < rateLimitDelay) {
        await new Promise((r) => setTimeout(r, rateLimitDelay - (now - lastRequestTime.current)));
      }
      setIsDuesLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tenant/dues", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          credentials: "include",
          body: JSON.stringify({ tenantId: userId, userId }),
        });
        if (!res.ok) {
          if (res.status === 403) {
            const newToken = await fetchCsrfToken();
            if (newToken) {
              const retry = await fetch("/api/tenant/dues", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": newToken },
                credentials: "include",
                body: JSON.stringify({ tenantId: userId, userId }),
              });
              if (retry.ok) {
                const d = await retry.json();
                if (d.success && d.dues) {
                  setTenant((p) => p ? { ...p, dues: d.dues, monthsStayed: d.monthsStayed } : null);
                }
                return;
              }
            }
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.success && data.dues) {
          setTenant((p) => p ? { ...p, dues: data.dues, monthsStayed: data.monthsStayed } : null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dues");
      } finally {
        setIsDuesLoading(false);
        requestInProgress.current = false;
        lastRequestTime.current = Date.now();
      }
    },
    [userId, fetchCsrfToken]
  );

  /* -------------------------------------------------
     Cookie validation & impersonation
     ------------------------------------------------- */
  useEffect(() => {
    const uid = Cookies.get("userId");
    const curRole = Cookies.get("role") ?? null;
    const origRole = Cookies.get("originalRole") ?? null;
    const origUid = Cookies.get("originalUserId") ?? null;

    const isTenant = curRole === "tenant";
    const isImpersonating = origRole === "propertyOwner" && origUid;

    if (!uid || (!isTenant && !isImpersonating)) {
      setError("Unauthorized – redirecting…");
      setTimeout(() => router.replace("/"), 2000);
      return;
    }

    setUserId(uid);
    setRole(curRole);
    if (isImpersonating) setIsImpersonated(true);
  }, [router]);

  /* -------------------------------------------------
     Tenant + Property fetch
     ------------------------------------------------- */
  useEffect(() => {
    if (!userId || !role) return;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let token = csrfToken ?? (await fetchCsrfToken());
        if (!token) throw new Error("CSRF missing");

        // tenant
        const tRes = await fetch("/api/tenant/profile", {
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          credentials: "include",
        });
        if (!tRes.ok) throw new Error(`Tenant ${tRes.status}`);
        const tData = await tRes.json();
        if (!tData.success) throw new Error(tData.message ?? "Tenant fetch failed");
        setTenant({
          ...tData.tenant,
          totalRentPaid: tData.tenant.totalRentPaid ?? 0,
          totalUtilityPaid: tData.tenant.totalUtilityPaid ?? 0,
          totalDepositPaid: tData.tenant.totalDepositPaid ?? 0,
        });

        // property (if linked)
        if (tData.tenant?.propertyId) {
          const pRes = await fetch(`/api/properties/${tData.tenant.propertyId}`, {
            headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
            credentials: "include",
          });
          if (!pRes.ok) throw new Error(`Property ${pRes.status}`);
          const pData = await pRes.json();
          if (pData.success) setProperty(pData.property);
        }

        // dues
        await fetchDues(token);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [userId, role, csrfToken, fetchCsrfToken, fetchDues]);

  /* -------------------------------------------------
     Revert impersonation
     ------------------------------------------------- */
  const handleRevertImpersonation = async () => {
    setIsLoading(true);
    try {
      const token = csrfToken ?? (await fetchCsrfToken());
      if (!token) throw new Error("CSRF missing");
      const res = await fetch("/api/impersonate/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Revert ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Back to owner view!");
        ["userId", "role", "originalUserId", "originalRole"].forEach((c) => Cookies.remove(c, { path: "/" }));
        setTimeout(() => router.push("/property-owner-dashboard"), 1000);
      } else throw new Error(data.message ?? "Revert failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert error");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------------------------------------
     UI
     ------------------------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* ----- Padding for fixed navbar (height ≈ 64px) ----- */}
      <div className="pt-16">

        {/* ----- Hero ----- */}
        <section className="relative overflow-hidden bg-gradient-to-r from-[#03a678] to-emerald-600 text-white rounded-2xl mx-4 sm:mx-6 lg:mx-8 p-6 sm:p-8 shadow-xl">
          <div className="absolute inset-0 bg-black/5"></div>
          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Welcome, {tenant?.name ?? "Tenant"}!
              </h1>
              <p className="mt-1 text-sm sm:text-base opacity-90">
                Manage lease, payments & maintenance – all in one place.
              </p>
            </div>

            {isImpersonated && (
              <button
                onClick={handleRevertImpersonation}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg text-sm font-medium hover:bg-white/30 transition"
              >
                <LogOut size={16} />
                Revert to Owner
              </button>
            )}
          </div>
        </section>

        {/* ----- Messages ----- */}
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-6 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle size={20} />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-lg">
              {successMessage}
            </div>
          )}
          {(isLoading || isDuesLoading) && (
            <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-700 rounded-lg">
              <Loader2 className="animate-spin" size={20} />
              Loading data…
            </div>
          )}
        </div>

        {/* ----- Cards Grid ----- */}
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Leased Property */}
          <InfoCard
            icon={<Home className="text-emerald-600" />}
            title="Leased Property"
            isLoading={isLoading}
          >
            {property && tenant ? (
              <>
                <p className="font-semibold">{property.name}</p>
                <p className="text-gray-600 text-sm">{property.address}</p>
                <p className="mt-2">
                  Unit: <span className="font-medium">{tenant.houseNumber}</span> ({tenant.unitType})
                </p>
                <p>Rent: <strong>Ksh {tenant.price.toFixed(2)}</strong></p>
                <p>Deposit: <strong>Ksh {tenant.deposit.toFixed(2)}</strong></p>
                <p>
                  Lease: {tenant.leaseStartDate ? fmt(tenant.leaseStartDate) : "—"} →{" "}
                  {tenant.leaseEndDate ? fmt(tenant.leaseEndDate) : "—"}
                </p>
                <p>Months stayed: <strong>{tenant.monthsStayed ?? "—"}</strong></p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No property assigned.</p>
            )}
          </InfoCard>

          {/* Payment Status */}
          <InfoCard
            icon={<DollarSign className="text-emerald-600" />}
            title="Payment Status"
            isLoading={isLoading}
          >
            {tenant ? (
              <>
                <p>Rent: <strong>Ksh {tenant.price.toFixed(2)}</strong></p>
                <p className="mt-2">
                  Status:{" "}
                  <Badge status={tenant.paymentStatus}>
                    {tenant.paymentStatus || "N/A"}
                  </Badge>
                </p>
                <p>Total Rent Paid: <strong>Ksh {tenant.totalRentPaid?.toFixed(2) ?? "0.00"}</strong></p>
                <p>Total Utility Paid: <strong>Ksh {tenant.totalUtilityPaid?.toFixed(2) ?? "0.00"}</strong></p>
                <p>Total Deposit Paid: <strong>Ksh {tenant.totalDepositPaid?.toFixed(2) ?? "0.00"}</strong></p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No payment info.</p>
            )}
          </InfoCard>

          {/* Outstanding Dues */}
          <InfoCard
            icon={<DollarSign className="text-emerald-600" />}
            title="Outstanding Dues"
            isLoading={isDuesLoading}
          >
            {tenant?.dues ? (
              <>
                <p>Rent Dues: <strong>Ksh {tenant.dues.rentDues.toFixed(2)}</strong></p>
                <p>Utility Dues: <strong>Ksh {tenant.dues.utilityDues.toFixed(2)}</strong></p>
                <p>Deposit Dues: <strong>Ksh {tenant.dues.depositDues.toFixed(2)}</strong></p>
                <p className="mt-2 font-semibold text-red-600">
                  Total: Ksh {tenant.dues.totalRemainingDues.toFixed(2)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No dues data.</p>
            )}
          </InfoCard>

          {/* Profile */}
          <InfoCard
            icon={<User className="text-emerald-600" />}
            title="Your Profile"
            isLoading={isLoading}
          >
            {tenant ? (
              <>
                <p className="font-semibold">{tenant.name}</p>
                <p className="text-gray-600 text-sm">{tenant.email}</p>
                <p className="mt-2">{tenant.phone || "—"}</p>
                <p>
                  Status:{" "}
                  <Badge status={tenant.status}>{tenant.status || "N/A"}</Badge>
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No profile info.</p>
            )}
          </InfoCard>
        </div>

        {/* ----- Maintenance Requests (optional) ----- */}
        {/* <div className="mx-4 sm:mx-6 lg:mx-8 mt-10">
          <MaintenanceRequests />
        </div> */}
      </div>
    </div>
  );
}

/* -------------------------------------------------
   Helper Components
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
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-5 transition-transform hover:scale-[1.01]">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-3">
        {icon}
        {title}
      </h2>
      <div className="text-sm text-gray-700 space-y-1">
        {isLoading ? <SkeletonCard /> : children}
      </div>
    </div>
  );
}

function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    Active: "bg-green-100 text-green-800",
    Pending: "bg-yellow-100 text-yellow-800",
    Inactive: "bg-red-100 text-red-800",
  };
  const cls = map[status ?? ""] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${cls}`}>
      {children}
    </span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB");
}