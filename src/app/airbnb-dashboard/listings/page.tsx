"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Home,
  UploadCloud,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbListing } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbListingsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("properties:view");
  const [listings, setListings] = useState<AirbnbListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    location: "",
    status: "draft",
    units: 1,
    baseRate: 0,
    weekendRate: 0,
    amenities: "",
    houseRules: "",
    licenseStatus: "missing",
  });

  const fetchListings = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/listings?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setListings(data.listings || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchListings();
    }
  }, [hasAccess, fetchListings]);

  const handleSync = async (listingId?: string) => {
    if (!csrfToken) {
      setSyncMessage("Missing session token. Refresh the page and try again.");
      return;
    }
    setSyncingId(listingId || "all");
    setSyncMessage(null);
    try {
      const res = await fetch("/api/airbnb/sync", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Sync failed");
      }
      setSyncMessage(data.message || "Sync completed.");
      await fetchListings();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const openCreateModal = () => {
    setForm({
      id: "",
      name: "",
      location: "",
      status: "draft",
      units: 1,
      baseRate: 0,
      weekendRate: 0,
      amenities: "",
      houseRules: "",
      licenseStatus: "missing",
    });
    setFormMessage(null);
    setShowModal(true);
  };

  const openEditModal = (listing: AirbnbListing) => {
    setForm({
      id: listing.id,
      name: listing.name,
      location: listing.location,
      status: listing.status,
      units: listing.units,
      baseRate: listing.baseRate,
      weekendRate: listing.weekendRate,
      amenities: listing.amenities.join(", "),
      houseRules: listing.houseRules.join(", "),
      licenseStatus: listing.licenseStatus,
    });
    setFormMessage(null);
    setShowModal(true);
  };

  const handleSaveListing = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh the page and try again.");
      return;
    }

    if (!form.name.trim() || !form.location.trim()) {
      setFormMessage("Listing name and location are required.");
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const payload = {
        id: form.id || undefined,
        name: form.name.trim(),
        location: form.location.trim(),
        status: form.status,
        units: Number(form.units || 1),
        baseRate: Number(form.baseRate || 0),
        weekendRate: Number(form.weekendRate || 0),
        amenities: form.amenities
          ? form.amenities.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        houseRules: form.houseRules
          ? form.houseRules.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        licenseStatus: form.licenseStatus,
      };

      const res = await fetch("/api/airbnb/listings", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save listing");
      }

      setFormMessage("Listing saved successfully.");
      setShowModal(false);
      await fetchListings();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to save listing");
    } finally {
      setIsSaving(false);
    }
  };

  if (hasAccess === false) {
    return (
      <div className="min-h-[100svh] bg-background text-foreground">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="surface-card rounded-3xl p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-foreground">Access restricted</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your account does not have permission to view listings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Listings Management"
            subtitle="Publish, optimize, and sync Airbnb-ready listings with Kenya compliance built-in."
            icon={Home}
            actions={
              <>
                <button
                  onClick={() => handleSync()}
                  disabled={syncingId !== null}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all text-xs sm:text-sm font-semibold disabled:opacity-60"
                >
                  {syncingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud size={16} />}
                  Sync all
                </button>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
                >
                  <Sparkles size={16} />
                  Add listing
                </button>
              </>
            }
          />

          {syncMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {syncMessage}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded-lg w-36 mb-4" />
                  <div className="h-8 bg-gray-300 rounded-xl w-2/3" />
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="surface-card rounded-3xl p-6 text-xs text-muted-foreground">
              No listings yet. Add a listing to start syncing with Airbnb.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {listings.map((listing) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="surface-card rounded-3xl p-6 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground line-clamp-1">
                        {listing.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{listing.location}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        listing.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : listing.status === "paused"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {listing.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl bg-primary/10 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Base rate</p>
                      <p className="font-semibold text-foreground">{formatKes(listing.baseRate)}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Weekend</p>
                      <p className="font-semibold text-foreground">{formatKes(listing.weekendRate)}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Occupancy</p>
                      <p className="font-semibold text-foreground">{listing.occupancyRate}%</p>
                    </div>
                    <div className="rounded-2xl bg-purple-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rating</p>
                      <p className="font-semibold text-foreground">{listing.rating} ★</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Amenities
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {listing.amenities.length === 0 ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                          No amenities set
                        </span>
                      ) : (
                        listing.amenities.slice(0, 3).map((amenity) => (
                          <span
                            key={amenity}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"
                          >
                            {amenity}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {listing.lastSyncedAt
                        ? `Last sync ${new Date(listing.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : "Not synced yet"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        listing.licenseStatus === "valid"
                          ? "bg-emerald-100 text-emerald-700"
                          : listing.licenseStatus === "due"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {listing.licenseStatus} license
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => handleSync(listing.id)}
                      disabled={syncingId !== null}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {syncingId === listing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud size={14} />}
                      Sync
                    </button>
                    <button
                      onClick={() => openEditModal(listing)}
                      className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
                    >
                      Edit listing
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-2xl overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {form.id ? "Edit listing" : "Add listing"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Update Airbnb-ready details and pricing.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="modal-close rounded-full p-1"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-4">
                  {formMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {formMessage}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Listing name</label>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Location</label>
                      <input
                        value={form.location}
                        onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
                      <select
                        value={form.status}
                        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Units</label>
                      <input
                        type="number"
                        min={1}
                        value={form.units}
                        onChange={(event) => setForm((prev) => ({ ...prev, units: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Base rate (KES)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.baseRate}
                        onChange={(event) => setForm((prev) => ({ ...prev, baseRate: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Weekend rate (KES)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.weekendRate}
                        onChange={(event) => setForm((prev) => ({ ...prev, weekendRate: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Amenities (comma separated)
                      </label>
                      <input
                        value={form.amenities}
                        onChange={(event) => setForm((prev) => ({ ...prev, amenities: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        House rules (comma separated)
                      </label>
                      <input
                        value={form.houseRules}
                        onChange={(event) => setForm((prev) => ({ ...prev, houseRules: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">License status</label>
                      <select
                        value={form.licenseStatus}
                        onChange={(event) => setForm((prev) => ({ ...prev, licenseStatus: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      >
                        <option value="valid">Valid</option>
                        <option value="due">Due</option>
                        <option value="missing">Missing</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveListing}
                      disabled={isSaving}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Save listing"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
