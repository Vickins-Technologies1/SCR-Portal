// app/admin/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Home, Users, Building2, CreditCard, FileText, Shield } from "lucide-react";
import Navbar from "../components/Navbar";     // adjust path
import Sidebar from "../components/Sidebar";   // adjust path
import PendingApprovals from "../components/PendingApprovals";

interface Counts {
  propertyOwners: number;
  tenants: number;
  properties: number;
  payments: number;
  invoices: number;
  admins: number;
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

  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Session check using secure httpOnly cookies ─────────────────────────────
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Session invalid");
      }

      const data = await res.json();

      if (!data.authenticated) {
        throw new Error("Not authenticated");
      }

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

  // ── Fetch dashboard stats only when authenticated ───────────────────────────
  const fetchCounts = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const endpoints = [
        "/api/admin/property-owners",
        "/api/admin/tenants",
        "/api/admin/properties",
        "/api/admin/payments",
        "/api/admin/invoices",
        "/api/admin",
      ];

      const results = await Promise.all(
        endpoints.map(async (url) => {
          const res = await fetch(url, {
            credentials: "include",
            headers: { "Cache-Control": "no-cache" },
          });

          if (res.status === 401 || res.status === 403) {
            router.replace("/admin/login?session=expired");
            throw new Error("Session expired");
          }

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          return res.json();
        })
      );

      setCounts({
        propertyOwners: results[0]?.count ?? 0,
        tenants: results[1]?.count ?? 0,
        properties: results[2]?.count ?? results[2]?.properties?.length ?? 0,
        payments: results[3]?.count ?? 0,
        invoices: results[4]?.count ?? 0,
        admins: results[5]?.count ?? 0,
      });
    } catch (err: any) {
      console.error("Dashboard fetch failed:", err);
      setError(
        err.message.includes("Session expired")
          ? "Your session has expired."
          : "Failed to load data. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchCounts();
    }
  }, [status, fetchCounts]);

  // ── Rendering ───────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-lg text-gray-600">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
          Verifying session...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // already redirected
  }

return (
  <div className="min-h-screen bg-white">
    <Navbar />
    <Sidebar />
    <div className="sm:ml-64 mt-16 p-6 lg:p-8">
      <main className="max-w-7xl mx-auto">
        <h1 className="text-3xl lg:text-4xl font-extrabold flex items-center gap-3 mb-8">
          <Home className="h-8 w-8 text-indigo-600" />
          Admin Dashboard
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            <span className="ml-4 text-lg text-gray-600">Loading...</span>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {[
                { icon: Users, title: "Property Owners", count: counts.propertyOwners, color: "indigo" },
                { icon: Users, title: "Tenants", count: counts.tenants, color: "blue" },
                { icon: Building2, title: "Properties", count: counts.properties, color: "purple" },
                { icon: CreditCard, title: "Payments", count: counts.payments, color: "green" },
                { icon: FileText, title: "Invoices", count: counts.invoices, color: "yellow" },
                { icon: Shield, title: "Admins", count: counts.admins, color: "red" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white p-6 rounded-2xl shadow border border-gray-100 hover:shadow-xl transition-all duration-300 group"
                >
                  <div
                    className={`w-14 h-14 rounded-xl bg-${item.color}-100/40 flex items-center justify-center mb-4 group-hover:bg-${item.color}-100/70 transition-colors`}
                  >
                    <item.icon className={`h-7 w-7 text-${item.color}-600`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-1">{item.title}</h3>
                  <p className="text-4xl font-bold text-gray-900">{item.count.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Pending Approvals Section */}
            <PendingApprovals />
          </>
        )}
      </main>
    </div>
  </div>
);
}