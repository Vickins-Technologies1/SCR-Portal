
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Building2, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface User {
  _id: string;
  email: string;
  role: "tenant" | "propertyOwner" | "admin"; // Added role
}

interface Property {
  _id: string;
  name: string;
  ownerId: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: string; managementFee: number }[];
}

interface SortConfig {
  key: keyof Property | "ownerEmail";
  direction: "asc" | "desc";
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<User[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "admin") {
      setError("Unauthorized. Please log in as an admin.");
      router.push("/admin/login");
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [propertiesRes, usersRes] = await Promise.all([
        fetch("/api/admin/properties", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
        fetch("/api/admin/users", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }),
      ]);
      const [propertiesData, usersData] = await Promise.all([propertiesRes.json(), usersRes.json()]);
      if (propertiesData.success && usersData.success) {
        setProperties(propertiesData.properties || []);
        setPropertyOwners(usersData.users.filter((u: User) => u.role === "propertyOwner") || []);
      } else {
        setError("Failed to fetch data.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId && role === "admin") {
      fetchData();
    }
  }, [userId, role, fetchData]);

  const handleSort = useCallback((key: keyof Property | "ownerEmail") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sorted = [...properties].sort((a, b) => {
        if (key === "ownerEmail") {
          const aEmail = propertyOwners.find((u) => u._id === a.ownerId)?.email || "";
          const bEmail = propertyOwners.find((u) => u._id === b.ownerId)?.email || "";
          return direction === "asc" ? aEmail.localeCompare(bEmail) : bEmail.localeCompare(aEmail);
        }
        return direction === "asc"
          ? String(a[key] ?? "").localeCompare(String(b[key] ?? ""))
          : String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
      });
      setProperties(sorted);
      return { key, direction };
    });
  }, [properties, propertyOwners]);

  const getSortIcon = useCallback((key: keyof Property | "ownerEmail") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800 mb-6 animate-fade-in-down">
            <Building2 className="text-[#012a4a] h-6 w-6" />
            Properties
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
              {properties.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
                  No properties found.
                </div>
              ) : (
                properties.map((p, index) => (
                  <div
                    key={p._id}
                    className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transform transition-all duration-300 hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="text-[#012a4a] h-5 w-5" />
                      <h3 className="text-lg font-semibold text-[#012a4a] cursor-pointer" onClick={() => handleSort("name")}>
                        {p.name} {getSortIcon("name")}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-1 cursor-pointer" onClick={() => handleSort("ownerEmail")}>
                      <span className="font-medium">Owner:</span>{" "}
                      {propertyOwners.find((u) => u._id === p.ownerId)?.email || "N/A"} {getSortIcon("ownerEmail")}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Units:</span>
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {p.unitTypes.map((u) => (
                        <li key={u.type}>
                          {u.type} (Price: Ksh {u.price.toFixed(2)}, Fee: Ksh {u.managementFee.toFixed(2)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
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