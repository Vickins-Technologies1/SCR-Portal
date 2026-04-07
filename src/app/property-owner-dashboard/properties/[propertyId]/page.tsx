"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { motion } from "framer-motion";
import {
  Building2,
  MapPin,
  Calendar,
  Users,
  Home,
  AlertCircle,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type PropertyUnit = {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  managementType?: "RentCollection" | "FullManagement";
};

type Property = {
  _id: string;
  name: string;
  address: string;
  status: "Active" | "Inactive";
  billingType?: "RentCollection" | "FullManagement";
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
  unitTypes: PropertyUnit[];
  createdAt?: string;
};

type Tenant = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  unitType?: string;
  unitIdentifier?: string;
  houseNumber?: string;
  price?: number;
  leasedUnits?: Array<{
    unitIdentifier?: string;
    unitType?: string;
    houseNumber?: string;
    price?: number;
  }>;
  status?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
};

type ChartData = {
  months: string[];
  rentPayments: number[];
  utilityPayments: number[];
  depositPayments: number[];
};

const formatCurrency = (value: number) =>
  `Ksh ${Math.max(0, value).toLocaleString("en-US")}`;

export default function PropertyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params?.propertyId as string | undefined;

  const [property, setProperty] = useState<Property | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalUnits = useMemo(() => {
    if (!property?.unitTypes?.length) return 0;
    return property.unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  }, [property]);

  const activeTenants = useMemo(() => {
    return tenants.filter((tenant) => (tenant.status || "").toLowerCase() === "active");
  }, [tenants]);

  const occupiedUnits = useMemo(() => {
    return activeTenants.reduce((sum, tenant) => {
      if (tenant.leasedUnits && tenant.leasedUnits.length > 0) {
        return sum + tenant.leasedUnits.length;
      }
      return sum + 1;
    }, 0);
  }, [activeTenants]);

  const vacancyCount = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const vacancyRate = totalUnits > 0 ? Math.round((vacancyCount / totalUnits) * 100) : 0;

  const expectedMonthlyRent = useMemo(() => {
    if (!property) return 0;

    const priceByUnit = new Map<string, number>();
    property.unitTypes?.forEach((unit: any) => {
      if (unit.uniqueType) {
        priceByUnit.set(unit.uniqueType, Number(unit.price) || 0);
      }
      if (unit.type) {
        priceByUnit.set(unit.type, Number(unit.price) || 0);
      }
    });

    const tenantTotals = activeTenants.map((tenant) => {
      if (tenant.leasedUnits && tenant.leasedUnits.length > 0) {
        const sumUnits = tenant.leasedUnits.reduce((sum, unit) => {
          if (unit.price) return sum + Number(unit.price);
          const key = unit.unitIdentifier || unit.unitType || "";
          if (key && priceByUnit.has(key)) {
            return sum + (priceByUnit.get(key) || 0);
          }
          return sum;
        }, 0);
        if (sumUnits > 0) return sumUnits;
      }

      if (tenant.price) return Number(tenant.price);
      if (tenant.unitType && priceByUnit.has(tenant.unitType)) {
        return priceByUnit.get(tenant.unitType) || 0;
      }
      return 0;
    });

    return tenantTotals.reduce((sum, value) => sum + value, 0);
  }, [property, activeTenants]);

  const fetchCsrfToken = useCallback(async () => {
    const tokenFromCookie = Cookies.get("csrf-token");
    if (tokenFromCookie) {
      return tokenFromCookie;
    }

    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data?.csrfToken) {
        return data.csrfToken as string;
      }
    } catch {
      // ignore
    }

    return null;
  }, []);

  const fetchPropertyDetails = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    setError(null);

    try {
      const token = await fetchCsrfToken();
      const headers = token ? { "x-csrf-token": token } : undefined;

      const [propertyRes, chartRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/property-charts?propertyId=${propertyId}`, {
          headers,
          credentials: "include",
        }),
      ]);

      const propertyData = await propertyRes.json();
      if (!propertyRes.ok || !propertyData.success) {
        throw new Error(propertyData.message || "Failed to load property");
      }

      const chartsData = await chartRes.json();

      setProperty(propertyData.property);
      setTenants(propertyData.tenants || []);
      setChartData(chartsData.success ? chartsData.chartData : null);
    } catch (err: any) {
      setError(err.message || "Failed to load property details.");
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, fetchCsrfToken]);

  useEffect(() => {
    if (!propertyId) return;
    fetchPropertyDetails();
  }, [propertyId, fetchPropertyDetails]);

  const barData = useMemo(() => {
    const months = chartData?.months?.length ? chartData.months : ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return {
      labels: months,
      datasets: [
        {
          label: "Rent",
          data: chartData?.rentPayments || [],
          backgroundColor: "rgba(66,199,117,0.65)",
          borderRadius: 10,
        },
        {
          label: "Utility",
          data: chartData?.utilityPayments || [],
          backgroundColor: "rgba(30,58,138,0.6)",
          borderRadius: 10,
        },
        {
          label: "Deposit",
          data: chartData?.depositPayments || [],
          backgroundColor: "rgba(245,158,11,0.65)",
          borderRadius: 10,
        },
      ],
    };
  }, [chartData]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" as const },
      },
      scales: {
        x: {
          grid: { display: false },
        },
        y: {
          grid: { color: "rgba(148,163,184,0.2)" },
          ticks: {
            callback: (value: number | string) => `Ksh ${value}`,
          },
        },
      },
    }),
    []
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/property-owner-dashboard/properties"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-primary hover:text-primary-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Properties
            </Link>
            <button
              onClick={() => router.refresh()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs sm:text-sm font-semibold hover:bg-primary-hover transition"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="surface-card rounded-3xl p-6 sm:p-8 text-center text-muted-foreground">
              Loading property details...
            </div>
          ) : error ? (
            <div className="surface-card rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-3 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : property ? (
            <>
              <section className="glass-panel rounded-3xl p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      Property Detail
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mt-2">
                      {property.name}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {property.address || "Address not provided"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        {property.status}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        {property.billingType || "RentCollection"}
                      </span>
                      {property.rentPaymentDate && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100/70 text-amber-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                          <Calendar className="h-4 w-4" />
                          Rent due day {property.rentPaymentDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-white/80 border border-white/50 rounded-2xl px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                      Expected Monthly Rent
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-foreground mt-1">
                      {formatCurrency(expectedMonthlyRent)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Occupancy {occupancyRate}% ({occupiedUnits}/{totalUnits})
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: "Active Tenants",
                    value: activeTenants.length,
                    icon: Users,
                    accent: "bg-primary/10 text-primary",
                  },
                  {
                    label: "Occupied Units",
                    value: occupiedUnits,
                    icon: Home,
                    accent: "bg-blue-100/80 text-blue-600",
                  },
                  {
                    label: "Vacant Units",
                    value: vacancyCount,
                    icon: Home,
                    accent: "bg-amber-100/80 text-amber-700",
                  },
                  {
                    label: "Vacancy Rate",
                    value: `${vacancyRate}%`,
                    icon: ShieldAlert,
                    accent: "bg-red-100/80 text-red-600",
                  },
                ].map((stat) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="surface-card rounded-2xl p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                        {stat.label}
                      </p>
                      <span className={`h-10 w-10 rounded-2xl flex items-center justify-center ${stat.accent}`}>
                        <stat.icon className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="text-lg sm:text-xl font-semibold text-foreground mt-2">
                      {stat.value}
                    </p>
                  </motion.div>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 surface-card rounded-3xl p-5 sm:p-6">
                  <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">
                    Payment Performance (6 months)
                  </h2>
                  <div className="h-64 sm:h-72">
                    <Bar data={barData} options={chartOptions} />
                  </div>
                </div>
                <div className="surface-card rounded-3xl p-5 sm:p-6">
                  <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">
                    Penalties & Policy
                  </h2>
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Penalty Amount</p>
                      <p className="text-base font-semibold text-foreground mt-1">
                        {property.penaltyAmount ? formatCurrency(property.penaltyAmount) : "No penalty"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Penalty Frequency</p>
                      <p className="text-base font-semibold text-foreground mt-1">
                        {property.penaltyFrequency ? property.penaltyFrequency : "Not set"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-xs sm:text-sm">
                      Penalties apply after the rent due day set for this property.
                    </div>
                  </div>
                </div>
              </section>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">
                  Tenant Snapshot
                </h2>
                {tenants.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No tenants found for this property yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tenants.slice(0, 6).map((tenant) => (
                      <div
                        key={tenant._id}
                        className="rounded-2xl border border-border bg-white/80 p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">{tenant.email}</p>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                            (tenant.status || "").toLowerCase() === "active"
                              ? "bg-primary/10 text-primary"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {tenant.status || "Unknown"}
                          </span>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <p>Unit: {tenant.unitType || tenant.unitIdentifier || "—"}</p>
                          <p>House: {tenant.houseNumber || "—"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {tenants.length > 6 && (
                  <p className="text-xs text-muted-foreground mt-4">
                    Showing 6 of {tenants.length} tenants.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="surface-card rounded-3xl p-6 sm:p-8 text-center text-muted-foreground">
              Property not found.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
