
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  FileText,
  CreditCard,
  BarChart,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
} from "lucide-react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: string; managementFee: number }[];
}

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  status: string;
  paymentStatus: string;
  leaseStart: string;
  walletBalance: number;
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
}

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility";
  phoneNumber?: string;
  reference?: string;
  date: string;
  tenantName?: string;
}

interface Balance {
  propertyId: string;
  tenantId: string;
  tenantName: string;
  totalDue: number;
  totalPaid: number;
  outstandingBalance: number;
}

interface FilterConfig {
  propertyId: string;
  status: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  properties?: Property[];
  tenants?: Tenant[];
  invoices?: Invoice[];
  payments?: Payment[];
  total?: number;
  message?: string;
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [filters, setFilters] = useState<FilterConfig>({ propertyId: "all", status: "all" });
  const [expandedSections, setExpandedSections] = useState<string[]>(["overview"]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch CSRF token and check cookies
  useEffect(() => {
    const checkCookiesAndFetchCsrf = async () => {
      const uid = Cookies.get("userId");
      const userRole = Cookies.get("role");
      console.log("Checking cookies in PropertyOwnerDashboard:", { userId: uid, role: userRole });

      if (!uid || userRole !== "propertyOwner") {
        console.log("Redirecting to /login due to invalid cookies:", { userId: uid, role: userRole });
        setError("Unauthorized. Please log in as a property owner.");
        router.push("/login");
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
        const data: ApiResponse<{ csrfToken: string }> = await res.json();
        if (data.success && data.data?.csrfToken) {
          Cookies.set("csrf-token", data.data.csrfToken, { sameSite: "strict", expires: 1 });
          setCsrfToken(data.data.csrfToken);
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
      if (uid && userRole === "propertyOwner") {
        console.log("Cookies detected on poll:", { userId: uid, role: userRole });
        setUserId(uid);
        setRole(userRole);
        clearInterval(cookiePoll);
      }
    }, 100);

    return () => clearInterval(cookiePoll);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!userId || role !== "propertyOwner" || !csrfToken) {
      setError("Required authentication or CSRF token not available.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [propertiesRes, tenantsRes, invoicesRes, paymentsRes] = await Promise.all([
        fetch("/api/properties", {
          method: "GET",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/tenants", {
          method: "GET",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/invoices", {
          method: "GET",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
        fetch("/api/payments", {
          method: "GET",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          credentials: "include",
        }),
      ]);

      const responses = [propertiesRes, tenantsRes, invoicesRes, paymentsRes];
      const endpoints = ["/api/properties", "/api/tenants", "/api/invoices", "/api/payments"];
      const responseBodies: (
        | ApiResponse<Property[]>
        | ApiResponse<Tenant[]>
        | ApiResponse<Invoice[]>
        | ApiResponse<Payment[]>
        | string
      )[] = [];

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

      const [propertiesData, tenantsData, invoicesData, paymentsData] = responseBodies as [
        ApiResponse<Property[]>,
        ApiResponse<Tenant[]>,
        ApiResponse<Invoice[]>,
        ApiResponse<Payment[]>,
      ];

      console.log("API responses:", { propertiesData, tenantsData, invoicesData, paymentsData });

      if (
        propertiesData.success &&
        tenantsData.success &&
        invoicesData.success &&
        paymentsData.success
      ) {
        setProperties(propertiesData.properties || []);
        setTenants(tenantsData.tenants || []);
        setInvoices(invoicesData.invoices || []);
        setPayments(paymentsData.payments || []);
      } else {
        const errors = [
          propertiesData.message || (propertiesRes.status === 403 && "Invalid or missing CSRF token"),
          tenantsData.message,
          invoicesData.message,
          paymentsData.message,
        ].filter((msg) => msg).join("; ");
        setError(`Failed to fetch data: ${errors || "Unknown error"}`);
      }
    } catch (error: unknown) {
      console.error("Fetch data error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, role, csrfToken]);

  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      console.log("Fetching data for PropertyOwnerDashboard:", { userId, role, csrfToken });
      fetchData();
    }
  }, [userId, role, csrfToken, fetchData]);

  const calculateBalances = useCallback(() => {
    const balancesMap: { [key: string]: Balance } = {};

    tenants.forEach((tenant) => {
      if (filters.propertyId !== "all" && tenant.propertyId !== filters.propertyId) return;

      const tenantInvoices = invoices.filter((i) => i.userId === tenant._id && i.propertyId === tenant.propertyId);
      const tenantPayments = payments.filter((p) => p.tenantId === tenant._id && p.propertyId === tenant.propertyId);

      const totalDue = tenantInvoices.reduce((sum, i) => sum + i.amount, 0);
      const totalPaid = tenantPayments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0);

      balancesMap[tenant._id] = {
        propertyId: tenant.propertyId,
        tenantId: tenant._id,
        tenantName: tenant.name,
        totalDue,
        totalPaid,
        outstandingBalance: totalDue - totalPaid,
      };
    });

    const filteredBalances = Object.values(balancesMap).filter((b) => {
      if (filters.status === "all") return true;
      if (filters.status === "overdue") return b.outstandingBalance > 0;
      if (filters.status === "paid") return b.outstandingBalance === 0;
      return true;
    });

    setBalances(filteredBalances);
  }, [tenants, invoices, payments, filters]);

  useEffect(() => {
    calculateBalances();
  }, [calculateBalances]);

  const handleSort = useCallback(
    (key: keyof Balance) => {
      const sorted = [...balances].sort((a, b) => {
        if (key === "totalDue" || key === "totalPaid" || key === "outstandingBalance") {
          return a[key] - b[key];
        }
        return String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
      });
      setBalances(sorted);
    },
    [balances]
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const chartData = useMemo(() => {
    const propertyBalances = properties.map((property) => {
      const propertyInvoices = invoices.filter((i) => i.propertyId === property._id);
      const propertyPayments = payments.filter((p) => p.propertyId === property._id && p.status === "completed");

      const totalDue = propertyInvoices.reduce((sum, i) => sum + i.amount, 0);
      const totalPaid = propertyPayments.reduce((sum, p) => sum + p.amount, 0);

      return { name: property.name, totalDue, totalPaid };
    });

    return {
      labels: propertyBalances.map((p) => p.name),
      datasets: [
        {
          label: "Total Due",
          data: propertyBalances.map((p) => p.totalDue),
          backgroundColor: "rgba(255, 99, 132, 0.5)",
        },
        {
          label: "Total Paid",
          data: propertyBalances.map((p) => p.totalPaid),
          backgroundColor: "rgba(54, 162, 235, 0.5)",
        },
      ],
    };
  }, [properties, invoices, payments]);

  const handleEditTenant = (tenant: Tenant) => {
    router.push(`/tenants/edit/${tenant._id}`);
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!confirm("Are you sure you want to delete this tenant?")) return;

    if (!csrfToken) {
      setError("CSRF token not available. Please refresh the page.");
      return;
    }

    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data: ApiResponse<unknown> = await res.json();
      if (data.success) {
        setTenants(tenants.filter((t) => t._id !== tenantId));
        calculateBalances();
      } else {
        setError(data.message || "Failed to delete tenant.");
      }
    } catch (error: unknown) {
      console.error("Delete tenant error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server.");
    }
  };

  const handleGenerateInvoice = async (invoice: Invoice) => {
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
          userEmail: tenants.find((t) => t._id === invoice.userId)?.email || "N/A",
          propertyName: properties.find((p) => p._id === invoice.propertyId)?.name || "N/A",
          unitType: invoice.unitType,
          amount: invoice.amount,
          createdAt: invoice.createdAt,
          dueDate: invoice.dueDate,
          status: invoice.status,
        }),
      });
      const data: ApiResponse<{ pdf: string }> = await res.json();
      if (data.success && data.data?.pdf) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.data.pdf}`;
        link.download = `invoice-${invoice._id}.pdf`;
        link.click();
      } else {
        setError(data.message || "Failed to generate invoice.");
      }
    } catch (error: unknown) {
      console.error("Generate invoice error:", error instanceof Error ? error.message : String(error));
      setError("Failed to connect to the server.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 animate-fade-in-down">
            Property Owner Dashboard
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
            <div className="space-y-6">
              {/* Overview Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("overview")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <BarChart className="text-[#012a4a] h-5 w-5" />
                    Overview
                  </h2>
                  {expandedSections.includes("overview") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("overview") && (
                  <div className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-100 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-gray-600">Total Properties</h3>
                        <p className="text-2xl font-bold text-[#012a4a]">{properties.length}</p>
                      </div>
                      <div className="bg-gray-100 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-gray-600">Total Tenants</h3>
                        <p className="text-2xl font-bold text-[#012a4a]">{tenants.length}</p>
                      </div>
                      <div className="bg-gray-100 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-gray-600">Total Outstanding</h3>
                        <p className="text-2xl font-bold text-[#012a4a]">
                          Ksh {balances.reduce((sum, b) => sum + b.outstandingBalance, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold mb-2">Financial Overview</h3>
                      <Bar
                        data={chartData}
                        options={{
                          responsive: true,
                          plugins: { legend: { position: "top" }, title: { display: true, text: "Property Balances" } },
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Properties Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("properties")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Building2 className="text-[#012a4a] h-5 w-5" />
                    Properties
                  </h2>
                  {expandedSections.includes("properties") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("properties") && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Name</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Unit Types</th>
                        </tr>
                      </thead>
                      <tbody>
                        {properties.map((p) => (
                          <tr key={p._id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-800">{p.name}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {p.unitTypes.map((u) => u.type).join(", ") || "No units"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tenants Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("tenants")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Users className="text-[#012a4a] h-5 w-5" />
                    Tenants
                  </h2>
                  {expandedSections.includes("tenants") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("tenants") && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Name</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Email</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Property</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Status</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map((t) => (
                          <tr key={t._id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-800">{t.name}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{t.email}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {properties.find((p) => p._id === t.propertyId)?.name || "N/A"}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">{t.status}</td>
                            <td className="py-3 px-4 text-sm">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditTenant(t)}
                                  className="text-blue-600 hover:text-blue-800"
                                  aria-label={`Edit tenant ${t.name}`}
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTenant(t._id)}
                                  className="text-red-600 hover:text-red-800"
                                  aria-label={`Delete tenant ${t.name}`}
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Invoices Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("invoices")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <FileText className="text-[#012a4a] h-5 w-5" />
                    Invoices
                  </h2>
                  {expandedSections.includes("invoices") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("invoices") && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Property</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Tenant</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Amount</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Status</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Due Date</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((i) => (
                          <tr key={i._id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-800">
                              {properties.find((p) => p._id === i.propertyId)?.name || "N/A"}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {tenants.find((t) => t._id === i.userId)?.name || "N/A"}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">Ksh {i.amount.toFixed(2)}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{i.status}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {new Date(i.dueDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <button
                                onClick={() => handleGenerateInvoice(i)}
                                className="px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition"
                                aria-label={`Generate PDF for invoice ${i._id}`}
                              >
                                Generate PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payments Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("payments")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <CreditCard className="text-[#012a4a] h-5 w-5" />
                    Payments
                  </h2>
                  {expandedSections.includes("payments") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("payments") && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Transaction ID</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Tenant</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Property</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Amount</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Status</th>
                          <th className="py-3 px-4 text-left text-sm font-semibold">Payment Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p._id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-800">{p.transactionId}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{p.tenantName || "N/A"}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {properties.find((prop) => prop._id === p.propertyId)?.name || "N/A"}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">Ksh {p.amount.toFixed(2)}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{p.status}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {new Date(p.paymentDate).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Balances Section */}
              <div className="bg-white p-6 rounded-xl shadow-md">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleSection("balances")}
                >
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <BarChart className="text-[#012a4a] h-5 w-5" />
                    Balances
                  </h2>
                  {expandedSections.includes("balances") ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
                {expandedSections.includes("balances") && (
                  <div className="mt-4">
                    <div className="mb-4 flex flex-col sm:flex-row gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Property</label>
                        <select
                          value={filters.propertyId}
                          onChange={(e) => setFilters({ ...filters, propertyId: e.target.value })}
                          className="w-full sm:w-48 p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                        >
                          <option value="all">All Properties</option>
                          {properties.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
                        <select
                          value={filters.status}
                          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                          className="w-full sm:w-48 p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                        >
                          <option value="all">All</option>
                          <option value="overdue">Overdue</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead className="bg-gray-100">
                          <tr>
                            <th
                              className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                              onClick={() => handleSort("tenantName")}
                            >
                              Tenant Name
                            </th>
                            <th
                              className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                              onClick={() => handleSort("totalDue")}
                            >
                              Total Due
                            </th>
                            <th
                              className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                              onClick={() => handleSort("totalPaid")}
                            >
                              Total Paid
                            </th>
                            <th
                              className="py-3 px-4 text-left text-sm font-semibold cursor-pointer"
                              onClick={() => handleSort("outstandingBalance")}
                            >
                              Outstanding Balance
                            </th>
                            <th className="py-3 px-4 text-left text-sm font-semibold">Property</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balances.map((b, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="py-3 px-4 text-sm text-gray-800">{b.tenantName}</td>
                              <td className="py-3 px-4 text-sm text-gray-600">Ksh {b.totalDue.toFixed(2)}</td>
                              <td className="py-3 px-4 text-sm text-gray-600">Ksh {b.totalPaid.toFixed(2)}</td>
                              <td className="py-3 px-4 text-sm text-gray-600">
                                Ksh {b.outstandingBalance.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-600">
                                {properties.find((p) => p._id === b.propertyId)?.name || "N/A"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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