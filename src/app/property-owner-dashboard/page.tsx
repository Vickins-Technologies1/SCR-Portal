"use client";

import { Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MaintenanceRequests from "./components/MaintenanceRequests";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, DollarSign, AlertCircle, BarChart2, Home, MapPin, Hash } from "lucide-react";
import Cookies from "js-cookie";
import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  TooltipItem,
} from "chart.js";
import { Property } from "../../types/property"; // Import Property from src/types/property.ts

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend, ArcElement, BarElement);

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  price: number;
  leaseStartDate: string;
  leaseEndDate: string;
  walletBalance?: number;
}

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  type?: "Rent" | "Utility" | "Deposit";
  phoneNumber?: string;
  reference?: string;
  tenantName: string;
}

interface Stats {
  activeProperties: number;
  totalTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  totalMonthlyRent: number;
  overduePayments: number;
  totalPayments: number;
  totalOverdueAmount: number;
  totalDepositPaid: number;
  totalUtilityPaid: number;
}

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
  maintenanceRequests: number[];
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChartsLoading, setIsChartsLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    activeProperties: 0,
    totalTenants: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    totalMonthlyRent: 0,
    overduePayments: 0,
    totalPayments: 0,
    totalOverdueAmount: 0,
    totalDepositPaid: 0,
    totalUtilityPaid: 0,
  });
  const [chartData, setChartData] = useState<ChartData | null>(null);

  // Load cookies and fetch CSRF token
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    console.log("Dashboard - Cookies - userId:", uid, "role:", r);
    if (!uid || r !== "propertyOwner") {
      router.replace("/");
    } else {
      setUserId(uid);
      setRole(r);
    }

    const fetchCsrfToken = async (retries = 3): Promise<string | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "include",
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`CSRF token fetch failed: ${res.status} ${res.statusText} - ${text.slice(0, 50)}`);
          }
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            console.log("CSRF token fetched:", data.csrfToken);
            return data.csrfToken;
          } else {
            throw new Error("No CSRF token in response");
          }
        } catch (err) {
          console.error(`CSRF token fetch attempt ${i + 1} failed:`, err);
          if (i === retries - 1) {
            setError(`Failed to fetch CSRF token: ${err instanceof Error ? err.message : String(err)}`);
            return null;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return null;
    };

    const token = Cookies.get("csrf-token");
    if (!token) {
      fetchCsrfToken().then((newToken) => setCsrfToken(newToken));
    } else {
      setCsrfToken(token);
    }
  }, [router]);

  // Fetch owner charts data
  const fetchOwnerCharts = useCallback(async () => {
    if (!userId || !csrfToken) return;

    setIsChartsLoading(true);
    setError(null);

    try {
      const fetchUrl = `/api/ownercharts?tenantId=null&propertyOwnerId=${encodeURIComponent(userId)}`;
      const res = await fetch(fetchUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fetch failed for /api/ownercharts: ${res.status} ${res.statusText} - ${text.slice(0, 50)}`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to fetch chart data");

      setChartData(data.chartData);
      console.log("Chart data fetched:", data.chartData);
    } catch (err) {
      console.error("Chart data fetch error:", err);
      setError(`Failed to load chart data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsChartsLoading(false);
    }
  }, [userId, csrfToken]);

  // Fetch dashboard data
  useEffect(() => {
    if (!userId || role !== "propertyOwner" || !csrfToken) return;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError(null);

      async function fetchAllData<T>(url: string): Promise<T[]> {
        let allData: T[] = [];
        let page = 1;
        const limit = 100;
        while (true) {
          const fetchUrl = `${url}?userId=${encodeURIComponent(userId as string)}&page=${page}&limit=${limit}`;
          try {
            const res = await fetch(fetchUrl, {
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrfToken as string,
              },
              credentials: "include",
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Fetch failed for ${url} (page ${page}): ${res.status} ${res.statusText} - ${text.slice(0, 50)}`);
            }
            const data = await res.json();
            if (!data.success) throw new Error(data.message || `Failed to fetch data from ${url}`);
            allData = [...allData, ...(data.tenants || data.payments || data.properties || [])];
            if (!data.total || allData.length >= data.total) break;
            page++;
          } catch (err) {
            console.error(`Error fetching ${url} (page ${page}):`, err);
            throw err;
          }
        }
        console.log(`Fetched ${allData.length} items from ${url}`);
        return allData;
      }

      async function fetchStats(retries = 3): Promise<Stats> {
        const url = `/api/ownerstats?userId=${encodeURIComponent(userId as string)}`;
        for (let i = 0; i < retries; i++) {
          try {
            const res = await fetch(url, {
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrfToken as string,
              },
              credentials: "include",
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText} - ${text.slice(0, 50)}`);
            }
            const data = await res.json();
            if (!data.success) throw new Error(data.message || "Failed to fetch stats");
            console.log("Stats fetched:", data.stats);
            return data.stats;
          } catch (err) {
            console.error(`Stats fetch attempt ${i + 1} failed:`, err);
            if (i === retries - 1) throw err;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        throw new Error("Failed to fetch stats after retries");
      }

      try {
        const [propertiesList, tenantsList, paymentsList, statsData] = await Promise.all([
          fetchAllData<Property>("/api/properties"),
          fetchAllData<Tenant>("/api/tenants"),
          fetchAllData<Payment>("/api/tenant/payments"),
          fetchStats(),
        ]);

        setProperties(propertiesList);
        setTenants(tenantsList);
        setPayments(paymentsList);
        setStats(statsData);

        await fetchOwnerCharts();
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("Failed to load dashboard data: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, role, csrfToken, fetchOwnerCharts]);

  // Payment status pie chart
  const paymentStatusData = tenants.reduce(
    (acc, tenant) => {
      if (!tenant.leaseStartDate || !tenant.leaseEndDate || !tenant.price) {
        acc.pending = (acc.pending || 0) + 1;
        return acc;
      }
      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      const today = new Date();
      if (isNaN(leaseStart.getTime()) || isNaN(leaseEnd.getTime()) || leaseStart > today || leaseEnd < today) {
        acc.pending = (acc.pending || 0) + 1;
        return acc;
      }
      const monthsSinceLease = Math.max(
        0,
        Math.floor((today.getTime() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30))
      );
      const expectedRent = monthsSinceLease * tenant.price;
      const totalPaid = payments
        .filter((p) => p.tenantId === tenant._id && p.status === "completed" && p.type === "Rent")
        .reduce((sum, p) => sum + p.amount, 0);
      const overdueAmount = Math.max(0, expectedRent - totalPaid - (tenant.walletBalance || 0));
      acc[overdueAmount > 0 ? "overdue" : "paid"] = (acc[overdueAmount > 0 ? "overdue" : "paid"] || 0) + 1;
      return acc;
    },
    { paid: 0, overdue: 0, pending: 0 } as Record<string, number>
  );

  const pieChartData = {
    labels: ["Paid", "Overdue", "Pending"],
    datasets: [
      {
        data: [paymentStatusData.paid, paymentStatusData.overdue, paymentStatusData.pending],
        backgroundColor: ["#10b981", "#ef4444", "#f59e0b"],
        borderColor: ["#fff", "#fff", "#fff"],
        borderWidth: 2,
      },
    ],
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { color: "#012a4a", font: { size: 14 } } },
      tooltip: { enabled: true },
    },
  };

  // Payment trends line chart
  const paymentChartData = {
    labels: chartData?.months || ["Apr-25", "May-25", "Jun-25", "Jul-25", "Aug-25", "Sep-25"],
    datasets: [
      {
        label: "Rent Payments (Ksh)",
        data: chartData?.rentPayments || [0, 0, 0, 0, 0, 0],
        borderColor: "#36A2EB",
        backgroundColor: "rgba(54, 162, 235, 0.2)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Utility Payments (Ksh)",
        data: chartData?.utilityPayments || [0, 0, 0, 0, 0, 0],
        borderColor: "#FF6384",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Deposit Payments (Ksh)",
        data: chartData?.depositPayments || [0, 0, 0, 0, 0, 0],
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.2)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const paymentChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: "Month", color: "#012a4a", font: { size: 14 } } },
      y: { title: { display: true, text: "Amount (Ksh)", color: "#012a4a", font: { size: 14 } }, beginAtZero: true },
    },
    plugins: {
      legend: { display: true, labels: { color: "#012a4a", font: { size: 14 } } },
      title: { display: true, text: "Payment Trends", color: "#012a4a", font: { size: 16 } },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<"line">) => {
            const value = context.raw as number;
            return `${context.dataset.label}: Ksh ${value.toFixed(2)}`;
          },
        },
      },
    },
  };

  if (!userId || role !== "propertyOwner") {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white ${inter.className}`}>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#012a4a]"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-50 to-white ${inter.className}`}>
      <Navbar />
      <Sidebar />
      <div className="md:ml-64 mt-16">
        <main className="px-4 sm:px-6 md:px-8 py-6 min-h-screen transition-all duration-300">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 flex items-center gap-2">
            <BarChart2 className="text-[#012a4a] h-6 w-6 sm:h-8 sm:w-8" />
            Property Owner Dashboard
          </h1>

          {error && (
            <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}
          {isLoading && (
            <div className="mb-4 sm:mb-6 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#012a4a]"></div>
              Loading dashboard...
            </div>
          )}
          {isChartsLoading && (
            <div className="mb-4 sm:mb-6 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl p-4 flex items-center gap-2 text-sm sm:text-base">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#012a4a]"></div>
              Loading chart data...
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {[
              {
                title: "Monthly Rent",
                value: `Ksh ${stats.totalMonthlyRent.toFixed(2)}`,
                icon: <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "teal",
              },
              {
                title: "Total Payments",
                value: `Ksh ${stats.totalPayments.toFixed(2)}`,
                icon: <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "cyan",
              },
              {
                title: "Total Overdue",
                value: `Ksh ${stats.totalOverdueAmount.toFixed(2)}`,
                icon: <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "red",
              },
              {
                title: "Total Deposit Paid",
                value: `Ksh ${stats.totalDepositPaid.toFixed(2)}`,
                icon: <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "indigo",
              },
              {
                title: "Total Utility Paid",
                value: `Ksh ${stats.totalUtilityPaid.toFixed(2)}`,
                icon: <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "pink",
              },
              {
                title: "Active Properties",
                value: stats.activeProperties,
                icon: <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "blue",
              },
              {
                title: "Total Tenants",
                value: stats.totalTenants,
                icon: <Users className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "green",
              },
              {
                title: "Vacant Units",
                value: stats.totalUnits - stats.occupiedUnits,
                icon: <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />,
                color: "purple",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className={`bg-white border-l-4 border-${stat.color}-500 p-4 sm:p-5 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1`}
              >
                <h3 className={`text-sm sm:text-base md:text-lg font-semibold text-${stat.color}-800 flex items-center gap-2`}>
                  {stat.icon} {stat.title}
                </h3>
                <p className={`text-lg sm:text-xl md:text-2xl font-bold text-${stat.color}-900 mt-2`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <section>
              <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Payment Trends</h2>
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-lg transition-all duration-200 h-80 sm:h-96">
                <Line data={paymentChartData} options={paymentChartOptions} />
              </div>
            </section>
            <section>
              <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Tenant Payment Status</h2>
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-lg transition-all duration-200 h-80 sm:h-96">
                <Pie data={pieChartData} options={pieChartOptions} />
              </div>
            </section>
          </div>

          {/* Properties Section */}
          <section className="mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Your Properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm text-gray-600 text-sm sm:text-base">
                You currently have no active properties. Add properties to see them here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                {properties.map((property: Property) => (
                  <div
                    key={property._id.toString()} // Convert _id to string
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 cursor-pointer bg-gradient-to-br from-white to-gray-50"
                    onClick={() => router.push(`/properties/${property._id.toString()}`)} // Convert _id to string
                  >
                    <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
                      <Home className="h-5 w-5 text-blue-600" /> {property.name}
                    </h3>
                    <p className="text-sm sm:text-base text-gray-500 mt-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" /> {property.address}
                    </p>
                    <p className="text-sm sm:text-base text-gray-500 mt-2 flex items-center gap-2">
                      <Hash className="h-4 w-4 text-gray-400" /> Vacant Units: {stats.totalUnits - stats.occupiedUnits}
                    </p>
                    <p className="text-sm sm:text-base text-gray-500 mt-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" /> Status:{" "}
                      <span
                        className={`inline-block px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full ${
                          property.status === "occupied" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {property.status}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Maintenance Requests Section */}
          {userId && csrfToken && (
            <MaintenanceRequests userId={userId} csrfToken={csrfToken} properties={properties} />
          )}
        </main>
      </div>
    </div>
  );
}