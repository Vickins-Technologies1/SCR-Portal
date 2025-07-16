// src/app/property-owner-dashboard/page.tsx
"use client";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, DollarSign, AlertCircle } from "lucide-react";
import Cookies from "js-cookie";

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [stats, setStats] = useState({
    activeProperties: 0,
    totalTenants: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    totalMonthlyRent: 0,
    overduePayments: 0,
  });

  // Load cookies on client after hydration
  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    if (!uid || r !== "propertyOwner") {
      router.replace("/");
    } else {
      setUserId(uid);
      setRole(r);
    }
  }, [router]);

  useEffect(() => {
    if (!userId || role !== "propertyOwner") return;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [propertiesRes, tenantsRes] = await Promise.all([
          fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/tenants?userId=${encodeURIComponent(userId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        const [propertiesData, tenantsData] = await Promise.all([
          propertiesRes.json(),
          tenantsRes.json(),
        ]);

        if (!propertiesData.success || !tenantsData.success) {
          throw new Error("Failed to fetch data");
        }

        const propertiesList = propertiesData.properties || [];
        const tenantsList = tenantsData.tenants || [];

        const activeProperties = propertiesList.length;
        const totalTenants = tenantsList.length;
        const totalUnits = propertiesList.reduce((sum: number, property: any) => {
          return sum + (property.unitTypes?.reduce((s: number, unit: any) => s + unit.quantity, 0) || 0);
        }, 0);
        const occupiedUnits = tenantsList.filter((t: any) => t.status === "active").length;
        const totalMonthlyRent = tenantsList.reduce((sum: number, t: any) => {
          return sum + (t.status === "active" && t.price ? t.price : 0);
        }, 0);
        const overduePayments = tenantsList.filter(
          (t: any) => t.status === "active" && t.paymentStatus === "overdue"
        ).length;

        setProperties(propertiesList);
        setTenants(tenantsList);
        setStats({
          activeProperties,
          totalTenants,
          totalUnits,
          occupiedUnits,
          totalMonthlyRent,
          overduePayments,
        });
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("Failed to load dashboard data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, role]);

  if (!userId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Sidebar />
      <div className="lg:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 min-h-screen transition-all duration-300">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle size={20} />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2">
              {successMessage}
            </div>
          )}
          {isLoading && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
              Loading dashboard...
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
            {[
              {
                title: "Active Properties",
                value: stats.activeProperties,
                icon: <Building2 size={20} />,
                color: "blue",
              },
              {
                title: "Total Tenants",
                value: stats.totalTenants,
                icon: <Users size={20} />,
                color: "green",
              },
              {
                title: "Total Units",
                value: stats.totalUnits,
                icon: <Building2 size={20} />,
                color: "purple",
              },
              {
                title: "Occupied Units",
                value: stats.occupiedUnits,
                icon: <Building2 size={20} />,
                color: "indigo",
              },
              {
                title: "Monthly Rent",
                value: `Ksh. ${stats.totalMonthlyRent.toFixed(2)}`,
                icon: <DollarSign size={20} />,
                color: "teal",
              },
              {
                title: "Overdue Payments",
                value: stats.overduePayments,
                icon: <AlertCircle size={20} />,
                color: "yellow",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className={`bg-white border-l-4 border-${stat.color}-500 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200`}
              >
                <h3 className={`text-lg font-medium text-${stat.color}-800 flex items-center gap-2`}>
                  {stat.icon}
                  {stat.title}
                </h3>
                <p className={`text-2xl font-bold text-${stat.color}-900 mt-2`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Your Properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600">
                You currently have no active properties. Add properties to see them here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {properties.map((property) => (
                  <div
                    key={property._id}
                    className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
                  >
                    <h3 className="text-lg font-semibold text-gray-800">{property.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{property.address}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Total Units: {property.unitTypes.reduce((sum: number, unit: any) => sum + unit.quantity, 0)}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Status:{" "}
                      <span
                        className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                          property.status === "occupied"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
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

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Tenant Summary</h2>
            {tenants.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600">
                No tenants found. Add tenants to see their activity and rent status here.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700 text-sm">
                      <th className="px-6 py-4 font-medium">Name</th>
                      <th className="px-6 py-4 font-medium">Email</th>
                      <th className="px-6 py-4 font-medium">Phone</th>
                      <th className="px-6 py-4 font-medium">Property</th>
                      <th className="px-6 py-4 font-medium">Rent (Ksh.)</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr
                        key={tenant._id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150"
                      >
                        <td className="px-6 py-4 text-gray-700">{tenant.name}</td>
                        <td className="px-6 py-4 text-gray-700">{tenant.email}</td>
                        <td className="px-6 py-4 text-gray-700">{tenant.phone}</td>
                        <td className="px-6 py-4 text-gray-700">
                          {properties.find((p) => p._id === tenant.propertyId)?.name || "Unassigned"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">{tenant.price ? tenant.price.toFixed(2) : "N/A"}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                              tenant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {tenant.status || "N/A"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}