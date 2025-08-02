
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { FileText, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
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

interface Invoice {
  _id: string;
  paymentId: string;
  userId: string;
  propertyId: string;
  unitType: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  createdAt: string;
  dueDate: string;
  updatedAt?: string;
}

interface SortConfig {
  key: keyof Invoice | "userEmail" | "propertyName";
  direction: "asc" | "desc";
}

interface ApiResponse {
  success: boolean;
  invoices?: Invoice[];
  users?: User[];
  properties?: Property[];
  total?: number;
  message?: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch CSRF token and check cookies
  useEffect(() => {
    const checkCookiesAndFetchCsrf = async () => {
      const uid = Cookies.get("userId");
      const userRole = Cookies.get("role");
      console.log("Checking cookies in InvoicesPage:", { userId: uid, role: userRole });

      if (!uid || userRole !== "admin") {
        console.log("Redirecting to /admin/login due to invalid cookies:", { userId: uid, role: userRole });
        setError("Unauthorized. Please log in as an admin.");
        router.push("/admin/login");
        return;
      }

      setUserId(uid);
      setRole(userRole);

      const token = Cookies.get("csrf-token");
      if (token) {
        setCsrfToken(token);
        return;
      }

      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (data.csrfToken) {
          Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", expires: 1 });
          setCsrfToken(data.csrfToken);
        } else {
          console.error("Failed to fetch CSRF token:", data);
          setError("Failed to initialize session. Please try again.");
        }
      } catch (err) {
        console.error("CSRF token fetch error:", err);
        setError("Failed to connect to server for CSRF token.");
      }
    };

    checkCookiesAndFetchCsrf();

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

  const fetchData = useCallback(async () => {
    if (!userId || role !== "admin" || !csrfToken) {
      setError("Required authentication or CSRF token not available.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [invoicesRes, usersRes, propertiesRes] = await Promise.all([
        fetch(`/api/invoices?page=${currentPage}&limit=${itemsPerPage}&sort=-createdAt`, {
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

      const responses = [invoicesRes, usersRes, propertiesRes];
      const endpoints = ["/api/invoices", "/api/admin/users", "/api/admin/properties"];
      const responseBodies: (ApiResponse | string)[] = [];

      for (let i = 0; i < responses.length; i++) {
        const res = responses[i];
        if (!res.ok) {
          const body = await res.text();
          console.error(`Failed to fetch ${endpoints[i]}: ${res.status} ${res.statusText}`, { body });
          responseBodies[i] = body;
        } else {
          responseBodies[i] = await res.json();
        }
      }

      const [invoicesData, usersData, propertiesData] = responseBodies as [ApiResponse, ApiResponse, ApiResponse];

      console.log("API responses:", { invoicesData, usersData, propertiesData });

      if (invoicesData.success && usersData.success && propertiesData.success) {
        setInvoices(invoicesData.invoices || []);
        setTotalInvoices(invoicesData.total || 0);
        setPropertyOwners(usersData.users?.filter((u) => u.role === "propertyOwner") || []);
        setProperties(propertiesData.properties || []);
      } else {
        const errors = [
          invoicesData.message || (invoicesRes.status === 403 && "Invalid or missing CSRF token"),
          usersData.message || (usersRes.status === 403 && "Invalid or missing CSRF token"),
          propertiesData.message || (propertiesRes.status === 403 && "Invalid or missing CSRF token"),
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
      console.log("Fetching data for InvoicesPage:", { userId, role, currentPage, csrfToken });
      fetchData();
    }
  }, [userId, role, currentPage, fetchData, csrfToken]);

  const handleSort = useCallback(
    (key: keyof Invoice | "userEmail" | "propertyName") => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
        const sorted = [...invoices].sort((a, b) => {
          if (key === "amount") {
            return direction === "asc" ? a.amount - b.amount : b.amount - a.amount;
          }
          if (key === "createdAt" || key === "dueDate") {
            return direction === "asc"
              ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
              : new Date(b[key]).getTime() - new Date(a[key]).getTime();
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
        setInvoices(sorted);
        return { key, direction };
      });
    },
    [invoices, propertyOwners, properties]
  );

  const getSortIcon = useCallback(
    (key: keyof Invoice | "userEmail" | "propertyName") => {
      if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
      return sortConfig.direction === "asc" ? (
        <ChevronUp className="inline ml-1 h-4 w-4" />
      ) : (
        <ChevronDown className="inline ml-1 h-4 w-4" />);
    },
    [sortConfig]
  );

  const handleGenerateInvoice = useCallback(
    async (invoice: Invoice) => {
      if (!csrfToken) {
        setError("CSRF token not available. Please refresh the page.");
        return;
      }

      try {
        const res = await fetch("/api/invoices/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            invoiceId: invoice._id,
            userEmail: propertyOwners.find((u) => u._id === invoice.userId)?.email || "N/A",
            propertyName: properties.find((p) => p._id === invoice.propertyId)?.name || "N/A",
            unitType: invoice.unitType,
            amount: invoice.amount,
            createdAt: invoice.createdAt,
            dueDate: invoice.dueDate,
            status: invoice.status,
          }),
        });
        const data = await res.json();
        if (data.success && data.pdf) {
          const link = document.createElement("a");
          link.href = `data:application/pdf;base64,${data.pdf}`;
          link.download = `invoice-${invoice._id}.pdf`;
          link.click();
        } else {
          setError(data.message || "Failed to generate invoice.");
        }
      } catch (error: unknown) {
        console.error("Generate invoice error:", error instanceof Error ? error.message : String(error));
        setError("Failed to connect to the server.");
      }
    },
    [csrfToken, propertyOwners, properties]
  );

  const handleStatusChange = useCallback(
    async (invoiceId: string, newStatus: "pending" | "paid" | "overdue") => {
      if (!csrfToken) {
        setError("CSRF token not available. Please refresh the page.");
        return;
      }

      try {
        const res = await fetch("/api/invoices/update-status", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ invoiceId, status: newStatus }),
        });
        const data = await res.json();
        if (data.success) {
          setInvoices((prev) =>
            prev.map((invoice) =>
              invoice._id === invoiceId ? { ...invoice, status: newStatus } : invoice
            )
          );
        } else {
          setError(data.message || "Failed to update invoice status.");
        }
      } catch (error: unknown) {
        console.error("Update invoice status error:", error instanceof Error ? error.message : String(error));
        setError("Failed to connect to the server.");
      }
    },
    [csrfToken]
  );

  const totalPages = Math.ceil(totalInvoices / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <FileText className="text-[#012a4a] h-6 w-6" />
            Invoices
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
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-md">
                <thead className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white">
                  <tr>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("amount")}
                    >
                      Amount {getSortIcon("amount")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("userEmail")}
                    >
                      Owner Email {getSortIcon("userEmail")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("propertyName")}
                    >
                      Property Name {getSortIcon("propertyName")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("unitType")}
                    >
                      Unit Type {getSortIcon("unitType")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("status")}
                    >
                      Status {getSortIcon("status")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("createdAt")}
                    >
                      Created At {getSortIcon("createdAt")}
                    </th>
                    <th
                      className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                      onClick={() => handleSort("dueDate")}
                    >
                      Due Date {getSortIcon("dueDate")}
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 px-4 text-center text-gray-600">
                        No invoices found.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((i, index) => (
                      <tr
                        key={i._id}
                        className="border-b border-gray-200 hover:bg-gray-50 animate-fade-in"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <td className="py-3 px-4 text-sm text-gray-800">Ksh {i.amount.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {propertyOwners.find((u) => u._id === i.userId)?.email || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {properties.find((p) => p._id === i.propertyId)?.name || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{i.unitType}</td>
                        <td className="py-3 px-4 text-sm">
                          <select
                            value={i.status}
                            onChange={(e) => handleStatusChange(i._id, e.target.value as "pending" | "paid" | "overdue")}
                            className={`text-sm p-1 rounded border ${
                              i.status === "paid"
                                ? "text-green-600 border-green-600"
                                : i.status === "overdue"
                                ? "text-red-600 border-red-600"
                                : "text-yellow-600 border-yellow-600"
                            } bg-white`}
                            aria-label={`Change status for invoice ${i._id}`}
                          >
                            <option value="pending" className="text-yellow-600">
                              pending
                            </option>
                            <option value="paid" className="text-green-600">
                              paid
                            </option>
                            <option value="overdue" className="text-red-600">
                              overdue
                            </option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {new Date(i.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {new Date(i.dueDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <button
                            onClick={() => handleGenerateInvoice(i)}
                            className="px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] hover:scale-105 transform transition-all duration-300 text-sm"
                            aria-label={`Generate PDF for invoice ${i._id}`}
                          >
                            Generate PDF
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {invoices.length} of {totalInvoices} invoices
                  </div>
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
                </div>
              )}
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
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          text-align: left;
          vertical-align: middle;
        }
        th {
          font-weight: 600;
        }
        tr {
          transition: background-color 0.2s;
        }
      `}</style>
    </div>
  );
}