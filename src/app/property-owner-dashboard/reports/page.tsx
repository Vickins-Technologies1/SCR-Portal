
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart2, AlertCircle } from "lucide-react";
import Cookies from "js-cookie";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

// TypeScript Interfaces
interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

interface Property {
  _id: string;
  name: string;
  unitTypes: UnitType[];
}

interface Report {
  _id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  revenue: number;
  date: string;
  status: string;
  ownerId: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface ReportStats {
  totalRevenue: number;
  overduePayments: number;
  occupancyRate: number;
}

// Reusable Components
/** Stat Card Component */
const StatCard = ({
  title,
  value,
  icon,
  color,
  delay,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay: number;
}) => (
  <div
    className={`p-6 rounded-xl shadow-sm border-l-4 border-${color}-500 bg-${color}-50 transform transition-transform hover:scale-105 animate-fade-in-up`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <p className="text-2xl font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  </div>
);

/** Report Row Component */
const ReportRow = ({ report, properties }: { report: Report; properties: Property[] }) => (
  <tr className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-200">
    <td className="px-6 py-4">{report.tenantName}</td>
    <td className="px-6 py-4">{properties.find((p) => p._id === report.propertyId)?.name || "Unassigned"}</td>
    <td className="px-6 py-4">Ksh. {report.revenue.toFixed(2)}</td>
    <td className="px-6 py-4">{new Date(report.date).toLocaleDateString()}</td>
    <td className="px-6 py-4">
      <span
        className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
          report.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
        }`}
      >
        {report.status || "N/A"}
      </span>
    </td>
  </tr>
);

/** ReportsPage Component */
export default function ReportsPage() {
  const router = useRouter();
  const [propertyOwnerId, setPropertyOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReportStats>({
    totalRevenue: 0,
    overduePayments: 0,
    occupancyRate: 0,
  });

  /** Load authentication from cookies */
  useEffect(() => {
    const ownerId = Cookies.get("userId"); // Cookie name set by /api/signin
    const r = Cookies.get("role");
    if (!ownerId || r !== "propertyOwner") {
      router.replace("/");
      return;
    }
    setPropertyOwnerId(ownerId);
    setRole(r);
  }, [router]);

  /** Fetch reports and properties data */
  useEffect(() => {
    if (!propertyOwnerId || role !== "propertyOwner") return;

    const fetchReportsData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [reportsRes, propertiesRes] = await Promise.all([
          fetch("/api/reports", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/properties?userId=${encodeURIComponent(propertyOwnerId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        if (!reportsRes.ok || !propertiesRes.ok) {
          throw new Error(`HTTP error! Reports: ${reportsRes.status}, Properties: ${propertiesRes.status}`);
        }

        const [reportsData, propertiesData] = await Promise.all([
          reportsRes.json() as Promise<ApiResponse<Report[]>>,
          propertiesRes.json() as Promise<ApiResponse<Property[]>>,
        ]);

        if (!reportsData.success || !propertiesData.success) {
          throw new Error(reportsData.message || propertiesData.message || "Failed to fetch data");
        }

        const reportsList = reportsData.data || [];
        const propertiesList = propertiesData.data || [];

        // Calculate stats
        const totalRevenue = reportsList.reduce(
          (sum: number, report: Report) =>
            sum + (report.status === "paid" && report.revenue ? report.revenue : 0),
          0
        );
        const overduePayments = reportsList.filter(
          (r: Report) => r.status === "overdue"
        ).length;
        const totalUnits = propertiesList.reduce(
          (sum: number, property: Property) =>
            sum + (property.unitTypes?.reduce((s: number, unit: UnitType) => s + unit.quantity, 0) || 0),
          0
        );
        const occupiedUnits = new Set(
          reportsList
            .filter((r: Report) => r.status === "paid")
            .map((r: Report) => r.tenantId)
        ).size;
        const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

        setReports(reportsList);
        setProperties(propertiesList);
        setStats({
          totalRevenue,
          overduePayments,
          occupancyRate,
        });
      } catch (err) {
        console.error("Fetch reports error:", err);
        setError("Failed to load reports data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportsData();
  }, [propertyOwnerId, role]);

  // Memoize report rows to prevent unnecessary re-renders
  const reportRows = useMemo(
    () =>
      reports.map((report) => (
        <ReportRow key={report._id} report={report} properties={properties} />
      )),
    [reports, properties]
  );

  // Memoize stat cards to prevent unnecessary re-renders
  const statCards = useMemo(
    () => [
      {
        title: "Total Revenue",
        value: `Ksh. ${stats.totalRevenue.toFixed(2)}`,
        icon: <BarChart2 size={24} className="text-teal-600" />,
        color: "teal",
        delay: 0,
      },
      {
        title: "Overdue Payments",
        value: stats.overduePayments,
        icon: <AlertCircle size={24} className="text-yellow-600" />,
        color: "yellow",
        delay: 100,
      },
      {
        title: "Occupancy Rate",
        value: `${stats.occupancyRate.toFixed(1)}%`,
        icon: <BarChart2 size={24} className="text-blue-600" />,
        color: "blue",
        delay: 200,
      },
    ],
    [stats]
  );

  if (!propertyOwnerId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#03a678] border-solid"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {/* Header */}
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2 animate-fade-in">
            <BarChart2 size={28} className="text-[#03a678]" />
            Reports
          </h1>

          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm flex items-center gap-2 animate-fade-in">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {isLoading && (
            <div className="mb-6 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#03a678] border-solid"></div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {statCards.map((stat, index) => (
              <StatCard key={index} {...stat} />
            ))}
          </div>

          {/* Reports List */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Report Details</h2>
            {reports.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600 text-center animate-fade-in">
                No reports found. Report details will appear here once generated.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Tenant</th>
                        <th className="px-6 py-4 font-semibold">Property</th>
                        <th className="px-6 py-4 font-semibold">Revenue (Ksh.)</th>
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>{reportRows}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
