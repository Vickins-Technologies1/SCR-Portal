// src/app/tenants/page.tsx
"use client";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie"; // Import js-cookie

const useAuth = () => {
  if (typeof window === "undefined") {
    console.log("useAuth: Running server-side, returning null");
    return { userId: null, role: null };
  }
  const userId = Cookies.get("userId") || null;
  const role = Cookies.get("role") || null;
  console.log("useAuth: Cookies read:", { userId, role });
  return { userId, role };
};

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

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  houseNumber: string;
  price: number;
  deposit: number;
  status: string;
}

export default function TenantsPage() {
  const { userId, role } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantPassword, setTenantPassword] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitType, setSelectedUnitType] = useState("");
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [houseNumber, setHouseNumber] = useState("");

  const fetchTenants = async () => {
    if (!userId || role !== "propertyOwner") {
      console.log("fetchTenants: No userId or invalid role, redirecting to /", { userId, role });
      setError("User not authenticated or not authorized. Please log in as a property owner.");
      setIsLoading(false);
      router.push("/");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/tenants?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchTenants response:", data);
      if (data.success) {
        setTenants(data.tenants || []);
      } else {
        setError(data.message || "Failed to fetch tenants");
      }
    } catch (err) {
      console.error("Fetch tenants error:", err);
      setError("Failed to connect to the server or invalid response");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProperties = async () => {
    if (!userId || role !== "propertyOwner") {
      console.log("fetchProperties: No userId or invalid role, redirecting to /", { userId, role });
      setError("User not authenticated or not authorized. Please log in as a property owner.");
      router.push("/");
      return;
    }
    try {
      const response = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchProperties response:", data);
      if (data.success) {
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties");
      }
    } catch (err) {
      console.error("Fetch properties error:", err);
      setError("Failed to connect to the server or invalid response");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      console.log("useEffect: Skipping fetch during SSR");
      return;
    }
    fetchTenants();
    fetchProperties();
  }, [userId, role, router]);

  useEffect(() => {
    if (selectedUnitType && selectedPropertyId) {
      const selectedProperty = properties.find((p) => p._id === selectedPropertyId);
      if (selectedProperty && selectedProperty.unitTypes) {
        const unit = selectedProperty.unitTypes.find((u) => u.type === selectedUnitType);
        if (unit) {
          setPrice(unit.price?.toString() || "");
          setDeposit(unit.deposit?.toString() || "");
        }
      }
    }
  }, [selectedUnitType, selectedPropertyId, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || role !== "propertyOwner") {
      console.log("handleSubmit: No userId or invalid role, redirecting to /", { userId, role });
      setError("User not authenticated or not authorized. Please log in as a property owner.");
      router.push("/");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies
        body: JSON.stringify({
          name: tenantName,
          email: tenantEmail,
          phone: tenantPhone,
          password: tenantPassword, // Note: Should be hashed server-side
          role: "tenant",
          ownerId: userId,
          propertyId: selectedPropertyId,
          unitType: selectedUnitType,
          price: parseFloat(price) || 0,
          deposit: parseFloat(deposit) || 0,
          houseNumber,
        }),
      });
      const data = await response.json();
      console.log("Add tenant response:", data);
      if (data.success) {
        setSuccessMessage(`Tenant added successfully! Login credentials sent to ${tenantEmail}.`);
        setIsModalOpen(false);
        setTenantName("");
        setTenantEmail("");
        setTenantPhone("");
        setTenantPassword("");
        setSelectedPropertyId("");
        setSelectedUnitType("");
        setPrice("");
        setDeposit("");
        setHouseNumber("");
        fetchTenants();
      } else {
        setError(data.message || "Failed to add tenant");
      }
    } catch (err) {
      console.error("Add tenant error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProperty = properties.find((p) => p._id === selectedPropertyId);
  const unitTypes = selectedProperty?.unitTypes || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2">
            <Users size={28} className="text-[#03a678]" />
            Tenants
          </h1>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Add Tenant
            </button>
          </div>
          {successMessage && <p className="text-green-600 text-sm mb-6">{successMessage}</p>}
          {error && <p className="text-red-600 text-sm mb-6">{error}</p>}
          {isLoading && <p className="text-gray-600 text-sm mb-6">Loading tenants...</p>}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Tenant List</h2>
            {tenants.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600">
                No tenants found. Add tenants to see them here.
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
                      <th className="px-6 py-4 font-semibold">Unit Type</th>
                      <th className="px-6 py-4 font-semibold">House Number</th>
                      <th className="px-6 py-4 font-semibold">Rent (Ksh)</th>
                      <th className="px-6 py-4 font-semibold">Deposit (Ksh)</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr key={tenant._id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-6 py-4">{tenant.name}</td>
                        <td className="px-6 py-4">{tenant.email}</td>
                        <td className="px-6 py-4">{tenant.phone}</td>
                        <td className="px-6 py-4">
                          {properties.find((p) => p._id === tenant.propertyId)?.name || "Unassigned"}
                        </td>
                        <td className="px-6 py-4">{tenant.unitType || "N/A"}</td>
                        <td className="px-6 py-4">{tenant.houseNumber || "N/A"}</td>
                        <td className="px-6 py-4">{tenant.price ? tenant.price.toFixed(2) : "N/A"}</td>
                        <td className="px-6 py-4">{tenant.deposit ? tenant.deposit.toFixed(2) : "N/A"}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                              tenant.status === "active"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
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
          {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
                <h2 className="text-2xl font-semibold mb-4">Add Tenant</h2>
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                      type="password"
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Property</label>
                    <select
                      value={selectedPropertyId}
                      onChange={(e) => {
                        setSelectedPropertyId(e.target.value);
                        setSelectedUnitType("");
                        setPrice("");
                        setDeposit("");
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a property</option>
                      {properties.map((property) => (
                        <option key={property._id} value={property._id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Unit Type</label>
                    <select
                      value={selectedUnitType}
                      onChange={(e) => setSelectedUnitType(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={!selectedPropertyId}
                    >
                      <option value="">Select a unit type</option>
                      {unitTypes.map((unit, index) => (
                        <option key={index} value={unit.type}>
                          {unit.type} (Ksh.{unit.price?.toFixed(2) || "N/A"}/month, Ksh.{unit.deposit?.toFixed(2) || "N/A"} deposit, {unit.quantity} available)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Monthly Rent (Ksh.)</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Deposit (Ksh.)</label>
                    <input
                      type="number"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">House Number</label>
                    <input
                      type="text"
                      value={houseNumber}
                      onChange={(e) => setHouseNumber(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !userId || role !== "propertyOwner"}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                    >
                      {isLoading ? "Adding..." : "Add Tenant"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}