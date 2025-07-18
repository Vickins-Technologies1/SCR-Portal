"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { Home, DollarSign, Wrench, User, Send, AlertCircle } from "lucide-react";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
}

export default function TenantDashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maintenanceRequest, setMaintenanceRequest] = useState({
    description: "",
    urgency: "low",
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const uid = Cookies.get("userId");
    const r = Cookies.get("role");
    if (!uid || r !== "tenant") {
      setError("Unauthorized. Please log in as a tenant.");
      router.replace("/");
    } else {
      setUserId(uid);
      setRole(r);
    }
  }, [router]);

  useEffect(() => {
    if (!userId || role !== "tenant") return;

    const fetchTenantData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const tenantRes = await fetch(`/api/tenants/${userId}?userId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();

        if (!tenantData.success) {
          setError(tenantData.message || "Failed to fetch tenant data");
          return;
        }

        setTenant(tenantData.tenant);

        if (tenantData.tenant?.propertyId) {
          const propertyRes = await fetch(`/api/properties/${tenantData.tenant.propertyId}?userId=${encodeURIComponent(userId)}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          const propertyData = await propertyRes.json();

          if (propertyData.success) {
            setProperty(propertyData.property);
          } else {
            setError(propertyData.message || "Failed to fetch property data");
          }
        }
      } catch (err) {
        console.error("Tenant fetch error:", err);
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantData();
  }, [userId, role]);

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenantId: userId,
          propertyId: tenant?.propertyId,
          description: maintenanceRequest.description,
          urgency: maintenanceRequest.urgency,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Maintenance request submitted successfully!");
        setMaintenanceRequest({ description: "", urgency: "low" });
        setIsModalOpen(false);
      } else {
        setError(data.message || "Failed to submit maintenance request");
      }
    } catch (err) {
      console.error("Maintenance submit error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="p-4">
        {/* Hero Section */}
        <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
          <h1 className="text-2xl font-bold mb-2">Welcome, {tenant?.name || "Tenant"}!</h1>
          <p>Manage your lease, track payments, and submit maintenance requests with ease.</p>
        </section>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {successMessage}
          </div>
        )}
        {isLoading && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
            Loading dashboard...
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Property Card */}
          <div className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Home size={20} className="text-teal-600" />
              Leased Property
            </h2>
            {property ? (
              <div className="text-gray-700 text-sm">
                <p className="font-medium">{property.name}</p>
                <p className="text-gray-500">{property.address}</p>
                <p className="mt-2">Unit: {tenant?.houseNumber} ({tenant?.unitType})</p>
                <p>Rent: Ksh. {tenant?.price ? tenant.price.toFixed(2) : "N/A"}</p>
                <p>Deposit: Ksh. {tenant?.deposit ? tenant.deposit.toFixed(2) : "N/A"}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No leased property assigned.</p>
            )}
          </div>

          {/* Payment Card */}
          <div className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <DollarSign size={20} className="text-teal-600" />
              Payment Status
            </h2>
            {tenant ? (
              <div className="text-sm">
                <p>Rent: Ksh. {tenant.price ? tenant.price.toFixed(2) : "N/A"}</p>
                <p className="mt-2">
                  Status:{" "}
                  <span
                    className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${
                      tenant.paymentStatus === "paid"
                        ? "bg-green-100 text-green-800"
                        : tenant.paymentStatus === "overdue"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {tenant.paymentStatus || "N/A"}
                  </span>
                </p>
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${
                        tenant.paymentStatus === "paid" ? "bg-teal-600" : "bg-red-600"
                      }`}
                      style={{ width: tenant.paymentStatus === "paid" ? "100%" : "50%" }}
                    ></div>
                  </div>
                  <p className="text-gray-500 mt-1">
                    {tenant.paymentStatus === "paid" ? "Fully Paid" : "Payment Due"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No payment information available.</p>
            )}
          </div>

          {/* Profile Card */}
          <div className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <User size={20} className="text-teal-600" />
              Your Profile
            </h2>
            {tenant ? (
              <div className="text-sm text-gray-700">
                <p className="font-medium">{tenant.name}</p>
                <p className="text-gray-500">{tenant.email}</p>
                <p className="mt-2">{tenant.phone || "No phone provided"}</p>
                <button
                  className="mt-4 bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700"
                  onClick={() => alert("Profile editing coming soon!")}
                >
                  Edit Profile
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No profile information available.</p>
            )}
          </div>
        </div>

        {/* Maintenance Section */}
        <section className="mt-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wrench size={20} className="text-teal-600" />
              Maintenance Requests
            </h2>
            <button
              className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700"
              onClick={() => setIsModalOpen(true)}
            >
              Submit Request
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
            <p className="text-sm text-gray-500">No maintenance requests submitted yet.</p>
          </div>
        </section>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-xl">
              <h2 className="text-lg font-semibold mb-4">Submit Maintenance Request</h2>
              <form onSubmit={handleMaintenanceSubmit}>
                <label className="block mb-2 font-medium text-sm">Description</label>
                <textarea
                  className="w-full border border-gray-300 rounded-md p-2 mb-4"
                  rows={4}
                  required
                  value={maintenanceRequest.description}
                  onChange={(e) =>
                    setMaintenanceRequest({ ...maintenanceRequest, description: e.target.value })
                  }
                ></textarea>
                <label className="block mb-2 font-medium text-sm">Urgency</label>
                <select
                  className="w-full border border-gray-300 rounded-md p-2 mb-4"
                  value={maintenanceRequest.urgency}
                  onChange={(e) =>
                    setMaintenanceRequest({ ...maintenanceRequest, urgency: e.target.value })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 flex items-center gap-2"
                  >
                    <Send size={18} />
                    Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
