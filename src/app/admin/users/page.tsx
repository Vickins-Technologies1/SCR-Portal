"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Users, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface PropertyOwner {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  createdAt: string;
  properties: { _id: string; name: string; address: string; unitTypes: { type: string; quantity: number; price: number; deposit: number; managementType: string; managementFee: number | string }[]; status: string; createdAt: string; updatedAt: string }[];
  payments: { _id: string; userId: string; propertyId: string; unitType: string; amount: number; createdAt: string }[];
  invoices: { _id: string; paymentId: string; userId: string; propertyId: string; unitType: string; amount: number; status: string; createdAt: string; dueDate: string }[];
}

interface SortConfig {
  key: keyof PropertyOwner;
  direction: "asc" | "desc";
}

export default function UsersPage() {
  const router = useRouter();
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "admin") {
      setError("Unauthorized. Please log in as an admin.");
      router.push("/login");
    }
  }, [router]);

  const fetchPropertyOwners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/property-owners", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPropertyOwners(data.propertyOwners || []);
      } else {
        setError(data.message || "Failed to fetch property owners.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") {
      fetchPropertyOwners();
    }
  }, [userId, role, fetchPropertyOwners]);

  const handleSort = useCallback((key: keyof PropertyOwner) => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...propertyOwners].sort((a, b) => {
        const valueA = a[key] ?? "";
        const valueB = b[key] ?? "";
        return direction === "asc"
          ? String(valueA).localeCompare(String(valueB))
          : String(valueB).localeCompare(String(valueA));
      });
      setPropertyOwners(sorted);
      return { key, direction };
    });
  }, [propertyOwners]);

  const getSortIcon = useCallback((key: keyof PropertyOwner) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? <span className="inline ml-1">↑</span> : <span className="inline ml-1">↓</span>;
  }, [sortConfig]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <Users className="text-[#012a4a] h-6 w-6" />
            Property Owners
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {propertyOwners.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                  No property owners found.
                </div>
              ) : (
                propertyOwners.map((owner, index) => (
                  <div
                    key={owner._id}
                    className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transform transition-all duration-300 hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="text-[#012a4a] h-5 w-5" />
                        <h3
                          className="text-lg font-semibold text-[#012a4a] cursor-pointer"
                          onClick={() => handleSort("name")}
                        >
                          {owner.name} {getSortIcon("name")}
                        </h3>
                      </div>
                      <button onClick={() => toggleExpand(owner._id)}>
                        {expanded.includes(owner._id) ? (
                          <ChevronUp className="h-5 w-5 text-[#012a4a]" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-[#012a4a]" />
                        )}
                      </button>
                    </div>
                    <p
                      className="text-sm text-gray-600 mb-1 cursor-pointer"
                      onClick={() => handleSort("email")}
                    >
                      <span className="font-medium">Email:</span> {owner.email} {getSortIcon("email")}
                    </p>
                    <p
                      className="text-sm text-gray-600 mb-1 cursor-pointer"
                      onClick={() => handleSort("phone")}
                    >
                      <span className="font-medium">Phone:</span> {owner.phone} {getSortIcon("phone")}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Created:</span>{" "}
                      {new Date(owner.createdAt).toLocaleDateString()}
                    </p>
                    {expanded.includes(owner._id) && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-gray-800">Properties</h4>
                        {owner.properties.length === 0 ? (
                          <p className="text-sm text-gray-600">No properties</p>
                        ) : (
                          <ul className="list-disc pl-5 text-sm text-gray-600">
                            {owner.properties.map((p) => (
                              <li key={p._id}>
                                {p.name} ({p.address}, {p.status})
                              </li>
                            ))}
                          </ul>
                        )}
                        <h4 className="text-sm font-semibold text-gray-800 mt-2">Payments</h4>
                        {owner.payments.length === 0 ? (
                          <p className="text-sm text-gray-600">No payments</p>
                        ) : (
                          <ul className="list-disc pl-5 text-sm text-gray-600">
                            {owner.payments.map((p) => (
                              <li key={p._id}>
                                Ksh {p.amount} for {p.unitType} (
                                {new Date(p.createdAt).toLocaleDateString()})
                              </li>
                            ))}
                          </ul>
                        )}
                        <h4 className="text-sm font-semibold text-gray-800 mt-2">Invoices</h4>
                        {owner.invoices.length === 0 ? (
                          <p className="text-sm text-gray-600">No invoices</p>
                        ) : (
                          <ul className="list-disc pl-5 text-sm text-gray-600">
                            {owner.invoices.map((i) => (
                              <li key={i._id}>
                                Ksh {i.amount} ({i.status}, Due:{" "}
                                {new Date(i.dueDate).toLocaleDateString()})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
        body {
          font-family: "Inter", sans-serif;
        }
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.5s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}