"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CreditCard, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface User {
  _id: string;
  email: string;
  role: "tenant" | "propertyOwner" | "admin";
}

interface Property {
  _id: string;
  name: string;
}

interface Payment {
  _id: string;
  userId: string;
  propertyId: string;
  unitType: string;
  amount: number;
  createdAt: string;
}

interface SortConfig {
  key: keyof Payment | "userEmail" | "propertyName";
  direction: "asc" | "desc";
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

  useEffect(() => {
    const checkCookies = () => {
      const uid = Cookies.get("userId");
      const userRole = Cookies.get("role");
      console.log("Checking cookies in PaymentsPage:", { userId: uid, role: userRole });

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

    // Poll for cookies in case they are set asynchronously
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

    // Cleanup interval on unmount
    return () => clearInterval(cookiePoll);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!userId || role !== "admin") return;

    setIsLoading(true);
    try {
      const [paymentsRes, usersRes, propertiesRes] = await Promise.all([
        fetch("/api/payments", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }),
        fetch("/api/admin/users", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }),
        fetch("/api/admin/properties", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }),
      ]);

      const responses = [paymentsRes, usersRes, propertiesRes];
      const endpoints = ["/api/admin/payments", "/api/admin/users", "/api/admin/properties"];
      responses.forEach((res, index) => {
        if (!res.ok) {
          console.error(`Failed to fetch ${endpoints[index]}: ${res.status} ${res.statusText}`);
        }
      });

      const [paymentsData, usersData, propertiesData] = await Promise.all([
        paymentsRes.json(),
        usersRes.json(),
        propertiesRes.json(),
      ]);

      console.log("API responses:", { paymentsData, usersData, propertiesData });

      if (paymentsData.success && usersData.success && propertiesData.success) {
        setPayments(paymentsData.payments || []);
        setPropertyOwners(usersData.users.filter((u: User) => u.role === "propertyOwner") || []);
        setProperties(propertiesData.properties || []);
      } else {
        const errors = [
          paymentsData.message,
          usersData.message,
          propertiesData.message,
        ].filter((msg) => msg).join("; ");
        setError(`Failed to fetch data: ${errors || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Fetch data error:", error);
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, role]);

  useEffect(() => {
    if (userId && role === "admin") {
      console.log("Fetching data for PaymentsPage:", { userId, role });
      fetchData();
    }
  }, [userId, role, fetchData]);

  const handleSort = useCallback(
    (key: keyof Payment | "userEmail" | "propertyName") => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
        const sorted = [...payments].sort((a, b) => {
          if (key === "amount") {
            return direction === "asc" ? a.amount - b.amount : b.amount - a.amount;
          }
          if (key === "createdAt") {
            return direction === "asc"
              ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (key === "propertyName") {
            const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
            const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
            return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
          }
          if (key === "userEmail") {
            const aEmail = propertyOwners.find((u) => u._id === a.userId)?.email || "";
            const bEmail = propertyOwners.find((u) => u._id === b.userId)?.email || "";
            return direction === "asc" ? aEmail.localeCompare(bEmail) : bEmail.localeCompare(aEmail);
          }
          return direction === "asc"
            ? String(a[key] ?? "").localeCompare(String(b[key] ?? ""))
            : String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
        });
        setPayments(sorted);
        return { key, direction };
      });
    },
    [payments, propertyOwners, properties]
  );

  const getSortIcon = useCallback(
    (key: keyof Payment | "userEmail" | "propertyName") => {
      if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
      return sortConfig.direction === "asc" ? (
        <span className="inline ml-1">↑</span>
      ) : (
        <span className="inline ml-1">↓</span>
      );
    },
    [sortConfig]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <CreditCard className="text-[#012a4a] h-6 w-6" />
            Payments
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {payments.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                  No payments found.
                </div>
              ) : (
                payments.map((p, index) => (
                  <div
                    key={p._id}
                    className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transform transition-all duration-300 hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <CreditCard className="text-[#012a4a] h-5 w-5" />
                      <h3
                        className="text-lg font-semibold text-[#012a4a] cursor-pointer"
                        onClick={() => handleSort("amount")}
                      >
                        Ksh {p.amount.toFixed(2)} {getSortIcon("amount")}
                      </h3>
                    </div>
                    <p
                      className="text-sm text-gray-600 mb-1 cursor-pointer"
                      onClick={() => handleSort("userEmail")}
                    >
                      <span className="font-medium">Owner:</span>{" "}
                      {propertyOwners.find((u) => u._id === p.userId)?.email || "N/A"}{" "}
                      {getSortIcon("userEmail")}
                    </p>
                    <p
                      className="text-sm text-gray-600 mb-1 cursor-pointer"
                      onClick={() => handleSort("propertyName")}
                    >
                      <span className="font-medium">Property:</span>{" "}
                      {properties.find((prop) => prop._id === p.propertyId)?.name || "N/A"}{" "}
                      {getSortIcon("propertyName")}
                    </p>
                    <p
                      className="text-sm text-gray-600 mb-1 cursor-pointer"
                      onClick={() => handleSort("unitType")}
                    >
                      <span className="font-medium">Unit:</span> {p.unitType || "N/A"}{" "}
                      {getSortIcon("unitType")}
                    </p>
                    <p
                      className="text-sm text-gray-600 cursor-pointer"
                      onClick={() => handleSort("createdAt")}
                    >
                      <span className="font-medium">Date:</span>{" "}
                      {new Date(p.createdAt).toLocaleDateString()} {getSortIcon("createdAt")}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
        body {
          font-family: "Inter", sans-serif;
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