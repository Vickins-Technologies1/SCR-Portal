// src/app/property-owner-dashboard/tenants/[tenantId]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { User, LogIn } from "lucide-react";
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
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
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
        setTenant(data.tenant);
        if (data.tenant?.propertyId) {
          fetchProperty(data.tenant.propertyId);
        }
      } else {
        setError(data.message || "Failed to fetch tenant details.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProperty = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperty(data.property);
      }
    } catch {
      setError("Failed to fetch property details.");
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
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
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
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow">
              {error || "Tenant not found."}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <User className="text-[#1e3a8a]" />
            Tenant Details: {tenant.name}
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-lg shadow-md p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-600">Full Name</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Email</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.email}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Phone</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.phone}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Property</h3>
                <p className="text-base md:text-lg text-gray-800">{property?.name || "N/A"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Unit Type</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.unitType}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Price (Ksh/month)</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.price.toFixed(2)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Deposit (Ksh)</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.deposit.toFixed(2)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">House Number</h3>
                <p className="text-base md:text-lg text-gray-800">{tenant.houseNumber}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Status</h3>
                <p className={`text-base md:text-lg capitalize ${tenant.status === "active" ? "text-green-600" : "text-red-600"}`}>
                  {tenant.status}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Payment Status</h3>
                <p className={`text-base md:text-lg capitalize ${tenant.paymentStatus === "overdue" ? "text-red-600" : "text-green-600"}`}>
                  {tenant.paymentStatus}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Created At</h3>
                <p className="text-base md:text-lg text-gray-800">
                  {new Date(tenant.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">Updated At</h3>
                <p className="text-base md:text-lg text-gray-800">
                  {tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : "N/A"}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleImpersonate}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition
                  ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#1e3a8a] hover:bg-[#1e40af]"}`}
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
        </main>
      </div>
    </div>
  );
}