// src/app/properties/page.tsx
"use client";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { useState, useEffect } from "react";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie"; // Import js-cookie

const useAuth = () => {
  if (typeof window === "undefined") {
    console.log("useAuth: Running server-side, returning null");
    return { userId: null };
  }
  const userId = Cookies.get("userId") || null;
  console.log("useAuth: Cookies read:", { userId });
  return { userId };
};

type UnitType = {
  type: string;
  quantity: number;
  price?: number;
  deposit?: number;
};

type Property = {
  id: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  status: string;
  ownerId: string;
  createdAt: string;
  _id: string;
};

export default function PropertiesPage() {
  const { userId } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([{ type: "", quantity: 0, price: 0, deposit: 0 }]);

  const fetchProperties = async () => {
    if (!userId) {
      console.log("fetchProperties: No userId, redirecting to /");
      setError("User not authenticated. Please log in.");
      setIsLoading(false);
      router.push("/");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies for server-side validation
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchProperties response:", data); // Log response
      if (data.success) {
        data.properties?.forEach((property: Property) => {
          property.unitTypes.forEach((unit: UnitType, index: number) => {
            if (unit.price === undefined || unit.deposit === undefined) {
              console.warn(`Property ${property.name} has invalid unitType at index ${index}:`, unit);
            }
          });
        });
        setProperties(data.properties || []);
      } else {
        setError(data.message || "Failed to fetch properties");
      }
    } catch (err) {
      console.error("Fetch properties error:", err);
      setError("Failed to connect to the server or invalid response");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      console.log("useEffect: Skipping fetch during SSR");
      return;
    }
    fetchProperties();
  }, [userId, router]);

  const handleUnitTypeChange = (index: number, field: keyof UnitType, value: string) => {
    const updatedUnitTypes = [...unitTypes];
    if (field === "quantity" || field === "price" || field === "deposit") {
      const parsedValue = value === "" ? 0 : parseFloat(value);
      updatedUnitTypes[index] = {
        ...updatedUnitTypes[index],
        [field]: isNaN(parsedValue) ? 0 : parsedValue,
      };
    } else {
      updatedUnitTypes[index] = {
        ...updatedUnitTypes[index],
        [field]: value,
      };
    }
    setUnitTypes(updatedUnitTypes);
  };

  const addUnitType = () => {
    setUnitTypes([...unitTypes, { type: "", quantity: 0, price: 0, deposit: 0 }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      console.log("handleSubmit: No userId, redirecting to /");
      setError("User not authenticated. Please log in.");
      router.push("/");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      for (const unit of unitTypes) {
        if (!unit.type || unit.quantity < 0 || unit.price === undefined || unit.price < 0 || unit.deposit === undefined || unit.deposit < 0) {
          setError("All unit types must have a valid type, quantity, price, and deposit");
          setIsLoading(false);
          return;
        }
      }
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies
        body: JSON.stringify({
          name: propertyName,
          address: propertyAddress,
          unitTypes,
          status: "vacant",
          ownerId: userId,
        }),
      });
      const data = await response.json();
      console.log("Add property response:", data); // Log response
      if (data.success) {
        setIsModalOpen(false);
        setPropertyName("");
        setPropertyAddress("");
        setUnitTypes([{ type: "", quantity: 0, price: 0, deposit: 0 }]);
        fetchProperties();
      } else {
        setError(data.message || "Failed to add property");
      }
    } catch (err) {
      console.error("Add property error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2">
            <Building2 size={28} className="text-[#03a678]" />
            Properties
          </h1>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Add Property
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mb-6">{error}</p>}
          {isLoading && <p className="text-gray-600 text-sm mb-6">Loading properties...</p>}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Property List</h2>
            {properties.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600">
                No properties found. Add properties to see them here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map((property: Property) => (
                  <div
                    key={property.id}
                    className="bg-white border border-gray-200 rounded-xl p-6 shadow-md"
                  >
                    <h3 className="text-lg font-semibold text-gray-700">{property.name}</h3>
                    <p className="text-sm text-gray-600">{property.address}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      Unit Types:
                      {property.unitTypes && property.unitTypes.length > 0 ? (
                        <ul className="list-disc ml-4">
                          {property.unitTypes.map((unit: UnitType, index: number) => (
                            <li key={index}>
                              {unit.type}: {unit.quantity} units at $
                              {typeof unit.price === "number" ? unit.price.toFixed(2) : "N/A"}/month, $
                              {typeof unit.deposit === "number" ? unit.deposit.toFixed(2) : "N/A"} deposit
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "N/A"
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      Total Units: {property.unitTypes ? property.unitTypes.reduce((sum: number, unit: UnitType) => sum + unit.quantity, 0) : "N/A"}
                    </p>
                    <p className="text-sm text-gray-600">
                      Status:
                      <span
                        className={`ml-2 inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                          property.status === "occupied"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {property.status || "N/A"}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
          {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg">
                <h2 className="text-2xl font-semibold mb-4">Add Property</h2>
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Property Name</label>
                    <input
                      type="text"
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Property Address</label>
                    <input
                      type="text"
                      value={propertyAddress}
                      onChange={(e) => setPropertyAddress(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Unit Types</label>
                    {unitTypes.map((unit, index) => (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Type (e.g., One-Bedroom)"
                          value={unit.type}
                          onChange={(e) => handleUnitTypeChange(index, "type", e.target.value)}
                          className="col-span-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Quantity"
                          value={unit.quantity || ""}
                          onChange={(e) => handleUnitTypeChange(index, "quantity", e.target.value)}
                          className="col-span-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                          min="0"
                        />
                        <input
                          type="number"
                          placeholder="Price ($/month)"
                          value={unit.price || ""}
                          onChange={(e) => handleUnitTypeChange(index, "price", e.target.value)}
                          className="col-span-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                          min="0"
                          step="0.01"
                        />
                        <input
                          type="number"
                          placeholder="Deposit ($)"
                          value={unit.deposit || ""}
                          onChange={(e) => handleUnitTypeChange(index, "deposit", e.target.value)}
                          className="col-span-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                          min="0"
                          step="0.01"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addUnitType}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Add Another Unit Type
                    </button>
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
                      disabled={isLoading || !userId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                    >
                      {isLoading ? "Adding..." : "Add Property"}
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