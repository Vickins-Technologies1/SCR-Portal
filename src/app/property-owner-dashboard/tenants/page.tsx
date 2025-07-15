"use client";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";

const useAuth = () => {
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  return { userId };
};

export default function TenantsPage() {
  const { userId } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [properties, setProperties] = useState<{ _id: string; name: string; unitTypes?: any[] }[]>([]);
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
    if (!userId) {
      setError("User not authenticated. Please log in.");
      setIsLoading(false);
      router.push("/");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/tenants?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
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
    if (!userId) {
      setError("User not authenticated. Please log in.");
      router.push("/");
      return;
    }
    try {
      const response = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
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
    fetchTenants();
    fetchProperties();
  }, [userId, router]);

  useEffect(() => {
    if (selectedUnitType && selectedPropertyId) {
      const selectedProperty = properties.find((p) => p._id === selectedPropertyId);
      if (selectedProperty && selectedProperty.unitTypes) {
        const unit = selectedProperty.unitTypes.find((u: any) => u.type === selectedUnitType);
        if (unit) {
          setPrice(unit.price?.toString() || "");
          setDeposit(unit.deposit?.toString() || "");
        }
      }
    }
  }, [selectedUnitType, selectedPropertyId, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError("User not authenticated. Please log in.");
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
        body: JSON.stringify({
          name: tenantName,
          email: tenantEmail,
          phone: tenantPhone,
          password: tenantPassword,
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
      if (data.success) {
        console.log(`Sending login credentials to ${tenantEmail}: Password: ${tenantPassword}`);
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

  const selectedProperty = properties.find((p: any) => p._id === selectedPropertyId);
  const unitTypes = selectedProperty?.unitTypes || [];

  if (!userId) {
    return null; // Redirect handled in fetchTenants/fetchProperties
  }

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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
                      <th className="px-6 py-4 font-semibold">Rent ($)</th>
                      <th className="px-6 py-4 font-semibold">Deposit ($)</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant: any) => (
                      <tr key={tenant.id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-6 py-4">{tenant.name}</td>
                        <td className="px-6 py-4">{tenant.email}</td>
                        <td className="px-6 py-4">{tenant.phone}</td>
                        <td className="px-6 py-4">
                          {properties.find((p: any) => p._id === tenant.propertyId)?.name || "Unassigned"}
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                      type="password"
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    >
                      <option value="">Select a property</option>
                      {properties.map((property: any) => (
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                      disabled={!selectedPropertyId}
                    >
                      <option value="">Select a unit type</option>
                      {unitTypes.map((unit: any, index: number) => (
                        <option key={index} value={unit.type}>
                          {unit.type} (${unit.price?.toFixed(2) || "N/A"}/month, ${unit.deposit?.toFixed(2) || "N/A"} deposit, {unit.quantity} available)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Monthly Rent ($)</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Deposit ($)</label>
                    <input
                      type="number"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-gray-300 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !userId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400"
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