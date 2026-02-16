// src/app/property-owner-dashboard/list-properties/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Plus, CheckCircle, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PropertyCard from "./PropertyCard";
import PropertyTableRow from "./PropertyTableRow";
import PropertyModal from "./PropertyModal";
import ListingFormModal from "./ListingFormModal";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

import { Property, Listing } from "@/types/property";  // ← Updated imports

interface SortConfig {
  key: "name" | "address" | "createdAt" | "status";
  direction: "asc" | "desc";
}

export default function ListPropertiesPage() {
  const router = useRouter();

  const [listings, setListings] = useState<Listing[]>([]); // ← Renamed for clarity: these are advertised listings
  const [originalProperties, setOriginalProperties] = useState<Property[]>([]);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"list" | "edit">("list");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Listing | null>(null); // ← Now Listing

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "createdAt",
    direction: "desc",
  });

  // Auth + effective owner logic
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    let ownerIdToUse: string | null = null;

    if (userRole === "propertyOwner") {
      ownerIdToUse = uid || null;
    } else if (userRole === "teamMember") {
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      setError("Please log in as a property owner or team member.");
      router.push("/login");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      router.push("/login");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router]);

  // CSRF token
  useEffect(() => {
    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            token = data.csrfToken;
          }
        } catch {}
      }
      setCsrfToken(token || null);
    };
    fetchCsrf();
  }, []);

  const fetchListings = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/list-properties?userId=${effectiveOwnerId}`, {
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken || "" },
      });
      const data = await res.json();
      if (data.success) {
        setListings(data.properties || []);
      } else {
        setError(data.message || "Failed to load listings");
      }
    } catch {
      setError("Failed to load listings.");
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOwnerId, csrfToken]);

  const fetchOriginalProperties = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${effectiveOwnerId}`, {
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken || "" },
      });
      const data = await res.json();
      if (data.success) {
        setOriginalProperties(data.properties || []);
      }
    } catch (err) {
      console.error("Failed to load original properties", err);
    }
  }, [effectiveOwnerId, csrfToken]);

  useEffect(() => {
    if (effectiveOwnerId && csrfToken) {
      fetchListings();
      fetchOriginalProperties();
    }
  }, [effectiveOwnerId, csrfToken, fetchListings, fetchOriginalProperties]);

  const sortedListings = useMemo(() => {
    const sorted = [...listings];
    sorted.sort((a, b) => {
      const {key} = sortConfig;
      const dir = sortConfig.direction === "asc" ? 1 : -1;
      if (key === "createdAt") {
        return dir * (new Date(a[key]!).getTime() - new Date(b[key]!).getTime());
      }
      return dir * (a[key] as string).localeCompare(b[key] as string);
    });
    return sorted;
  }, [listings, sortConfig]);

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((c) => ({
      key,
      direction: c.key === key && c.direction === "asc" ? "desc" : "asc",
    }));
  };

  const openListModal = () => {
    setModalMode("list");
    setIsFormModalOpen(true);
  };

  const openEditModal = (property: Listing) => { // ← Now Listing
    setModalMode("edit");
    setEditingPropertyId(property._id);
    setIsFormModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 py-10 lg:px-12">
          <motion.div
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <Home className="text-[#012a4a]" />
              Property Listings
            </h1>
            <button
              onClick={openListModal}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white rounded-xl shadow-md hover:shadow-lg transition-all font-medium"
            >
              <Plus className="h-5 w-5" />
              List Property
            </button>
          </motion.div>

          {error && (
            <motion.div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 shadow-sm">
              {error}
            </motion.div>
          )}
          {successMessage && (
            <motion.div className="bg-green-50 text-green-700 p-4 rounded-xl mb-6 shadow-sm flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {successMessage}
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#012a4a]"></div>
            </div>
          ) : sortedListings.length === 0 ? (
            <motion.div className="text-center py-20 text-slate-500">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">No listings yet. Start by listing a property!</p>
            </motion.div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block bg-white rounded-2xl shadow-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <tr>
                      {(["name", "address", "status", "createdAt"] as const).map((k) => (
                        <th
                          key={k}
                          className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition"
                          onClick={() => handleSort(k)}
                        >
                          {k === "name" ? "Property" : k === "address" ? "Location" : k === "status" ? "Status" : "Listed On"}
                        </th>
                      ))}
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">
                        Available Units
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedListings.map((p) => (
                      <PropertyTableRow
                        key={p._id}
                        property={p}
                        onView={() => setSelectedProperty(p)}
                        onEdit={() => openEditModal(p)}
                        onDelete={() => handleDelete(p._id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4">
                {sortedListings.map((p) => (
                  <PropertyCard
                    key={p._id}
                    property={p}
                    onView={() => setSelectedProperty(p)}
                    onEdit={() => openEditModal(p)}
                    onDelete={() => handleDelete(p._id)}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <ListingFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setModalMode("list");
          setEditingPropertyId(null);
        }}
        mode={modalMode}
        editingPropertyId={editingPropertyId}
        csrfToken={csrfToken}
        onSuccess={() => {
          setSuccessMessage(modalMode === "list" ? "Property listed!" : "Listing updated!");
          fetchListings();
          fetchOriginalProperties(); // optional: refresh both
        }}
        originalProperties={originalProperties}
        existingListings={listings} // ← NEW: For filtering
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={async () => {
          if (!propertyToDelete || !csrfToken) return;
          try {
            const res = await fetch(`/api/list-properties?id=${propertyToDelete}`, {
              method: "DELETE",
              headers: { "X-CSRF-Token": csrfToken || "" },
              credentials: "include",
            });
            const data = await res.json();
            if (data.success) {
              setSuccessMessage("Listing removed successfully.");
              fetchListings();
            }
          } catch {
            setError("Failed to delete.");
          } finally {
            setIsDeleteModalOpen(false);
            setPropertyToDelete(null);
          }
        }}
      />

      {selectedProperty && (
        <PropertyModal property={selectedProperty} onClose={() => setSelectedProperty(null)} />
      )}
    </div>
  );
}