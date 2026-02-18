// app/admin/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  CreditCard,
  FileText,
  Shield,
  Info,
  AlertCircle,
  RefreshCw,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PendingApprovals from "../components/PendingApprovals";

interface Counts {
  propertyOwners: number;
  tenants: number;
  properties: number;
  payments: number;
  invoices: number;
  admins: number;
}

interface PaymentSummary {
  totalCollected: number;
  totalPaidInvoices: number;
  totalUnpaidInvoices: number;
  totalInvoices: number;
  pendingInvoicesCount: number;
}

export default function AdminDashboard() {
  const router = useRouter();

  const [counts, setCounts] = useState<Counts>({
    propertyOwners: 0,
    tenants: 0,
    properties: 0,
    payments: 0,
    invoices: 0,
    admins: 0,
  });

  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({
    totalCollected: 0,
    totalPaidInvoices: 0,
    totalUnpaidInvoices: 0,
    totalInvoices: 0,
    pendingInvoicesCount: 0,
  });

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Session check ───────────────────────────────────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Fetch dashboard data ────────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const [ownersRes, tenantsRes, propsRes, paymentsRes, invoicesRes, adminsRes] = await Promise.all([
        fetch("/api/admin/property-owners", { credentials: "include" }),
        fetch("/api/admin/tenants", { credentials: "include" }),
        fetch("/api/admin/properties", { credentials: "include" }),
        fetch("/api/admin/payments", { credentials: "include" }),
        fetch("/api/admin/invoices", { credentials: "include" }),
        fetch("/api/admin", { credentials: "include" }),
      ]);

      const responses = [ownersRes, tenantsRes, propsRes, paymentsRes, invoicesRes, adminsRes];
      for (const res of responses) {
        if (res.status === 401 || res.status === 403) {
          router.replace("/admin/login?session=expired");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      const [owners, tenants, properties, payments, invoices, admins] = await Promise.all(
        responses.map((r) => r.json())
      );

      setCounts({
        propertyOwners: owners?.count ?? owners?.propertyOwners?.length ?? 0,
        tenants: tenants?.count ?? tenants?.tenants?.length ?? 0,
        properties: properties?.count ?? properties?.properties?.length ?? 0,
        payments: payments?.count ?? 0,
        invoices: invoices?.count ?? 0,
        admins: admins?.count ?? 0,
      });

      setPaymentSummary({
        totalCollected: payments?.totalCollected ?? 0,
        totalPaidInvoices: invoices?.totalPaid ?? 0,
        totalUnpaidInvoices: invoices?.totalUnpaid ?? 0,
        totalInvoices: invoices?.count ?? 0,
        pendingInvoicesCount: invoices?.pendingCount ?? 0,
      });
    } catch (err: any) {
      console.error("Dashboard fetch failed:", err);
      setError(
        err.message?.includes("Session expired")
          ? "Your session has expired. Please log in again."
          : "Failed to load dashboard data. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status, fetchDashboardData]);

  // ── Combined cards (original + payments/invoices) ──────────────────────────
  const allCards = [
    // New payment & invoice focused cards
    {
      title: "Total Collected",
      value: `KSh ${paymentSummary.totalCollected.toLocaleString()}`,
      icon: DollarSign,
      color: "green",
      explanation: "Total amount from successful payments received system-wide.",
    },
    {
      title: "Paid Invoices",
      value: `KSh ${paymentSummary.totalPaidInvoices.toLocaleString()}`,
      icon: CheckCircle2,
      color: "emerald",
      explanation: "Total amount from invoices marked as paid or completed.",
    },
    {
      title: "Unpaid Invoices",
      value: `KSh ${paymentSummary.totalUnpaidInvoices.toLocaleString()}`,
      icon: AlertTriangle,
      color: "red",
      explanation: "Total outstanding amount from pending/unpaid invoices.",
    },
    {
      title: "Pending Count",
      value: paymentSummary.pendingInvoicesCount.toLocaleString(),
      icon: Clock,
      color: "amber",
      explanation: "Number of invoices still awaiting payment.",
    },
    // Original stats
    {
      title: "Property Owners",
      value: counts.propertyOwners.toLocaleString(),
      icon: Users,
      color: "emerald",
      explanation: "Total number of registered property owners in the system.",
    },
    {
      title: "Tenants",
      value: counts.tenants.toLocaleString(),
      icon: Users,
      color: "blue",
      explanation: "Total active tenants across all properties.",
    },
    {
      title: "Properties",
      value: counts.properties.toLocaleString(),
      icon: Building2,
      color: "purple",
      explanation: "Total number of properties listed and managed.",
    },
    {
      title: "Payments",
      value: counts.payments.toLocaleString(),
      icon: CreditCard,
      color: "green",
      explanation: "Total payment transactions processed to date.",
    },
    {
      title: "Invoices",
      value: counts.invoices.toLocaleString(),
      icon: FileText,
      color: "indigo",
      explanation: "Total invoices generated and sent.",
    },
    {
      title: "Admins",
      value: counts.admins.toLocaleString(),
      icon: Shield,
      color: "pink",
      explanation: "Total admin accounts with management privileges.",
    },
  ];

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-[#03a678]"></div>
          <p className="text-lg font-medium text-gray-700">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-10 mt-6 sm:mt-8">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#03a678] to-[#027a55] text-white shadow-md">
              <Shield size={24} className="sm:size-[28px]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-8 sm:mb-10 bg-red-50 border border-red-200 text-red-700 px-5 py-4 sm:px-6 sm:py-5 rounded-2xl flex items-start gap-3 sm:gap-4">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm sm:text-base">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchDashboardData();
                  }}
                  className="mt-2 sm:mt-3 inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={14} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg h-36 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Single unified grid – original + new cards together */}
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5 lg:gap-6 mb-10 sm:mb-12">
                {allCards.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.45 }}
                    className="group relative bg-white/95 backdrop-blur-sm rounded-2xl p-5 sm:p-6 shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100/80 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <p className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide">
                        {item.title}
                      </p>
                      <div className="relative group/info">
                        <Info
                          className="text-[#03a678]/70 hover:text-[#03a678] transition-colors cursor-help"
                          size={16}
                        />
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover/info:block z-50 pointer-events-none">
                          <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 min-w-[200px] leading-relaxed shadow-xl">
                            {item.explanation}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {item.value}
                      </p>
                      <div className={`p-3 sm:p-4 rounded-xl bg-${item.color}-50/70`}>
                        <item.icon className={`h-7 w-7 sm:h-8 sm:w-8 text-${item.color}-600`} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Pending Approvals */}
              <div className="mt-8 sm:mt-10">
                <PendingApprovals />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}