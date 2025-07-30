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
    setIsLoading(true);
    try {
      const [propertyOwnersRes, tenantsRes, propertiesRes, paymentsRes, invoicesRes, adminsRes] = await Promise.all([
        fetch("/api/admin/property-owners", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/tenants", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/properties", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/payments", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/invoices", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
      ]);

      const responses = [propertyOwnersRes, tenantsRes, propertiesRes, paymentsRes, invoicesRes, adminsRes];
      const endpoints = ["/api/admin/property-owners", "/api/admin/tenants", "/api/admin/properties", "/api/payments", "/api/invoices", "/api/admin/admins"];
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
        ].filter(msg => msg).join("; ");
        setError(`Failed to fetch dashboard data: ${errors || "Unknown error"}`);
      }
    } catch (error: unknown) {
      console.error("Fetch counts error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") {
      console.log("Fetching counts for user:", { userId, role });
      fetchCounts();
    }
  }, [userId, role, fetchCounts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <Home className="text-[#012a4a] h-6 w-6" />
            Admin Dashboard
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in">
                <Users className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Property Owners</h3>
                <p className="text-2xl font-bold">{counts.propertyOwners}</p>
              </div>
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: "100ms" }}>
                <Users className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Tenants</h3>
                <p className="text-2xl font-bold">{counts.tenants}</p>
              </div>
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: "200ms" }}>
                <Building2 className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Properties</h3>
                <p className="text-2xl font-bold">{counts.properties}</p>
              </div>
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: "300ms" }}>
                <CreditCard className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Payments</h3>
                <p className="text-2xl font-bold">{counts.payments}</p>
              </div>
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: "400ms" }}>
                <FileText className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Invoices</h3>
                <p className="text-2xl font-bold">{counts.invoices}</p>
              </div>
              <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: "500ms" }}>
                <Shield className="h-8 w-8 mb-2" />
                <h3 className="text-lg font-semibold">Admins</h3>
                <p className="text-2xl font-bold">{counts.admins}</p>
              </div>
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.5s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}