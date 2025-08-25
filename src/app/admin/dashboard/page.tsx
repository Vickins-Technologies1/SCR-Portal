"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Users, Building2, CreditCard, FileText, Shield } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

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
  const [counts, setCounts] = useState<Counts>({ propertyOwners: 0, tenants: 0, properties: 0, payments: 0, invoices: 0, admins: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    const checkCookies = () => {
      const uid = Cookies.get("userId");
      const userRole = Cookies.get("role");
      console.log("Checking cookies in AdminDashboard:", { userId: uid, role: userRole });

      if (!uid || userRole !== "admin") {
        console.log("Redirecting to /admin/login due to invalid cookies:", { userId: uid, role: userRole });
        setError("Unauthorized. Please log in as an admin.");
        router.push("/admin/login");
      } else {
        setUserId(uid);
        setRole(userRole);
      }

      const token = Cookies.get("csrf-token");
      if (!token) {
        fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.csrfToken) {
              Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
              setCsrfToken(data.csrfToken);
            } else {
              console.error("Failed to fetch CSRF token");
              setError("Failed to initialize session. Please try again.");
            }
          })
          .catch((err) => {
            console.error("CSRF token fetch error:", err);
            setError("Failed to initialize session. Please try again.");
          });
      } else {
        setCsrfToken(token);
      }
    };

    checkCookies();

    const cookiePoll = setInterval(() => {
      const uid = Cookies.get("userId");
      const userRole = Cookies.get("role");
      if (uid && userRole === "admin") {
        console.log("Cookies detected on poll:", { userId: uid, role: userRole });
        setUserId(uid);
        setRole(userRole);
        clearInterval(cookiePoll);
      }
    }, 100);

    return () => clearInterval(cookiePoll);
  }, [router]);

  const fetchCounts = useCallback(async () => {
    if (!csrfToken) {
      setError("CSRF token not available. Please try again.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [propertyOwnersRes, tenantsRes, propertiesRes, paymentsRes, invoicesRes, adminsRes] = await Promise.all([
        fetch("/api/admin/property-owners", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin/tenants", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin/properties", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin/payments", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin/invoices", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/admin", {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
        }),
      ]);

      const responses = [propertyOwnersRes, tenantsRes, propertiesRes, paymentsRes, invoicesRes, adminsRes];
      const endpoints = ["/api/admin/property-owners", "/api/admin/tenants", "/api/admin/properties", "/api/admin/payments", "/api/admin/invoices", "/api/admin"];
      responses.forEach((res, index) => {
        if (!res.ok) {
          console.error(`Failed to fetch ${endpoints[index]}: ${res.status} ${res.statusText}`);
        }
      });

      const [propertyOwnersData, tenantsData, propertiesData, paymentsData, invoicesData, adminsData] = await Promise.all([
        propertyOwnersRes.json(),
        tenantsRes.json(),
        propertiesRes.json(),
        paymentsRes.json(),
        invoicesRes.json(),
        adminsRes.json(),
      ]);

      console.log("API responses:", { propertyOwnersData, tenantsData, propertiesData, paymentsData, invoicesData, adminsData });

      if (
        propertyOwnersData.success &&
        tenantsData.success &&
        propertiesData.success &&
        paymentsData.success &&
        invoicesData.success &&
        adminsData.success
      ) {
        setCounts({
          propertyOwners: propertyOwnersData.count || 0,
          tenants: tenantsData.count || 0,
          properties: propertiesData.properties?.length || 0,
          payments: paymentsData.count || 0,
          invoices: invoicesData.count || 0,
          admins: adminsData.count || 0,
        });
      } else {
        const errors = [
          propertyOwnersData.message,
          tenantsData.message,
          propertiesData.message,
          paymentsData.message,
          invoicesData.message,
          adminsData.message,
        ].filter((msg) => msg).join("; ");
        setError(`Failed to fetch dashboard data: ${errors || "Unknown error"}`);
      }
    } catch (error: unknown) {
      console.error("Fetch counts error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    if (userId && role === "admin" && csrfToken) {
      console.log("Fetching counts for user:", { userId, role });
      fetchCounts();
    }
  }, [userId, role, csrfToken, fetchCounts]);

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16 p-6 lg:p-8">
        <main className="max-w-7xl mx-auto">
          <h1 className="text-3xl lg:text-4xl font-extrabold flex items-center gap-3 text-gray-900 mb-8 animate-slide-in-left">
            <Home className="h-8 w-8 text-indigo-600" />
            Admin Dashboard
          </h1>
          {error && (
            <div className="bg-red-100 border border-red-200 text-red-600 p-4 rounded-xl mb-6 animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-lg text-gray-600">Loading Dashboard...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Users, title: "Property Owners", count: counts.propertyOwners, color: "indigo", delay: "0ms" },
                { icon: Users, title: "Tenants", count: counts.tenants, color: "blue", delay: "100ms" },
                { icon: Building2, title: "Properties", count: counts.properties, color: "purple", delay: "200ms" },
                { icon: CreditCard, title: "Payments", count: counts.payments, color: "green", delay: "300ms" },
                { icon: FileText, title: "Invoices", count: counts.invoices, color: "yellow", delay: "400ms" },
                { icon: Shield, title: "Admins", count: counts.admins, color: "red", delay: "500ms" },
              ].map((item, index) => (
                <div
                  key={index}
                  className={`relative bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 animate-fade-in-up`}
                  style={{ animationDelay: item.delay }}
                >
                  <div className={`absolute inset-0 bg-gradient-to-r from-transparent to-${item.color}-100/20 rounded-2xl`}></div>
                  <div className="relative flex items-center gap-4">
                    <item.icon className={`h-10 w-10 text-${item.color}-600`} />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-700">{item.title}</h3>
                      <p className="text-3xl font-bold text-gray-900">{item.count}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.6s ease-out;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}