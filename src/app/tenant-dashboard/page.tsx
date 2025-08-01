"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  Home,
  DollarSign,
  Wrench,
  User,
  Send,
  AlertCircle,
  Wallet,
  LogOut,
} from "lucide-react";

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
  updatedAt?: string;
  wallet: number;
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
  const [isImpersonated, setIsImpersonated] = useState(false);
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
    // Unified cookie getter with fallback
    const getCookie = (name: string): string | null => {
      const value = Cookies.get(name);
      if (value !== undefined) return value;

      const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`));
      return cookie ? cookie.split("=")[1] : null;
    };

    const uid = getCookie("userId");
    const role = getCookie("role") ?? null;
    const originalRole = getCookie("originalRole") ?? null;
    const originalUserId = getCookie("originalUserId") ?? null;

    console.log("Cookies retrieved:", {
      userId: uid ?? "null",
      role: role ?? "null",
      originalRole: originalRole ?? "null",
      originalUserId: originalUserId ?? "null",
      documentCookie: document.cookie,
    });

    const isTenant = role === "tenant";
    const isImpersonating = originalRole === "propertyOwner" && originalUserId !== null;

    if (!uid || (!isTenant && !isImpersonating)) {
      setError("Unauthorized. Please log in as a tenant or impersonate a tenant.");
      console.log(
        `Unauthorized access - userId: ${uid ?? "null"}, role: ${role ?? "null"}, originalRole: ${
          originalRole ?? "null"
        }, originalUserId: ${originalUserId ?? "null"}`
      );
      setTimeout(() => router.replace("/"), 2000);
      return;
    }

    setUserId(uid);
    if (isImpersonating) {
      setIsImpersonated(true);
      console.log(
        `Impersonation session detected - userId: ${uid}, originalUserId: ${originalUserId}, originalRole: ${originalRole}`
      );
    }
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    const fetchTenantData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const tenantRes = await fetch("/api/tenant/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();

        if (!tenantData.success) {
          setError(tenantData.message || "Failed to fetch tenant data");
          console.log(`Failed to fetch tenant data - Error: ${tenantData.message}`);
          return;
        }

        setTenant(tenantData.tenant);

        if (tenantData.tenant?.propertyId) {
          const propertyRes = await fetch(`/api/properties/${tenantData.tenant.propertyId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          const propertyData = await propertyRes.json();

          if (propertyData.success) {
            setProperty(propertyData.property);
          } else {
            setError(propertyData.message || "Failed to fetch property data");
            console.log(`Failed to fetch property data - Error: ${propertyData.message}`);
          }
        }
      } catch (err) {
        console.error("Tenant fetch error:", err instanceof Error ? err.message : "Unknown error");
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantData();
  }, [userId]);

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const csrfRes = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const { csrfToken } = await csrfRes.json();

      if (!csrfToken) {
        throw new Error("CSRF token not received");
      }

      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          tenantId: userId,
          propertyId: tenant?.propertyId,
          description: maintenanceRequest.description,
          urgency: maintenanceRequest.urgency,
          csrfToken,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Maintenance request submitted successfully!");
        setMaintenanceRequest({ description: "", urgency: "low" });
        setIsModalOpen(false);
      } else {
        setError(data.message || "Failed to submit maintenance request");
        console.log(`Maintenance request failed - Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Maintenance submit error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to submit maintenance request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevertImpersonation = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const csrfRes = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const { csrfToken } = await csrfRes.json();

      if (!csrfToken) {
        throw new Error("CSRF token not received");
      }

      const res = await fetch("/api/impersonate/revert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ csrfToken }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Impersonation reverted successfully!");
        console.log("Impersonation reverted successfully");
        Cookies.remove("userId", { path: "/" });
        Cookies.remove("role", { path: "/" });
        Cookies.remove("originalUserId", { path: "/" });
        Cookies.remove("originalRole", { path: "/" });
        setTimeout(() => router.push("/property-owner-dashboard"), 1000);
      } else {
        setError(data.message || "Failed to revert impersonation");
        console.log(`Revert impersonation failed - Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Revert impersonation error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to revert impersonation");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white">
      <main className="p-4 max-w-7xl mx-auto">
        <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Welcome, {tenant?.name || "Tenant"}!</h1>
            <p>Manage your lease, track payments, and submit maintenance requests with ease.</p>
          </div>
          {isImpersonated && (
            <button
              onClick={handleRevertImpersonation}
              disabled={isLoading}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2"
            >
              <LogOut size={18} />
              Revert Impersonation
            </button>
          )}
        </section>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg">
            {successMessage}
          </div>
        )}
        {isLoading && (
          <div className="mb-4 p-4 bg-blue-100 text-blue-800 rounded-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
            Loading...
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card icon={<Home />} title="Leased Property">
            {property ? (
              <>
                <p className="font-medium">{property.name}</p>
                <p className="text-gray-500">{property.address}</p>
                <p className="mt-2">Unit: {tenant?.houseNumber} ({tenant?.unitType})</p>
                <p>Rent: Ksh {tenant?.price?.toFixed(2)}</p>
                <p>Deposit: Ksh {tenant?.deposit?.toFixed(2)}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No property assigned.</p>
            )}
          </Card>

          <Card icon={<DollarSign />} title="Payment Status">
            {tenant ? (
              <>
                <p>Rent: Ksh {tenant.price?.toFixed(2)}</p>
                <p className="mt-2">
                  Status:
                  <span
                    className={`ml-2 inline-block px-3 py-1 text-sm font-medium rounded-full ${
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
              </>
            ) : (
              <p className="text-sm text-gray-500">No payment info.</p>
            )}
          </Card>

          <Card icon={<Wallet />} title="Wallet Balance">
            {tenant ? (
              <>
                <p className="text-2xl font-bold text-teal-700">Ksh {tenant.wallet?.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">Use wallet for quick rent payments.</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Wallet not available.</p>
            )}
          </Card>

          <Card icon={<User />} title="Your Profile">
            {tenant ? (
              <>
                <p className="font-medium">{tenant.name}</p>
                <p className="text-gray-500">{tenant.email}</p>
                <p className="mt-2">{tenant.phone || "No phone provided"}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No profile info.</p>
            )}
          </Card>
        </div>

        <section className="mt-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wrench size={20} className="text-teal-600" /> Maintenance Requests
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
                    <Send size={18} /> Submit
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

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
        <span className="text-teal-600">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  );
}