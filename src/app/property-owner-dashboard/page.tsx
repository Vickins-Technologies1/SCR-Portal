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
import { Property } from "../../types/property";

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
  paymentStatus?: "up-to-date" | "overdue" | "pending";
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

  // === All useEffect and data fetching logic remains 100% unchanged ===
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
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
    } catch (err) {
      console.error("Chart data fetch error:", err);
      setError(`Failed to load chart data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsChartsLoading(false);
    }
  }, [userId, csrfToken]);

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

  // Pie & Line Chart Data (unchanged logic)
  const paymentStatusData = tenants.reduce(
    (acc, tenant) => {
      if (!tenant.leaseStartDate || !tenant.leaseEndDate) {
        acc.pending += 1;
        return acc;
      }

      const leaseStart = new Date(tenant.leaseStartDate);
      const leaseEnd = new Date(tenant.leaseEndDate);
      const today = new Date();

      if (
        isNaN(leaseStart.getTime()) ||
        isNaN(leaseEnd.getTime()) ||
        leaseStart > today ||
        leaseEnd < today
      ) {
        acc.pending += 1;
        return acc;
      }

      const status = tenant.paymentStatus;
      if (status === "overdue") {
        acc.overdue += 1;
      } else if (status === "up-to-date") {
        acc.paid += 1;
      } else {
        acc.pending += 1;
      }

      return acc;
    },
    { paid: 0, overdue: 0, pending: 0 } as Record<string, number>
  );

  const pieChartData = {
    labels: ["Up to Date", "Overdue", "Pending"],
    datasets: [{
      data: [paymentStatusData.paid, paymentStatusData.overdue, paymentStatusData.pending],
      backgroundColor: ["#10b981", "#ef4444", "#f59e0b"],
      borderWidth: 3,
      borderColor: "#fff",
      hoverOffset: 8,
    }],
  };

  const paymentChartData = {
    labels: chartData?.months || ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    datasets: [
      { label: "Rent", data: chartData?.rentPayments || [0,0,0,0,0,0], borderColor: "#2563eb", backgroundColor: "rgba(37, 99, 235, 0.1)", fill: true, tension: 0.4 },
      { label: "Utility", data: chartData?.utilityPayments || [0,0,0,0,0,0], borderColor: "#ec4899", backgroundColor: "rgba(236, 72, 153, 0.1)", fill: true, tension: 0.4 },
      { label: "Deposit", data: chartData?.depositPayments || [0,0,0,0,0,0], borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true, tension: 0.4 },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { padding: 20, font: { size: 13 } } },
      tooltip: { padding: 12, titleFont: { size: 14 }, bodyFont: { size: 13 } },
    },
  };

  if (!userId || role !== "propertyOwner") {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${inter.className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-[#013a63]"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <Navbar />
      <Sidebar />

      <div className="md:ml-64 pt-16 pb-8 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8 mt-6">
            <BarChart2 className="h-8 w-8 text-[#013a63]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Property Owner Dashboard</h1>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
          {(isLoading || isChartsLoading) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-700 px-5 py-4 rounded-xl flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#013a63]"></div>
              <span className="font-medium">Loading your dashboard...</span>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-10">
            {[
              { title: "Monthly Rent", value: `Ksh ${stats.totalMonthlyRent.toLocaleString()}`, icon: DollarSign, color: "emerald" },
              { title: "Total Revenue", value: `Ksh ${stats.totalPayments.toLocaleString()}`, icon: DollarSign, color: "blue" },
              { title: "Overdue", value: `Ksh ${stats.totalOverdueAmount.toLocaleString()}`, icon: AlertCircle, color: "red" },
              { title: "Deposits Paid", value: `Ksh ${stats.totalDepositPaid.toLocaleString()}`, icon: DollarSign, color: "indigo" },
              { title: "Utilities Paid", value: `Ksh ${stats.totalUtilityPaid.toLocaleString()}`, icon: DollarSign, color: "pink" },
              { title: "Properties", value: stats.activeProperties, icon: Building2, color: "purple" },
              { title: "Tenants", value: stats.totalTenants, icon: Users, color: "green" },
              { title: "Vacant Units", value: stats.totalUnits - stats.occupiedUnits, icon: Home, color: "orange" },
            ].map((stat, i) => (
              <div
                key={i}
                className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {typeof stat.value === "number" && !stat.title.includes("Ksh") ? stat.value : stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl bg-${stat.color}-100`}>
                    <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Payment Trends (6 Months)</h2>
              <div className="h-80">
                <Line data={paymentChartData} options={chartOptions} />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Tenant Payment Status</h2>
              <div className="h-80">
                <Pie data={pieChartData} options={chartOptions} />
              </div>
            </div>
          </div>

          {/* Properties */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-800 mb-5">Your Properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-500">
                No properties added yet. Click "List Property" to get started.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {properties.map((property) => (
                  <div
                    key={property._id.toString()}
                    onClick={() => router.push(`/properties/${property._id.toString()}`)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-xl hover:border-gray-300 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="h-32 bg-gradient-to-br from-blue-500 to-indigo-600 group-hover:from-indigo-600 group-hover:to-purple-600 transition-colors"></div>
                    <div className="p-5">
                      <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                        <Home className="h-5 w-5 text-indigo-600" />
                        {property.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {property.address}
                      </p>
                      <div className="mt-4 flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-500">Vacant Units</span>
                        <span className="font-bold text-indigo-600">{stats.totalUnits - stats.occupiedUnits}</span>
                      </div>
                      <div className="mt-3">
                        <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                          property.status === "occupied"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {property.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>


        </main>
      </div>
    </div>
  );
}