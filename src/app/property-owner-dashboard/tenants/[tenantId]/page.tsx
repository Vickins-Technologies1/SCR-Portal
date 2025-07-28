"use client";

import React, { useState, useEffect } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { User, LogIn, ArrowLeft, Edit, Trash2 } from "lucide-react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
}

interface Property {
  _id: string;
  name: string;
}

export default function TenantDetailsPage() {
  const router = useRouter();
  const { tenantId } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPropertyLoading, setIsPropertyLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Partial<Tenant> | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
          console.log("CSRF token fetched successfully");
        } else {
          setError("Failed to fetch CSRF token.");
          console.log("CSRF token fetch failed - Response:", data);
        }
      } catch (err) {
        setError("Failed to connect to server for CSRF token.");
        console.log("CSRF token fetch error:", err instanceof Error ? err.message : "Unknown error");
      }
    };
    fetchCsrfToken();
  }, []);

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
    }
  }, [router]);

  // Fetch tenant and property data
  useEffect(() => {
    if (!userId || !tenantId || role !== "propertyOwner" || !csrfToken) return;

    const fetchTenant = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tenants/${tenantId}?userId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && data.tenant) {
          const tenantData = {
            ...data.tenant,
            walletBalance: data.tenant.walletBalance ?? 0,
          };
          setTenant(tenantData);
          if (data.tenant?.propertyId) {
            fetchProperty(data.tenant.propertyId);
          }
        } else {
          setError(data.message || "Tenant not found.");
          console.log(`Failed to fetch tenant - Error: ${data.message || "Unknown error"}`);
        }
      } catch (error) {
        console.error("Error fetching tenant:", error);
        setError("Failed to connect to the server. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    const fetchProperty = async (propertyId: string) => {
      setIsPropertyLoading(true);
      try {
        const res = await fetch(`/api/properties/${propertyId}?userId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          setProperty(data.property);
        } else {
          setError(data.message || "Failed to fetch property details.");
          console.log(`Failed to fetch property - Error: ${data.message || "Unknown error"}`);
        }
      } catch (error) {
        console.error("Error fetching property:", error);
        setError("Failed to fetch property details. Please try again later.");
      } finally {
        setIsPropertyLoading(false);
      }
    };

    fetchTenant();
  }, [userId, tenantId, role, csrfToken]);

  const handleImpersonate = async () => {
    if (!tenant || !userId || !csrfToken) {
      setError("Missing tenant, user ID, or CSRF token.");
      console.log("Impersonation failed - Missing data", { tenantId: tenant?._id, userId, csrfToken });
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenant._id, userId, csrfToken }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Impersonation successful! Redirecting to tenant dashboard...");
        console.log(`Impersonation successful - tenantId: ${tenant._id}, userId: ${userId}`);
        setTimeout(() => {
          Cookies.set("userId", tenant._id, { path: "/", expires: 1 });
          Cookies.set("role", "tenant", { path: "/", expires: 1 });
          Cookies.set("originalUserId", userId, { path: "/", expires: 1 });
          Cookies.set("originalRole", "propertyOwner", { path: "/", expires: 1 });
          router.push("/tenant-dashboard");
        }, 1000);
      } else {
        setError(data.message || "Failed to impersonate tenant.");
        console.log(`Impersonation failed - Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error impersonating tenant:", error);
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant || !confirm("Are you sure you want to delete this tenant? This action cannot be undone.") || !csrfToken) {
      setError("Missing tenant or CSRF token.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csrfToken, userId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Tenant deleted successfully!");
        setTimeout(() => router.push("/property-owner-dashboard/tenants"), 1000);
      } else {
        setError(data.message || "Failed to delete tenant.");
        console.log(`Delete tenant failed - Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error deleting tenant:", error);
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    if (!tenant) return;
    setEditTenant({ ...tenant });
    setShowEditModal(true);
    setError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTenant || !tenant || !csrfToken) {
      setError("Missing tenant data or CSRF token.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editTenant.name,
          email: editTenant.email,
          phone: editTenant.phone,
          houseNumber: editTenant.houseNumber,
          leaseStartDate: editTenant.leaseStartDate,
          leaseEndDate: editTenant.leaseEndDate,
          userId,
          csrfToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTenant({ ...tenant, ...editTenant });
        setSuccessMessage("Tenant updated successfully!");
        setShowEditModal(false);
        setEditTenant(null);
      } else {
        setError(data.message || "Failed to update tenant.");
        console.log(`Update tenant failed - Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error updating tenant:", error);
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.push("/property-owner-dashboard/tenants");
  };

  if (!userId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <Sidebar />
        <div className="sm:ml-64 mt-16">
          <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(9)].map((_, i) => (
                  <div key={i}>
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <Sidebar />
        <div className="sm:ml-64 mt-16">
          <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-2 animate-pulse">
              <svg className="h-5 w-5 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error || "Tenant not found."}
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-700 hover:text-red-900"
                aria-label="Dismiss error"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-200">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <User className="text-indigo-600 h-6 w-6" />
              Tenant Details: {tenant.name}
            </h1>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200"
              aria-label="Back to tenants list"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Tenants
            </button>
          </div>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-2 mb-6 animate-pulse">
              <svg className="h-5 w-5 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-700 hover:text-red-900"
                aria-label="Dismiss error"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 rounded-lg shadow-md flex items-center gap-2 mb-6 animate-pulse">
              <svg className="h-5 w-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {successMessage}
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-green-700 hover:text-green-900"
                aria-label="Dismiss success message"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 md:p-8 transform transition-all duration-300 hover:shadow-xl">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white p-4 rounded-t-xl mb-6">
              <h2 className="text-xl font-semibold">Tenant Information</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Full Name</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Email</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.email}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Phone</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.phone}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Property</h3>
                <p className="text-lg text-gray-900 font-medium">{isPropertyLoading ? "Loading..." : property?.name || "N/A"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Unit Type</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.unitType}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Price (Ksh/month)</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.price.toFixed(2)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Deposit (Ksh)</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.deposit.toFixed(2)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">House Number</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.houseNumber}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Lease Start</h3>
                <p className="text-lg text-gray-900 font-medium">
                  {tenant.leaseStartDate ? new Date(tenant.leaseStartDate).toLocaleDateString() : "N/A"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Lease End</h3>
                <p className="text-lg text-gray-900 font-medium">
                  {tenant.leaseEndDate ? new Date(tenant.leaseEndDate).toLocaleDateString() : "N/A"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Status</h3>
                <p className={`text-lg font-medium capitalize ${tenant.status === "active" ? "text-green-600" : "text-red-600"}`}>
                  {tenant.status}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Payment Status</h3>
                <p className={`text-lg font-medium capitalize ${tenant.paymentStatus === "overdue" ? "text-red-600" : "text-green-600"}`}>
                  {tenant.paymentStatus}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Wallet Balance (Ksh)</h3>
                <p className="text-lg text-gray-900 font-medium">{tenant.walletBalance.toFixed(2)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Created At</h3>
                <p className="text-lg text-gray-900 font-medium">
                  {new Date(tenant.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Updated At</h3>
                <p className="text-lg text-gray-900 font-medium">
                  {tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : "N/A"}
                </p>
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-4 flex-wrap">
              <button
                onClick={handleEdit}
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all duration-200
                  ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                aria-label={`Edit tenant ${tenant.name}`}
              >
                <Edit className="h-5 w-5" />
                Edit Tenant
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all duration-200
                  ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"}`}
                aria-label={`Delete tenant ${tenant.name}`}
              >
                <Trash2 className="h-5 w-5" />
                Delete Tenant
              </button>
              <button
                onClick={handleImpersonate}
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all duration-200
                  ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600"}`}
                aria-label={`Impersonate tenant ${tenant.name}`}
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                <LogIn className="h-5 w-5" />
                Impersonate Tenant
              </button>
            </div>
          </div>
          {showEditModal && editTenant && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Edit Tenant</h2>
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      value={editTenant.name || ""}
                      onChange={(e) => setEditTenant({ ...editTenant, name: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={editTenant.email || ""}
                      onChange={(e) => setEditTenant({ ...editTenant, email: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={editTenant.phone || ""}
                      onChange={(e) => setEditTenant({ ...editTenant, phone: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">House Number</label>
                    <input
                      type="text"
                      value={editTenant.houseNumber || ""}
                      onChange={(e) => setEditTenant({ ...editTenant, houseNumber: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Lease Start Date</label>
                    <input
                      type="date"
                      value={editTenant.leaseStartDate ? new Date(editTenant.leaseStartDate).toISOString().split("T")[0] : ""}
                      onChange={(e) => setEditTenant({ ...editTenant, leaseStartDate: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Lease End Date</label>
                    <input
                      type="date"
                      value={editTenant.leaseEndDate ? new Date(editTenant.leaseEndDate).toISOString().split("T")[0] : ""}
                      onChange={(e) => setEditTenant({ ...editTenant, leaseEndDate: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditTenant(null);
                        setError(null);
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className={`px-4 py-2 rounded-md text-white flex items-center gap-2 ${
                        isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
                      }`}
                    >
                      {isLoading && (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                      )}
                      {isLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .animate-pulse {
          animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}