"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { AlertCircle, BarChart3, Building2, Filter, RefreshCcw, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import { Line } from "react-chartjs-2";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { usePermissions } from "@/hooks/usePermissions";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Title);

type PropertyReport = {
  period: {
    year: number;
    month: number;
    label: string;
    snapshotDate: string;
  };
  summary: {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    vacancyRate: number;
  };
  properties: Array<{
    propertyId: string;
    propertyName: string;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    vacancyRate: number;
    statusLabel: string;
    statusTone: "success" | "warning" | "danger" | "neutral";
  }>;
  trend: {
    labels: string[];
    occupancyRates: number[];
    vacancyRates: number[];
    occupiedUnits: number[];
    vacantUnits: number[];
    totalUnits: number[];
  };
  availableYears: number[];
  basisNote: string;
};

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const now = new Date();

function fmtPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function toneClasses(tone: PropertyReport["properties"][number]["statusTone"]) {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200";
    case "warning":
      return "bg-amber-500/10 text-amber-700 ring-1 ring-amber-200";
    case "danger":
      return "bg-rose-500/10 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-200";
  }
}

export default function PropertiesReportPage() {
  const router = useRouter();
  const perm = usePermissions();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PropertyReport | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(String(now.getUTCMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getUTCFullYear()));
  const [availableYears, setAvailableYears] = useState<number[]>([now.getUTCFullYear()]);

  const canViewProperties = perm.hasPermission("properties:view");
  const monthOptions = useMemo(() => monthLabels.map((label, index) => ({ label, value: String(index + 1) })), []);

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      router.replace("/");
      return;
    }

    const allowed = userRole === "propertyOwner" || canViewProperties;
    setHasAccess(allowed);
    if (!allowed) {
      setIsLoading(false);
      return;
    }
  }, [router, canViewProperties]);

  useEffect(() => {
    const fetchCsrf = async () => {
      try {
        const existing = Cookies.get("csrf-token");
        if (existing) {
          setCsrfToken(existing);
          return;
        }
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/" });
          setCsrfToken(data.csrfToken);
        }
      } catch {
        setError("Failed to fetch security token.");
      }
    };

    fetchCsrf();
  }, []);

  const fetchReport = async (month = selectedMonth, year = selectedYear) => {
    if (!csrfToken || !hasAccess) return;
    const monthNum = Number(month);
    const yearNum = Number(year);
    if (!Number.isInteger(monthNum) || !Number.isInteger(yearNum)) return;

    setError(null);
    if (!report) setIsLoading(true);

    try {
      const params = new URLSearchParams({
        reportType: "properties",
        month: String(monthNum),
        year: String(yearNum),
      });

      const res = await fetch(`/api/reports?${params.toString()}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to fetch property report.");
      }
      setReport(data.report);
      setAvailableYears(Array.isArray(data.report?.availableYears) ? data.report.availableYears : [now.getUTCFullYear()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess || !csrfToken) return;
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, csrfToken]);

  const onFilterChange = (month: string, year: string) => {
    setSelectedMonth(month);
    setSelectedYear(year);
    startTransition(() => {
      void fetchReport(month, year);
    });
  };

  const resetFilters = () => {
    const currentMonth = String(now.getUTCMonth() + 1);
    const currentYear = String(now.getUTCFullYear());
    setSelectedMonth(currentMonth);
    setSelectedYear(currentYear);
    startTransition(() => {
      void fetchReport(currentMonth, currentYear);
    });
  };

  const chartData = useMemo(() => {
    if (!report) return null;
    return {
      labels: report.trend.labels,
      datasets: [
        {
          label: "Occupancy %",
          data: report.trend.occupancyRates,
          borderColor: "rgb(66, 199, 117)",
          backgroundColor: "rgba(66, 199, 117, 0.14)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "Vacancy %",
          data: report.trend.vacancyRates,
          borderColor: "rgb(245, 158, 11)",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
  }, [report]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" as const },
        title: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            callback: (value: string | number) => `${value}%`,
          },
        },
      },
    }),
    []
  );

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <Sidebar />

      <div className="relative md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="relative mx-auto max-w-7xl space-y-6" data-tour="owner-workspace">
          <section className="surface-card rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
            <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 left-0 h-40 w-40 rounded-full bg-[#1e3a8a]/10 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  Properties performance
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground">
                  Properties Report
                </h1>
                <p className="text-sm text-muted-foreground">
                  View property occupancy and vacancy performance for the selected month and year.
                </p>
              </div>
              {report && (
                <div className="rounded-2xl border border-border bg-white/70 px-4 py-3 shadow-sm backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Selected period</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{report.period.label}</p>
                  <p className="text-xs text-muted-foreground">{report.summary.totalProperties} properties in scope</p>
                </div>
              )}
            </div>
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6" data-tour="owner-properties-report-filters">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Month
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => onFilterChange(e.target.value, selectedYear)}
                    className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => onFilterChange(selectedMonth, e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white/80 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Reset filters
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                <Filter className="h-4 w-4 text-primary" />
                <span>Server-side filters update the selected month and year only.</span>
              </div>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="surface-card rounded-3xl p-10 text-center text-muted-foreground">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-3 text-sm">Loading properties report...</p>
            </div>
          ) : !hasAccess ? (
            <div className="surface-card rounded-3xl p-10 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Access restricted</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your account does not have permission to view property performance reports.
              </p>
            </div>
          ) : !report ? (
            <div className="surface-card rounded-3xl p-10 text-center text-muted-foreground">
              <p className="text-sm">No report data available for the selected period.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Total properties", value: report.summary.totalProperties, icon: Building2 },
                  { label: "Total units", value: report.summary.totalUnits, icon: BarChart3 },
                  { label: "Occupied units", value: report.summary.occupiedUnits, icon: TrendingUp },
                  { label: "Vacant units", value: report.summary.vacantUnits, icon: TrendingDown },
                  {
                    label: "Occupancy rate",
                    value: fmtPercent(report.summary.occupancyRate),
                    icon: TrendingUp,
                  },
                ].map((card, index) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="surface-card rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{card.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
                      </div>
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                        <card.icon className="h-5 w-5" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Occupancy and vacancy trend</h2>
                    <p className="text-sm text-muted-foreground">
                      Historical trend for the last six supported periods.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{report.basisNote}</p>
                </div>
                <div className="mt-5 h-80">
                  {chartData ? <Line data={chartData} options={chartOptions} /> : null}
                </div>
              </section>

              <section className="surface-card rounded-3xl p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Property performance</h2>
                    <p className="text-sm text-muted-foreground">
                      Sorted by occupancy rate, then by total units.
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Occupancy = occupied units / total units
                  </div>
                </div>

                {report.properties.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
                    No properties are available for the selected period.
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-1 gap-4">
                    {report.properties.map((property) => (
                      <div key={property.propertyId} className="rounded-2xl border border-border bg-white/80 p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-foreground">{property.propertyName}</h3>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClasses(property.statusTone)}`}>
                                {property.statusLabel}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Property ID: {property.propertyId}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Stat label="Total" value={property.totalUnits} />
                            <Stat label="Occupied" value={property.occupiedUnits} />
                            <Stat label="Vacant" value={property.vacantUnits} />
                            <Stat label="Vacancy" value={fmtPercent(property.vacancyRate)} />
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <MetricBar label="Occupancy" value={property.occupancyRate} color="bg-primary" />
                          <MetricBar label="Vacancy" value={property.vacancyRate} color="bg-amber-500" />
                          <MetricBar label="Occupied units" value={report.summary.totalUnits > 0 ? (property.occupiedUnits / report.summary.totalUnits) * 100 : 0} color="bg-sky-500" />
                          <MetricBar label="Total units" value={report.summary.totalUnits > 0 ? (property.totalUnits / report.summary.totalUnits) * 100 : 0} color="bg-slate-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {isRefreshing && (
            <div className="fixed bottom-6 right-6 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground shadow-lg">
              Refreshing report...
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{fmtPercent(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}
