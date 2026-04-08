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
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
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
                <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold">
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
                      {listing.amenities.slice(0, 3).map((amenity) => (
                        <span
                          key={amenity}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Last sync {new Date(listing.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
                    <button className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                      Edit listing
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
