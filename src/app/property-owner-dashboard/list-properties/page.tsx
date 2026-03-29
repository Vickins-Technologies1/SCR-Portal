// src/app/property-owner-dashboard/list-properties/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { Home, Plus, CheckCircle, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PropertyCard from "./PropertyCard";
import PropertyTableRow from "./PropertyTableRow";
import PropertyModal from "./PropertyModal";
import ListingFormModal from "./ListingFormModal";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

import { Property, Listing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";  // ← Updated imports

interface SortConfig {
  key: "name" | "address" | "createdAt" | "status";
  direction: "asc" | "desc";
}

export default function ListPropertiesPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewProperties = perm.hasPermission("properties:view");
  const canListProperties = perm.hasPermission("properties:list_new");
  const canEditProperties = perm.hasPermission("properties:edit");

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
  const [isHydrated, setIsHydrated] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "createdAt",
    direction: "desc",
  });

  const showListButton = isHydrated && canListProperties;
  const canManageActions = isHydrated && canEditProperties;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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

    if (userRole === "teamMember" && !canViewProperties) {
      setError("Access restricted. You do not have permission to view property listings.");
      router.replace("/property-owner-dashboard");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      router.push("/login");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router, canViewProperties]);

  // CSRF token
  useEffect(() => {
    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/" });
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
  const listingStats = useMemo(() => {
    const totals = listings.reduce(
      (acc, listing) => {
        const availability = ensureAvailability(listing);
        acc.totalUnits += availability.totalUnits;
        acc.totalVacant += availability.totalVacant;
        return acc;
      },
      { totalUnits: 0, totalVacant: 0 }
    );
    return {
      activeCount: listings.filter((listing) => listing.status === "Active").length,
      totalUnits: totals.totalUnits,
      totalVacant: totals.totalVacant,
      occupancyRate: totals.totalUnits
        ? Math.round(((totals.totalUnits - totals.totalVacant) / totals.totalUnits) * 100)
        : 0,
    };
  }, [listings]);
  const listingStatCards = [
    { label: "Active listings", value: listingStats.activeCount, detail: `${listings.length} total` },
    { label: "Total units", value: listingStats.totalUnits, detail: "Across all listings" },
    { label: "Vacant units", value: listingStats.totalVacant, detail: "Live vacancies" },
    { label: "Occupancy", value: `${listingStats.occupancyRate}%`, detail: "Based on reported units" },
  ];


  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((c) => ({
      key,
      direction: c.key === key && c.direction === "asc" ? "desc" : "asc",
    }));
  };

  const openListModal = () => {
    if (!canListProperties) {
      setError("You do not have permission to list new properties.");
      return;
    }
    setModalMode("list");
    setIsFormModalOpen(true);
  };

  const openEditModal = (property: Listing) => { // ← Now Listing
    if (!canEditProperties) {
      setError("You do not have permission to edit listings.");
      return;
    }
    setModalMode("edit");
    setEditingPropertyId(property._id);
    setIsFormModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!canEditProperties) {
      setError("You do not have permission to delete listings.");
      return;
    }
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Property Listings</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Publish listings and track availability across your portfolio.
                  </p>
                </div>
              </div>
              {showListButton && (
                <button
                  onClick={openListModal}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-emerald-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-xs sm:text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  List Property
                </button>
              )}
            </div>
          </motion.section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {listingStatCards.map((stat) => (
              <div key={stat.label} className="surface-card rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{stat.label}</p>
                <p className="text-lg sm:text-xl font-semibold text-foreground mt-2">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.detail}</p>
              </div>
            ))}
          </div>

          {error && (
            <motion.div className="bg-red-50 text-red-700 p-3 rounded-2xl shadow-sm text-xs sm:text-sm">
              {error}
            </motion.div>
          )}
          {successMessage && (
            <motion.div className="bg-primary/10 text-primary p-3 rounded-2xl shadow-sm flex items-center gap-2 text-xs sm:text-sm">
              <CheckCircle className="h-4 w-4" />
              {successMessage}
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
            </div>
          ) : sortedListings.length === 0 ? (
            <motion.div className="text-center py-20 surface-card rounded-2xl text-muted-foreground">
              <Building2 className="h-14 w-14 mx-auto mb-4 text-slate-300" />
              <p className="text-base sm:text-lg font-semibold">No listings yet. Start by listing a property!</p>
            </motion.div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block table-shell">
                <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      {(["name", "address", "status", "createdAt"] as const).map((k) => (
                        <th
                          key={k}
                          className="cursor-pointer hover:bg-gray-100/70 transition"
                          onClick={() => handleSort(k)}
                        >
                          {k === "name" ? "Property" : k === "address" ? "Location" : k === "status" ? "Status" : "Listed On"}
                        </th>
                      ))}
                      <th>Available Units</th>
                      <th>Actions</th>
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
                        canManage={canManageActions}
                      />
                    ))}
                  </tbody>
                </table>
                </div>
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
                        canManage={canManageActions}
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

















