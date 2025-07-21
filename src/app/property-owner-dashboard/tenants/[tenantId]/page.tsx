"use client";

import React, { useState, useEffect } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { User, LogIn, ArrowLeft } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isPropertyLoading, setIsPropertyLoading] = useState(false);

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

  useEffect(() => {
    if (!userId || !tenantId || role !== "propertyOwner") return;

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
        if (data.success) {
          if (!data.tenant.walletBalance && data.tenant.walletBalance !== 0) {
            console.warn("Wallet balance missing for tenant:", tenantId);
            setError("Wallet balance data is unavailable.");
            setTenant({ ...data.tenant, walletBalance: 0 });
          } else {
            setTenant(data.tenant);
          }
          if (data.tenant?.propertyId) {
            fetchProperty(data.tenant.propertyId);
          }
        } else {
          setError(data.message || "Failed to fetch tenant details.");
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
        }
      } catch (error) {
        console.error("Error fetching property:", error);
        setError("Failed to fetch property details. Please try again later.");
      } finally {
        setIsPropertyLoading(false);
      }
    };

    fetchTenant();
  }, [userId, tenantId, role]);

  const handleImpersonate = async () => {
    if (!tenant) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenant._id, userId }),
      });
      const data = await res.json();
      if (data.success) {
        Cookies.set("userId", tenant._id, { path: "/", expires: 1 });
        Cookies.set("role", "tenant", { path: "/", expires: 1 });
        router.push("/tenant-dashboard");
      } else {
        setError(data.message || "Failed to impersonate tenant.");
      }
    } catch (error) {
      console.error("Error impersonating tenant:", error);
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
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1e3a8a]"></div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1e3a8a]"></div>
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
              <User className="text-[#1e3a8a] h-6 w-6" />
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 md:p-8 transform transition-all duration-300 hover:shadow-xl">
            <div className="bg-gradient-to-r from-[#1e3a8a] to-[#3b82f6] text-white p-4 rounded-t-xl mb-6">
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
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleImpersonate}
                disabled={isLoading}
                className={`group relative flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all duration-200
                  ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-[#1e3a8a] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#60a5fa]"}`}
                aria-label={`Impersonate tenant ${tenant.name}`}
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                <LogIn className="h-5 w-5" />
                Impersonate Tenant
                <span className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/20"></span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}