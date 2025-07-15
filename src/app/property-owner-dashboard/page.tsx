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
    return null; // optional: show spinner
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {error && <p className="text-red-600 text-sm mb-6">{error}</p>}
          {successMessage && <p className="text-green-600 text-sm mb-6">{successMessage}</p>}
          {isLoading && <p className="text-gray-600 text-sm mb-6">Loading dashboard...</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            <div className="bg-blue-100 border-l-4 border-blue-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                <Building2 size={20} />
                Active Properties
              </h3>
              <p className="text-3xl font-bold text-blue-700">{stats.activeProperties}</p>
            </div>
            <div className="bg-green-100 border-l-4 border-green-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-green-800 flex items-center gap-2">
                <Users size={20} />
                Total Tenants
              </h3>
              <p className="text-3xl font-bold text-green-700">{stats.totalTenants}</p>
            </div>
            <div className="bg-purple-100 border-l-4 border-purple-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                <Building2 size={20} />
                Total Units
              </h3>
              <p className="text-3xl font-bold text-purple-700">{stats.totalUnits}</p>
            </div>
            <div className="bg-indigo-100 border-l-4 border-indigo-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-indigo-800 flex items-center gap-2">
                <Building2 size={20} />
                Occupied Units
              </h3>
              <p className="text-3xl font-bold text-indigo-700">{stats.occupiedUnits}</p>
            </div>
            <div className="bg-teal-100 border-l-4 border-teal-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-teal-800 flex items-center gap-2">
                <DollarSign size={20} />
                Monthly Rent
              </h3>
              <p className="text-3xl font-bold text-teal-700">${stats.totalMonthlyRent.toFixed(2)}</p>
            </div>
            <div className="bg-yellow-100 border-l-4 border-yellow-500 p-5 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-yellow-800 flex items-center gap-2">
                <AlertCircle size={20} />
                Overdue Payments
              </h3>
              <p className="text-3xl font-bold text-yellow-700">{stats.overduePayments}</p>
            </div>
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Your Properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600">
                You currently have no active properties. Add properties to see them here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map((property) => (
                  <div key={property._id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-md">
                    <h3 className="text-lg font-semibold text-gray-700">{property.name}</h3>
                    <p className="text-sm text-gray-600">{property.address}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      Total Units: {property.unitTypes.reduce((sum: number, unit: any) => sum + unit.quantity, 0)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Status: <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${property.status === "occupied" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{property.status}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Tenant Summary</h2>
            {tenants.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600">
                No tenants found. Add tenants to see their activity and rent status here.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700">
                      <th className="px-6 py-4 font-semibold">Name</th>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Phone</th>
                      <th className="px-6 py-4 font-semibold">Property</th>
                      <th className="px-6 py-4 font-semibold">Rent ($)</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr key={tenant._id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-6 py-4">{tenant.name}</td>
                        <td className="px-6 py-4">{tenant.email}</td>
                        <td className="px-6 py-4">{tenant.phone}</td>
                        <td className="px-6 py-4">{properties.find((p) => p._id === tenant.propertyId)?.name || "Unassigned"}</td>
                        <td className="px-6 py-4">{tenant.price ? tenant.price.toFixed(2) : "N/A"}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${tenant.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tenant.status || "N/A"}</span>
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