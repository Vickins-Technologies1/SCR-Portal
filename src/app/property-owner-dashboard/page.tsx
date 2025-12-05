// src/app/property-owner-dashboard/page.tsx
"use client";

import { Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MaintenanceRequests from "./components/MaintenanceRequests";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, DollarSign, AlertCircle, BarChart2, Home, MapPin, Wrench } from "lucide-react";
import Cookies from "js-cookie";
import { Line, Pie } from "react-chartjs-2";
import { motion } from "framer-motion";
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
} from "chart.js";
import { Property } from "../../types/property";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend, ArcElement);

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

  // === AUTH & CSRF ===
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    if (!uid || r !== "propertyOwner") {
      router.replace("/");
    } else {
      setUserId(uid);
      setRole(r);
    }

    const fetchCsrfToken = async () => {
      const token = Cookies.get("csrf-token");
      if (token) {
        setCsrfToken(token);
        return;
      }

      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.csrfToken) {
          Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
          setCsrfToken(data.csrfToken);
        }
      } catch (err) {
        console.error("CSRF fetch failed:", err);
      }
    };

    fetchCsrfToken();
  }, [router]);

  // === FETCH DASHBOARD DATA ===
  const fetchOwnerCharts = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsChartsLoading(true);
    try {
      const res = await fetch(`/api/ownercharts?propertyOwnerId=${userId}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) setChartData(data.chartData);
    } catch (err) {
      console.error("Chart error:", err);
    } finally {
      setIsChartsLoading(false);
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (!userId || role !== "propertyOwner" || !csrfToken) return;

    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const [propsRes, tenantsRes, paymentsRes, statsRes] = await Promise.all([
          fetch("/api/properties?userId=" + userId, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
          fetch("/api/tenants?userId=" + userId, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
          fetch("/api/tenant/payments?userId=" + userId, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
          fetch("/api/ownerstats?userId=" + userId, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
        ]);

        const [props, ten, pay, st] = await Promise.all([propsRes.json(), tenantsRes.json(), paymentsRes.json(), statsRes.json()]);

        setProperties(props.success ? props.properties || [] : []);
        setTenants(ten.success ? ten.tenants || [] : []);
        setPayments(pay.success ? pay.payments || [] : []);
        setStats(st.success ? st.stats : stats);

        await fetchOwnerCharts();
      } catch (err) {
        setError("Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [userId, role, csrfToken, fetchOwnerCharts]);

  // === CHARTS ===
  const paymentStatusData = tenants.reduce((acc, t) => {
    if (!t.leaseStartDate || !t.leaseEndDate || new Date(t.leaseEndDate) < new Date()) {
      acc.pending++;
    } else if (t.paymentStatus === "overdue") {
      acc.overdue++;
    } else {
      acc.paid++;
    }
    return acc;
  }, { paid: 0, overdue: 0, pending: 0 });

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

  if (!userId || role !== "propertyOwner") {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${inter.className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-emerald-600"></div>
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
            <BarChart2 className="h-8 w-8 text-emerald-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Property Owner Dashboard</h1>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
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
              <div key={i} className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}>
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
                <Line data={paymentChartData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Payment Status</h2>
              <div className="h-80">
                <Pie data={pieChartData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </div>
          </div>

          {/* Maintenance Requests Section */}
          <div className="mb-10">
            <MaintenanceRequests
              userId={userId}
              csrfToken={csrfToken!}
              properties={properties}
            />
          </div>

          {/* Properties Grid - Upgraded & Beautiful */}
<section className="mb-12">
  <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
    <Building2 className="w-8 h-8 text-emerald-600" />
    Your Properties
  </h2>

  {properties.length === 0 ? (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl border-2 border-dashed border-gray-300 p-16 text-center">
      <div className="mx-auto w-24 h-24 bg-gray-200 border-2 border-dashed rounded-full mb-6" />
      <p className="text-xl font-semibold text-gray-700">No properties listed yet</p>
      <p className="text-gray-500 mt-2">Click "List Property" to add your first one!</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
      {properties.map((property) => {
        const occupied = stats.occupiedUnits;
        const total = stats.totalUnits;
        const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

        return (
          <motion.div
            key={property._id.toString()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -8, scale: 1.02 }}
            transition={{ duration: 0.3 }}
            onClick={() => router.push(`/properties/${property._id.toString()}`)}
            className="group relative bg-white rounded-3xl shadow-lg hover:shadow-2xl border border-gray-200 overflow-hidden cursor-pointer transition-all duration-500"
          >
            {/* Premium Gradient Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-600" />

            {/* Property Image Placeholder */}
            <div className="relative h-48 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 backdrop-blur-sm overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                  {property.name}
                </h3>
                <p className="text-white/90 text-sm flex items-center gap-2 mt-1 drop-shadow">
                  <MapPin size={16} />
                  {property.address}
                </p>
              </div>

              {/* Occupancy Badge */}
              <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <div className="relative w-10 h-10">
                    <svg className="w-10 h-10 transform -rotate-90">
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="#e5e7eb"
                        strokeWidth="3"
                        fill="none"
                      />
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="#10b981"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${occupancyRate * 1.005} 100`}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-600">
                      {occupancyRate}%
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Occupied</span>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-6 space-y-5">
              {/* Units Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                  <p className="text-xs text-emerald-600 font-medium">Total Units</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{total}</p>
                </div>
                <div className="bg-amber-50 rounded-2xl p-4 text-center">
                  <p className="text-xs text-amber-600 font-medium">Vacant</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{total - occupied}</p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Status</span>
                <span
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    property.status === "occupied"
                      ? "bg-emerald-100 text-emerald-800 shadow-md"
                      : property.status === "available"
                      ? "bg-blue-100 text-blue-800 shadow-md"
                      : "bg-purple-100 text-purple-800 shadow-md"
                  }`}
                >
                  {property.status === "occupied" ? "Fully Occupied" : 
                   property.status === "available" ? "Available" : 
                   "Partially Occupied"}
                </span>
              </div>

              {/* Hover Arrow */}
              <div className="flex justify-end">
                <div className="p-3 bg-emerald-600 rounded-full text-white opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                  <Home size={20} />
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  )}
</section>
        </main>
      </div>
    </div>
  );
}