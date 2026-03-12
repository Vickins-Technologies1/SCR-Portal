"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  DollarSign,
  MapPin,
  Star,
  SlidersHorizontal,
  X,
  ChevronDown,
} from "lucide-react";
import { Listing, AvailabilitySummary } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";

interface FilterState {
  unitType: string;
  minPrice: string;
  maxPrice: string;
  location: string;
  featured: "all" | "featured" | "standard";
}

export default function PropertyListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    unitType: "",
    minPrice: "",
    maxPrice: "",
    location: "",
    featured: "all",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    const fetchListings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/public-properties", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          setListings(data.properties || []);
        } else {
          setError(data.message || "Failed to load listings.");
        }
      } catch {
        setError("Failed to load listings.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchListings();
  }, []);

  const unitTypeOptions = useMemo(() => {
    const types = listings.flatMap((listing) => (listing.unitTypes ?? []).map((unit) => unit.type));
    return Array.from(new Set(types)).sort();
  }, [listings]);

  const filteredListings = useMemo(() => {
    const locationFilter = filters.location.trim().toLowerCase();
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;

    return listings.filter((listing) => {
      const units = listing.unitTypes ?? [];

      if (filters.unitType && !units.some((unit) => unit.type === filters.unitType)) {
        return false;
      }

      if (locationFilter) {
        const addressMatch = listing.address?.toLowerCase().includes(locationFilter);
        const nameMatch = listing.name?.toLowerCase().includes(locationFilter);
        if (!addressMatch && !nameMatch) return false;
      }

      if (filters.featured === "featured" && !listing.isAdvertised) return false;
      if (filters.featured === "standard" && listing.isAdvertised) return false;

      if ((min !== null || max !== null) && units.length) {
        const minListingPrice = Math.min(...units.map((unit) => Number(unit.price) || 0));
        if (min !== null && minListingPrice < min) return false;
        if (max !== null && minListingPrice > max) return false;
      } else if ((min !== null || max !== null) && !units.length) {
        return false;
      }

      return true;
    });
  }, [listings, filters]);

  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      if (a.isAdvertised === b.isAdvertised) {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }
      return a.isAdvertised ? -1 : 1;
    });
  }, [filteredListings]);

  const hasActiveFilters =
    filters.unitType ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.location ||
    filters.featured !== "all";

  const resetFilters = () => {
    setFilters({
      unitType: "",
      minPrice: "",
      maxPrice: "",
      location: "",
      featured: "all",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Sleek sticky navbar with bigger logo */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-lg shadow-sm transition-all duration-300">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 sm:h-18 items-center justify-between">
            {/* Brand with larger logo */}
            <Link
              href="https://www.soranapropertymanagers.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 sm:gap-4 text-slate-900 hover:text-cyan-700 transition-colors"
            >
              {/* Bigger logo */}
              <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 rounded-full overflow-hidden shadow-md">
                <Image
                  src="/logo.png" // ← Replace with your actual logo path (recommended: place in /public/)
                  // Alternative fallback: "https://via.placeholder.com/120/0ea5e9/ffffff?text=Sorana" 
                  alt="Sorana Property Managers Logo"
                  fill
                  className="object-contain p-1 bg-white"
                  priority
                />
              </div>

              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-xl sm:text-2xl">Sorana</span>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-medium -mt-1">
                  Property Managers
                </span>
              </div>
            </Link>

            {/* Right side actions */}
            <div className="flex items-center gap-3 sm:gap-5">
              <Link
                href="https://www.soranapropertymanagers.com/contact-us"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-cyan-400 hover:text-cyan-700 transition-all duration-200"
              >
                Contact us
              </Link>

              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-cyan-400 hover:text-cyan-700 transition-all duration-200 lg:px-5"
                aria-expanded={isFilterOpen}
                aria-controls="filter-panel"
              >
                {isFilterOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
                <span className="hidden xs:inline">
                  {isFilterOpen ? "Close" : "Filters"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Collapsible Filters */}
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            id="filter-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="border-b border-slate-200 bg-white overflow-hidden"
          >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-3">
                  <SlidersHorizontal size={22} className="text-cyan-600" />
                  Refine Your Search
                </h2>

                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      resetFilters();
                      setIsFilterOpen(false);
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
                  >
                    <X size={16} />
                    Clear all filters
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                {/* Location */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Westlands, Kilimani..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all shadow-sm hover:border-slate-300"
                  />
                </div>

                {/* Unit Type */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Unit Type
                  </label>
                  <select
                    value={filters.unitType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, unitType: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all shadow-sm hover:border-slate-300"
                  >
                    <option value="">All types</option>
                    {unitTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Min Price */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Min Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all shadow-sm hover:border-slate-300"
                  />
                </div>

                {/* Max Price */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Max Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                    placeholder="50000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all shadow-sm hover:border-slate-300"
                  />
                </div>

                {/* Featured */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                    Featured
                  </label>
                  <select
                    value={filters.featured}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        featured: e.target.value as FilterState["featured"],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none transition-all shadow-sm hover:border-slate-300"
                  >
                    <option value="all">All listings</option>
                    <option value="featured">Featured only</option>
                    <option value="standard">Standard only</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        {error && (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-red-800 shadow-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          </div>
        ) : sortedListings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 sm:px-10 py-16 sm:py-20 text-center shadow-sm">
            <Building2 className="mx-auto mb-6 h-16 w-16 sm:h-20 sm:w-20 text-slate-300" />
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800 mb-4">
              {hasActiveFilters ? "No matching properties found" : "No listings available yet"}
            </h3>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto">
              {hasActiveFilters
                ? "Try adjusting your filters or clear them to see all available properties."
                : "We're constantly adding new verified listings. Please check back soon!"}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setIsFilterOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-6 py-3 text-white font-medium shadow-md hover:bg-cyan-700 transition-all"
              >
                <X size={18} />
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedListings.map((property, index) => (
              <PropertyCard key={property._id} property={property} index={index} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// PropertyCard (unchanged – included for completeness)
// ──────────────────────────────────────────────

interface PropertyCardProps {
  property: Listing;
  index: number;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, index }) => {
  const availability: AvailabilitySummary = ensureAvailability(property);
  const propertyUnits = property.unitTypes ?? [];
  const minPrice = propertyUnits.length ? Math.min(...propertyUnits.map((unit) => Number(unit.price) || 0)) : 0;
  const priceLabel = minPrice ? minPrice.toLocaleString() : "";
  const vacancyCount = availability.totalVacant;
  const vacancyBadge = `${vacancyCount} vacant unit${vacancyCount === 1 ? "" : "s"}`;

  const statusTone =
    property.status === "Active"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : property.status === "Inactive"
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-slate-300 bg-slate-100 text-slate-600";

  const images = property.images?.length ? property.images : ["/logo.png"];
  const heroImage = images[0];
  const sideImageOne = images[1] || images[0];
  const sideImageTwo = images[2] || images[0];

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 hover:shadow-xl hover:shadow-slate-300/50 transition-all duration-300"
    >
      <div className="relative h-48 grid grid-cols-6 grid-rows-2 gap-2 p-4">
        <div className="relative col-span-4 row-span-2 overflow-hidden rounded-2xl">
          <Image
            src={heroImage}
            alt={property.name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
          {property.isAdvertised && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-cyan-600/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
              <Star size={12} fill="white" />
              Featured
            </span>
          )}
        </div>
        <div className="relative col-span-2 row-span-1 overflow-hidden rounded-2xl">
          <Image src={sideImageOne} alt="" fill className="object-cover" />
        </div>
        <div className="relative col-span-2 row-span-1 overflow-hidden rounded-2xl">
          <Image src={sideImageTwo} alt="" fill className="object-cover" />
        </div>
      </div>

      <div className="space-y-4 px-6 pb-6 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900 line-clamp-2">{property.name}</h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin size={15} className="flex-shrink-0" />
              <span className="line-clamp-1">{property.address}</span>
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusTone}`}
          >
            {property.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700">
          <div className="flex items-center gap-1.5">
            <DollarSign size={16} className="text-cyan-600" />
            {minPrice ? (
              <span className="font-medium">Ksh {priceLabel}/mo</span>
            ) : (
              <span>Pricing on request</span>
            )}
          </div>
          <span className="text-slate-500 font-medium">{vacancyBadge}</span>
        </div>

        <Link
          href={`/property-listings/${property._id}`}
          className="mt-3 block w-full rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3.5 text-center text-sm font-semibold uppercase tracking-wider text-white shadow-md hover:from-cyan-700 hover:to-cyan-600 hover:shadow-lg transition-all duration-300"
        >
          View Details
        </Link>
      </div>
    </motion.article>
  );
}