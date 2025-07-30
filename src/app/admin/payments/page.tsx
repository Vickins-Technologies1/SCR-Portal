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
  transactionId: string;
  status: "completed" | "pending" | "failed" | "cancelled";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPayments, setTotalPayments] = useState(0);
  const [csrfToken, setCsrfToken] = useState<string>("");

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token");
        const data = await res.json();
        if (data.success) {
          setCsrfToken(data.csrfToken);
        } else {
          setError("Failed to fetch CSRF token.");
        }
      } catch {
        setError("Failed to connect to server for CSRF token.");
      }
    };
    fetchCsrfToken();
  }, []);

  // Check cookies and redirect if unauthorized
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
    if (!userId || role !== "admin" || !csrfToken) return;

    setIsLoading(true);
    try {
      const [paymentsRes, usersRes, propertiesRes] = await Promise.all([
        fetch(`/api/payments?page=${currentPage}&limit=${itemsPerPage}&sort=-createdAt`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        }),
        fetch("/api/admin/users", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        }),
        fetch("/api/admin/properties", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        }),
      ]);

      const responses = [paymentsRes, usersRes, propertiesRes];
      const endpoints = ["/api/payments", "/api/admin/users", "/api/admin/properties"];
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
        setTotalPayments(paymentsData.total || 0);
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
    } catch (error: unknown) {
      console.error("Fetch data error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, role, currentPage, itemsPerPage, csrfToken]);

  useEffect(() => {
    if (userId && role === "admin" && csrfToken) {
      console.log("Fetching data for PaymentsPage:", { userId, role, currentPage });
      fetchData();
    }
  }, [userId, role, currentPage, fetchData, csrfToken]);

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

  const totalPages = Math.ceil(totalPayments / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6">
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
              <span className="ml-2">Loading payments...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No payments found.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("transactionId")}
                    >
                      Transaction ID {getSortIcon("transactionId")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("userEmail")}
                    >
                      Owner Email {getSortIcon("userEmail")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("propertyName")}
                    >
                      Property Name {getSortIcon("propertyName")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("unitType")}
                    >
                      Unit Type {getSortIcon("unitType")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("amount")}
                    >
                      Amount (Ksh) {getSortIcon("amount")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("createdAt")}
                    >
                      Payment Date {getSortIcon("createdAt")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("status")}
                    >
                      Status {getSortIcon("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment._id} className="border-t hover:bg-gray-50 transition">
                      <td className="px-4 py-3">{payment.transactionId}</td>
                      <td className="px-4 py-3">{propertyOwners.find((u) => u._id === payment.userId)?.email || "N/A"}</td>
                      <td className="px-4 py-3">{properties.find((p) => p._id === payment.propertyId)?.name || "N/A"}</td>
                      <td className="px-4 py-3">{payment.unitType || "N/A"}</td>
                      <td className="px-4 py-3">Ksh {payment.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">{new Date(payment.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{payment.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing {payments.length} of {totalPayments} payments
                </div>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      aria-label="Previous page"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
        body {
          font-family: "Inter", sans-serif;
        }
      `}</style>
    </div>
  );
}