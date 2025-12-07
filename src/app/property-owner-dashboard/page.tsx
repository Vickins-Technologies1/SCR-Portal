// src/app/property-owner-dashboard/page.tsx
"use client";

import { Inter } from "next/font/google";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MaintenanceRequests from "./components/MaintenanceRequests";
import { useState, useEffect, useCallback, useMemo } from "react";
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

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend, ArcElement);

interface Tenant {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  propertyId: string;
  price: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus?: "up-to-date" | "overdue" | "pending";
  status?: "active" | "inactive";
}

interface Stats {
  activeProperties: number;
  totalTenants: number;
  totalUnits: number;
  occupiedUnits: number;
  totalMonthlyRent: number;
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
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    activeProperties: 0,
    totalTenants: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    totalMonthlyRent: 0,
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
      const [propsRes, tenantsRes, statsRes, chartsRes] = await Promise.all([
        fetch(`/api/properties?userId=${userId}`, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
        fetch(`/api/tenants?userId=${userId}`, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
        fetch(`/api/ownerstats?userId=${userId}`, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
        fetch(`/api/ownercharts?propertyOwnerId=${userId}`, { headers: { "x-csrf-token": csrfToken }, credentials: "include" }),
      ]);

      if (!propsRes.ok || !tenantsRes.ok || !statsRes.ok || !chartsRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const [propsData, tenantsData, statsData, chartsData] = await Promise.all([
        propsRes.json(),
        tenantsRes.json(),
        statsRes.json(),
        chartsRes.json(),
      ]);

      setProperties(propsData.success ? propsData.properties || [] : []);
      setTenants(tenantsData.success ? tenantsData.tenants || [] : []);
      setStats(statsData.success ? statsData.stats || stats : stats);
      setChartData(chartsData.success ? chartsData.chartData : null);
    } catch (err) {
      setError("Failed to load dashboard data. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && csrfToken) fetchData();
  }, [userId, csrfToken, fetchData]);

  // ACCURATE PROPERTY STATS (per property)
const getPropertyStats = useCallback((property: Property) => {
  const propertyIdStr = property._id.toString();

  const totalUnits = Array.isArray(property.unitTypes)
    ? property.unitTypes.reduce((acc, ut) => acc + (Number(ut.quantity) || 0), 0)
    : 0;

  const tenantsInThisProperty = tenants.filter(t => t.propertyId === propertyIdStr);
  const occupiedUnits = tenantsInThisProperty.length;
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  return {
    totalUnits,
    occupiedUnits,
    vacantUnits,
    occupancyRate,
    isFullyOccupied: occupiedUnits >= totalUnits && totalUnits > 0,
    isVacant: occupiedUnits === 0 && totalUnits > 0,
    hasNoUnits: totalUnits === 0,
  };
}, [tenants]);

  // GLOBAL VACANT UNITS — 100% ACCURATE
  const totalVacantUnits = useMemo(() => {
    return properties.reduce((sum, prop) => {
      return sum + getPropertyStats(prop).vacantUnits;
    }, 0);
  }, [properties, getPropertyStats]);

  // GLOBAL ACTIVE TENANTS
  const totalActiveTenants = useMemo(() => {
    return tenants.filter(t => {
      const leaseActive = !t.leaseEndDate || new Date(t.leaseEndDate) >= new Date();
      return t.status !== "inactive" && leaseActive;
    }).length;
  }, [tenants]);

  // PAYMENT STATUS
  const getTenantPaymentStatus = (tenant: Tenant): "paid" | "overdue" | "expired" => {
    if (tenant.leaseEndDate && new Date(tenant.leaseEndDate) < new Date()) return "expired";
    if (tenant.paymentStatus === "overdue") return "overdue";
    return "paid";
  };

  const paymentSummary = useMemo(() => {
    return tenants.reduce(
      (acc, t) => {
        const status = getTenantPaymentStatus(t);
        if (status === "paid") acc.paid++;
        else if (status === "overdue") acc.overdue++;
        else acc.expired++;
        return acc;
      },
      { paid: 0, overdue: 0, expired: 0 }
    );
  }, [tenants]);

  const pieData = {
    labels: ["Paid", "Overdue", "Lease Expired"],
    datasets: [{
      data: [paymentSummary.paid, paymentSummary.overdue, paymentSummary.expired],
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

      <div className="md:ml-64 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8 mt-6">
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
            <div className="space-y-8">
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
            </div>
          ) : (
            <>
              {/* STATS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-10">
                {[
                  { title: "Monthly Rent", value: `Ksh ${stats.totalMonthlyRent.toLocaleString()}`, icon: DollarSign, color: "emerald" },
                  { title: "Revenue", value: `Ksh ${stats.totalPayments.toLocaleString()}`, icon: DollarSign, color: "blue" },
                  { title: "Overdue", value: `Ksh ${stats.totalOverdueAmount.toLocaleString()}`, icon: AlertCircle, color: "red" },
                  { title: "Deposits", value: `Ksh ${stats.totalDepositPaid.toLocaleString()}`, icon: DollarSign, color: "indigo" },
                  { title: "Utilities", value: `Ksh ${stats.totalUtilityPaid.toLocaleString()}`, icon: DollarSign, color: "pink" },
                  { title: "Properties", value: stats.activeProperties, icon: Building2, color: "purple" },
                  { title: "Active Tenants", value: totalActiveTenants, icon: Users, color: "green" },
                  { title: "Vacant Units", value: totalVacantUnits, icon: Home, color: "orange" },
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
                        <p className="text-xl font-bold text-gray-900 mt-2">
                          {typeof s.value === "number" && !isNaN(s.value) ? s.value : s.value}
                        </p>
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

              {/* PROPERTIES GRID — NOW 100% ACCURATE */}
              <section className="mt-12">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <Building2 className="h-9 w-9 text-emerald-600" />
                  Your Properties
                </h2>

                {properties.length === 0 ? (
                  <div className="text-center py-24 bg-white/70 backdrop-blur-sm rounded-3xl shadow-inner border border-white/20">
                    <div className="w-32 h-32 mx-auto bg-gray-200 rounded-full mb-8" />
                    <p className="text-2xl font-semibold text-gray-700">No properties yet</p>
                    <p className="text-gray-500 mt-3 text-lg">Add your first property to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 lg:gap-8">
                    {properties.map((property) => {
                      const stats = getPropertyStats(property);
                      const { totalUnits, occupiedUnits, vacantUnits, occupancyRate, isFullyOccupied, isVacant } = stats;

                      return (
                        <motion.div
                          key={property._id.toString()}
                          initial={{ opacity: 0, y: 30 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          whileHover={{ y: -12, scale: 1.04 }}
                          transition={{ duration: 0.4 }}
                          className="group relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer transition-all border border-white/30"
                        >
                          <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600" />

                          <div className="p-6 lg:p-8">
                            <h3 className="text-lg lg:text-xl font-bold text-gray-900 line-clamp-1">{property.name}</h3>
                            <p className="text-sm lg:text-base text-gray-600 mt-2 flex items-center gap-2">
                              <MapPin className="w-5 h-5 text-emerald-600" />
                              <span className="truncate">{property.address || "No address"}</span>
                            </p>
                          </div>

                          {/* Occupancy Ring */}
                          <div className="absolute top-5 right-5 bg-white/95 backdrop-blur-sm rounded-full shadow-2xl p-3 lg:p-4 border border-gray-100">
                            <div className="relative w-16 h-16 lg:w-18 lg:h-18">
                              <svg className="w-full h-full -rotate-90">
                                <circle cx="50%" cy="50%" r="42%" stroke="#e5e7eb" strokeWidth="9" fill="none" />
                                <circle
                                  cx="50%" cy="50%" r="42%"
                                  stroke="#10b981"
                                  strokeWidth="10"
                                  fill="none"
                                  strokeDasharray={`${(occupancyRate / 100) * 132} 132`}
                                  className="transition-all duration-1000"
                                />
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-emerald-700">
                                {occupancyRate}%
                              </span>
                            </div>
                          </div>

                          {/* Stats Boxes */}
                          <div className="px-6 lg:px-8 pb-8 pt-4">
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div className="bg-emerald-50/80 rounded-2xl py-4 border border-emerald-100">
                                <p className="text-xs font-medium text-emerald-700">Total</p>
                                <p className="text-3xl font-bold text-emerald-800 mt-1">{totalUnits}</p>
                              </div>
                              <div className="bg-amber-50/80 rounded-2xl py-4 border border-amber-100">
                                <p className="text-xs font-medium text-amber-700">Vacant</p>
                                <p className="text-3xl font-bold text-amber-800 mt-1">{vacantUnits}</p>
                              </div>
                              <div className="bg-blue-50/80 rounded-2xl py-4 border border-blue-100">
                                <p className="text-xs font-medium text-blue-700">Occupied</p>
                                <p className="text-3xl font-bold text-blue-800 mt-1">{occupiedUnits}</p>
                              </div>
                            </div>

                            <div className="mt-6 text-center">
                              <span className={`inline-block px-6 py-2.5 rounded-full text-base font-bold shadow-lg ${
                                isFullyOccupied
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isVacant
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-purple-100 text-purple-800"
                              }`}>
                                {isFullyOccupied ? "Fully Occupied" : isVacant ? "Vacant" : "Partially Occupied"}
                              </span>
                            </div>
                          </div>

                          <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                            <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl">
                              <Home className="w-7 h-7" />
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