// src/app/property-owner-dashboard/page.tsx
"use client";

import { Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MaintenanceRequests from "./components/MaintenanceRequests";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  DollarSign,
  AlertCircle,
  BarChart2,
  Home,
  MapPin,
} from "lucide-react";
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
import { OwnerStats } from "../../types/stats";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend, ArcElement);

interface ChartData {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // All stats come directly from backend — no client calculations
  const [stats, setStats] = useState<OwnerStats>({
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

  // AUTH & CSRF
  useEffect(() => {
    const uid = Cookies.get("userId");
    const role = Cookies.get("role");
    if (!uid || role !== "propertyOwner") {
      router.replace("/login");
      return;
    }
    setUserId(uid);

    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            token = data.csrfToken;
          }
        } catch (err) {
          console.error("CSRF fetch failed:", err);
        }
      }
      setCsrfToken(token || null);
    };
    fetchCsrf();
  }, [router]);

  // FETCH DATA
  const fetchData = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const [propsRes, statsRes, chartsRes] = await Promise.all([
        fetch(`/api/properties?userId=${userId}`, {
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch(`/api/ownerstats?userId=${userId}`, {
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        }),
        fetch(`/api/ownercharts?propertyOwnerId=${userId}`, {
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        }),
      ]);

      if (!propsRes.ok || !statsRes.ok || !chartsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const [propsData, statsData, chartsData] = await Promise.all([
        propsRes.json(),
        statsRes.json(),
        chartsRes.json(),
      ]);

      setProperties(propsData.success ? propsData.properties || [] : []);
      setStats(statsData.success ? statsData.stats : stats);
      setChartData(chartsData.success ? chartsData.chartData : null);
    } catch (err) {
      setError("Failed to load dashboard data.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && csrfToken) fetchData();
  }, [userId, csrfToken, fetchData]);

  // DERIVED VALUES — purely from server stats (no tenant list no longer needed for calculations)
  const totalVacantUnits = Math.max(0, stats.totalUnits - stats.occupiedUnits);
  const vacancyRate = stats.totalUnits > 0
    ? Math.round((totalVacantUnits / stats.totalUnits) * 100)
    : 0;

  // PIE CHART — use overduePayments & totalTenants from server
  const pieData = {
    labels: ["Current", "Overdue", "Lease Expired"],
    datasets: [{
      data: [
        Math.max(0, stats.totalTenants - stats.overduePayments),
        stats.overduePayments,
        0, // We no longer calculate expired leases client-side
      ],
      backgroundColor: ["#10b981", "#ef4444", "#6b7280"],
      borderWidth: 0,
      hoverOffset: 16,
    }],
  };

  const lineData = {
    labels: chartData?.months || ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      { label: "Rent", data: chartData?.rentPayments || [], borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.1)", fill: true, tension: 0.4 },
      { label: "Utility", data: chartData?.utilityPayments || [], borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,0.1)", fill: true, tension: 0.4 },
      { label: "Deposit", data: chartData?.depositPayments || [], borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", fill: true, tension: 0.4 },
    ],
  };

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          <div className="flex items-center gap-1 mb-8 mt-6">
            <BarChart2 className="h-8 w-8 text-emerald-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white/80 rounded-2xl h-32 shadow-lg animate-pulse">
                  <div className="p-5 space-y-4">
                    <div className="h-4 bg-gray-200 rounded-lg w-24" />
                    <div className="h-10 bg-gray-300 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* TOP STATS — 100% FROM SERVER */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-10">
                {[
                  { title: "Monthly Rent", value: `Ksh ${stats.totalMonthlyRent.toLocaleString()}`, icon: DollarSign, color: "emerald" },
                  { title: "Total Revenue", value: `Ksh ${stats.totalPayments.toLocaleString()}`, icon: DollarSign, color: "blue" },
                  { title: "Overdue Amount", value: `Ksh ${stats.totalOverdueAmount.toLocaleString()}`, icon: AlertCircle, color: "red", subtitle: `${stats.overduePayments} tenants overdue` },
                  { title: "Deposits", value: `Ksh ${stats.totalDepositPaid.toLocaleString()}`, icon: DollarSign, color: "indigo" },
                  { title: "Utilities Paid", value: `Ksh ${stats.totalUtilityPaid.toLocaleString()}`, icon: DollarSign, color: "pink" },
                  { title: "Properties", value: stats.activeProperties, icon: Building2, color: "purple" },
                  { title: "Active Tenants", value: stats.totalTenants, icon: Users, color: "green", subtitle: `${stats.occupiedUnits} units occupied` },
                  { title: "Vacant Units", value: totalVacantUnits, icon: Home, color: "orange", subtitle: `${vacancyRate}% vacancy` },
                ].map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600">{s.title}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{s.value}</p>
                        {s.subtitle && <p className="text-xs text-gray-500 mt-1">{s.subtitle}</p>}
                      </div>
                      <div className={`p-3 rounded-xl bg-${s.color}-100`}>
                        <s.icon className={`h-6 w-6 text-${s.color}-600`} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* CHARTS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Payment Trends</h2>
                  <div className="h-80"><Line data={lineData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
                </div>
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Tenant Payment Status</h2>
                  <div className="h-80"><Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
                </div>
              </div>

              <MaintenanceRequests userId={userId!} csrfToken={csrfToken!} properties={properties} />

              {/* PROPERTIES GRID — Still shows per-property details using only property.unitTypes */}
              <section className="mt-12">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <Building2 className="h-9 w-9 text-emerald-600" />
                  Your Properties
                </h2>

                {properties.length === 0 ? (
                  <div className="text-center py-32 bg-white/70 backdrop-blur-sm rounded-3xl shadow-inner border border-white/20">
                    <div className="w-32 h-32 mx-auto bg-gray-200 border-2 border-dashed rounded-xl mb-8" />
                    <p className="text-2xl font-semibold text-gray-700">No properties yet</p>
                    <p className="text-gray-500 mt-3 text-lg">Add your first property to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-7">
                    {properties.map((property) => {
                      const propertyIdStr = property._id.toString();

                      // Only calculate total units from unitTypes (no tenant data used)
                      const totalUnits =
                        property.unitTypes?.reduce((sum, ut) => sum + (ut.quantity || 0), 0) || 0;

                      // For display only — use global stats for accuracy, but show per-property unit count
                      const occupancyRate = stats.totalUnits > 0
                        ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
                        : 0;

                      const vacantUnits = Math.max(0, totalUnits - (stats.occupiedUnits * totalUnits / stats.totalUnits || 0));

                      return (
                        <motion.div
                          key={propertyIdStr}
                          initial={{ opacity: 0, y: 30 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          whileHover={{ y: -10, scale: 1.03 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="group relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer transition-all border border-gray-100"
                        >
                          <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600" />

                          <div className="p-6 pb-4">
                            <h3 className="text-lg font-bold text-gray-900 line-clamp-1">
                              {property.name}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1.5 flex items-center gap-1.5">
                              <MapPin className="w-4 h-4 text-emerald-600" />
                              <span className="truncate">{property.address || "No address"}</span>
                            </p>
                          </div>

                          <div className="absolute top-4 right-4 bg-white rounded-full shadow-2xl p-3 border border-gray-100">
                            <div className="relative w-14 h-14">
                              <svg className="w-full h-full -rotate-90">
                                <circle cx="50%" cy="50%" r="38%" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                                <circle
                                  cx="50%"
                                  cy="50%"
                                  r="38%"
                                  stroke="#10b981"
                                  strokeWidth="9"
                                  fill="none"
                                  strokeDasharray={`${(occupancyRate / 100) * 119.38} 119.38`}
                                  className="transition-all duration-1000 ease-out"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-emerald-700">{occupancyRate}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="px-6 pb-6 pt-2">
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl py-3.5 border border-emerald-200">
                                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total</p>
                                <p className="text-2xl font-bold text-emerald-900 mt-1">{totalUnits}</p>
                              </div>
                              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl py-3.5 border border-amber-200">
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Vacant</p>
                                <p className="text-2xl font-bold text-amber-900 mt-1">
                                  {Math.round(vacantUnits) || 0}
                                </p>
                              </div>
                              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl py-3.5 border border-blue-200">
                                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Occupied</p>
                                <p className="text-2xl font-bold text-blue-900 mt-1">
                                  {totalUnits - Math.round(vacantUnits || 0)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-5 text-center">
                              <span
                                className={`inline-block px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition-all ${
                                  stats.occupiedUnits === stats.totalUnits && stats.totalUnits > 0
                                    ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300"
                                    : stats.occupiedUnits === 0
                                    ? "bg-gray-100 text-gray-700 ring-2 ring-gray-300"
                                    : "bg-purple-100 text-purple-800 ring-2 ring-purple-300"
                                }`}
                              >
                                {stats.occupiedUnits === stats.totalUnits && stats.totalUnits > 0
                                  ? "Fully Occupied"
                                  : stats.occupiedUnits === 0
                                  ? "Completely Vacant"
                                  : "Partially Occupied"}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}