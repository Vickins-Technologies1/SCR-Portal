"use client";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, DollarSign, AlertCircle } from "lucide-react";
import Cookies from "js-cookie";

interface UnitType {
  type: string;
  quantity: number;
  price: number;
  deposit: number;
}

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  status: string;
}

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  status: string;
  paymentStatus: string;
  price?: number;
}

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: string;
  tenantId: string;
  propertyId: string;
  date: string;
}

export default function PropertyOwnerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
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
    console.log("Dashboard - Cookies - userId:", uid, "role:", r);
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
        const [propertiesRes, tenantsRes, maintenanceRes] = await Promise.all([
          fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/tenants?userId=${encodeURIComponent(userId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/tenant/maintenance`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        const [propertiesData, tenantsData, maintenanceData] = await Promise.all([
          propertiesRes.json(),
          tenantsRes.json(),
          maintenanceRes.json(),
        ]);

        console.log("Properties response:", propertiesData);
        console.log("Tenants response:", tenantsData);
        console.log("Maintenance response:", maintenanceData);

        if (!propertiesData.success || !tenantsData.success || !maintenanceData.success) {
          throw new Error("Failed to fetch data");
        }

        const propertiesList: Property[] = propertiesData.data || [];
        const tenantsList: Tenant[] = tenantsData.data || [];
        const maintenanceList: MaintenanceRequest[] = maintenanceData.data || [];

        const activeProperties = propertiesList.length;
        const totalTenants = tenantsList.length;
        const totalUnits = propertiesList.reduce((sum: number, property: Property) => {
          return sum + (property.unitTypes?.reduce((s: number, unit: UnitType) => s + unit.quantity, 0) || 0);
        }, 0);
        const occupiedUnits = tenantsList.filter((t: Tenant) => t.status === "active").length;
        const totalMonthlyRent = tenantsList.reduce((sum: number, t: Tenant) => {
          return sum + (t.status === "active" && t.price ? t.price : 0);
        }, 0);
        const overduePayments = tenantsList.filter(
          (t: Tenant) => t.status === "active" && t.paymentStatus === "overdue"
        ).length;

        setProperties(propertiesList);
        setTenants(tenantsList);
        setMaintenanceRequests(maintenanceList);
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
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Sidebar />
      <div className="lg:ml-64 mt-16">
        <main className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 min-h-screen transition-all duration-300">
          {error && (
            <div className="mb-3 p-2 sm:p-3 md:p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-xs sm:text-sm md:text-base">
              <AlertCircle size={16} className="sm:h-5 sm:w-5" />
              {error}
            </div>
          )}
          {isLoading && (
            <div className="mb-3 p-2 sm:p-3 md:p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-xs sm:text-sm md:text-base">
              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-t-2 border-b-2 border-blue-600"></div>
              Loading dashboard...
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
            {[
              {
                title: "Active Properties",
                value: stats.activeProperties,
                icon: <Building2 size={16} className="sm:h-5 sm:w-5" />,
                color: "blue",
              },
              {
                title: "Total Tenants",
                value: stats.totalTenants,
                icon: <Users size={16} className="sm:h-5 sm:w-5" />,
                color: "green",
              },
              {
                title: "Total Units",
                value: stats.totalUnits,
                icon: <Building2 size={16} className="sm:h-5 sm:w-5" />,
                color: "purple",
              },
              {
                title: "Occupied Units",
                value: stats.occupiedUnits,
                icon: <Building2 size={16} className="sm:h-5 sm:w-5" />,
                color: "indigo",
              },
              {
                title: "Monthly Rent",
                value: `Ksh. ${stats.totalMonthlyRent.toFixed(2)}`,
                icon: <DollarSign size={16} className="sm:h-5 sm:w-5" />,
                color: "teal",
              },
              {
                title: "Overdue Payments",
                value: stats.overduePayments,
                icon: <AlertCircle size={16} className="sm:h-5 sm:w-5" />,
                color: "yellow",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className={`bg-white border-l-4 border-${stat.color}-500 p-3 sm:p-4 md:p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200`}
              >
                <h3 className={`text-sm sm:text-base md:text-lg font-medium text-${stat.color}-800 flex items-center gap-2`}>
                  {stat.icon}
                  {stat.title}
                </h3>
                <p className={`text-base sm:text-lg md:text-xl font-bold text-${stat.color}-900 mt-1 sm:mt-2`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Your Properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm text-gray-600 text-xs sm:text-sm md:text-base">
                You currently have no active properties. Add properties to see them here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {properties.map((property) => (
                  <div
                    key={property._id}
                    className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
                  >
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800">{property.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">{property.address}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
                      Total Units: {property.unitTypes.reduce((sum: number, unit: UnitType) => sum + unit.quantity, 0)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
                      Status:{" "}
                      <span
                        className={`inline-block px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-medium rounded-full ${
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

          <section className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Tenant Summary</h2>
            {tenants.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm text-gray-600 text-xs sm:text-sm md:text-base">
                No tenants found. Add tenants to see their activity and rent status here.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-left min-w-[640px] sm:min-w-[768px]">
                  <thead className="sticky top-0 bg-gray-50 text-gray-700">
                    <tr className="text-xs sm:text-sm">
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Name</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Email</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Phone</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Property</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Rent (Ksh.)</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr
                        key={tenant._id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                        onClick={() => router.push(`/property-owner-dashboard/tenants/${tenant._id}`)}
                      >
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {tenant.name}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {tenant.email}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0">
                          {tenant.phone}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {properties.find((p) => p._id === tenant.propertyId)?.name || "Unassigned"}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0">
                          {tenant.price ? tenant.price.toFixed(2) : "N/A"}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                          <span
                            className={`inline-block px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-medium rounded-full ${
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

          <section className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Maintenance Requests</h2>
            {maintenanceRequests.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm text-gray-600 text-xs sm:text-sm md:text-base">
                No maintenance requests found. Tenants will submit requests as needed.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-left min-w-[640px] sm:min-w-[768px]">
                  <thead className="sticky top-0 bg-gray-50 text-gray-700">
                    <tr className="text-xs sm:text-sm">
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Date</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Title</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Description</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Tenant</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Property</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 font-medium min-w-0">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceRequests.map((request) => (
                      <tr
                        key={request._id}
                        className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150"
                      >
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0">
                          {new Date(request.date).toLocaleDateString()}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {request.title}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {request.description}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {tenants.find((t) => t._id === request.tenantId)?.name || "Unknown"}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm min-w-0 truncate">
                          {properties.find((p) => p._id === request.propertyId)?.name || "Unknown"}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                          <span
                            className={`inline-block px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-medium rounded-full ${
                              request.status === "Pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : request.status === "In Progress"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {request.status}
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