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
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { PublicListing, AirbnbPublicListing, AvailabilitySummary, SalePublicListing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";

interface FilterState {
  listingType: "all" | "rentals" | "airbnb" | "sale";
  unitType: string;
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  location: string;
  featured: "all" | "featured" | "standard";
}

type SortOption = "featured" | "newest" | "price_low" | "price_high" | "rating";

export default function PropertyListings() {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 12;
  const [filters, setFilters] = useState<FilterState>({
    listingType: "all",
    unitType: "",
    propertyType: "",
    minPrice: "",
    maxPrice: "",
    location: "",
    featured: "all",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filters, sortBy]);

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
    const types = listings
      .filter((listing) => listing.listingType === "rentals")
      .flatMap((listing) => (listing.unitTypes ?? []).map((unit) => unit.type));
    return Array.from(new Set(types)).sort();
  }, [listings]);

  const salePropertyTypeOptions = useMemo(() => {
    const types = listings
      .filter((listing) => listing.listingType === "sale")
      .map((listing) => String((listing as SalePublicListing).propertyType || "").trim())
      .filter(Boolean);
    return Array.from(new Set(types)).sort();
  }, [listings]);

  const filteredListings = useMemo(() => {
    const locationFilter = filters.location.trim().toLowerCase();
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;

    return listings.filter((listing) => {
      const isAirbnb = listing.listingType === "airbnb";
      const isSale = listing.listingType === "sale";
      const units = listing.listingType === "rentals" ? listing.unitTypes ?? [] : [];

      if (filters.listingType !== "all" && listing.listingType !== filters.listingType) {
        return false;
      }

      if (filters.unitType && !units.some((unit) => unit.type === filters.unitType)) {
        return false;
      }

      if (filters.propertyType) {
        if (!isSale) return false;
        const saleType = String((listing as SalePublicListing).propertyType || "").trim();
        if (saleType !== filters.propertyType) return false;
      }

      if (locationFilter) {
        const addressMatch = listing.address?.toLowerCase().includes(locationFilter);
        const nameMatch = listing.name?.toLowerCase().includes(locationFilter);
        if (!addressMatch && !nameMatch) return false;
      }

      const isFeatured = isAirbnb
        ? (listing.rating ?? 0) >= 4.6 && (listing.reviewCount ?? 0) >= 8
        : isSale
          ? !!(listing as SalePublicListing).isFeatured
          : !!(listing as any).isAdvertised;

      if (filters.featured === "featured" && !isFeatured) return false;
      if (filters.featured === "standard" && isFeatured) return false;

      if ((min !== null || max !== null) && units.length) {
        const minListingPrice = Math.min(...units.map((unit) => Number(unit.price) || 0));
        if (min !== null && minListingPrice < min) return false;
        if (max !== null && minListingPrice > max) return false;
      } else if ((min !== null || max !== null) && !units.length) {
        if (isAirbnb) {
          const nightlyRate = (listing as AirbnbPublicListing).baseRate || 0;
          if (min !== null && nightlyRate < min) return false;
          if (max !== null && nightlyRate > max) return false;
        } else if (isSale) {
          const salePrice = Number((listing as SalePublicListing).price || 0);
          if (min !== null && salePrice < min) return false;
          if (max !== null && salePrice > max) return false;
        } else {
          return false;
        }
      }

      return true;
    });
  }, [listings, filters]);

  const getFeaturedStatus = (listing: PublicListing) => {
    if (listing.listingType === "airbnb") {
      return (listing.rating ?? 0) >= 4.6 && (listing.reviewCount ?? 0) >= 8;
    }
    if (listing.listingType === "sale") {
      return !!(listing as SalePublicListing).isFeatured;
    }
    return !!(listing as any).isAdvertised;
  };

  const getListingPrice = (listing: PublicListing) => {
    if (listing.listingType === "airbnb") {
      return (listing as AirbnbPublicListing).baseRate || 0;
    }
    if (listing.listingType === "sale") {
      return Number((listing as SalePublicListing).price || 0);
    }
    const units = listing.unitTypes ?? [];
    const prices = units.map((unit) => Number(unit.price) || 0).filter((price) => price > 0);
    return prices.length ? Math.min(...prices) : 0;
  };

  const getListingRating = (listing: PublicListing) => listing.rating ?? 0;

  const sortedListings = useMemo(() => {
    const listingsToSort = [...filteredListings];

    return listingsToSort.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      switch (sortBy) {
        case "newest":
          return bTime - aTime;
        case "price_low":
          return getListingPrice(a) - getListingPrice(b) || bTime - aTime;
        case "price_high":
          return getListingPrice(b) - getListingPrice(a) || bTime - aTime;
        case "rating":
          return getListingRating(b) - getListingRating(a) || bTime - aTime;
        case "featured":
        default: {
          const aFeatured = getFeaturedStatus(a);
          const bFeatured = getFeaturedStatus(b);
          if (aFeatured === bFeatured) return bTime - aTime;
          return aFeatured ? -1 : 1;
        }
      }
    });
  }, [filteredListings, sortBy]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedListings.length / PAGE_SIZE)),
    [sortedListings.length, PAGE_SIZE]
  );

  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedListings.slice(start, start + PAGE_SIZE);
  }, [sortedListings, currentPage, PAGE_SIZE]);

  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);

    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }, [currentPage, totalPages]);

  const goToPage = (nextPage: number) => {
    const safePage = Math.min(totalPages, Math.max(1, nextPage));
    setPage(safePage);

    if (typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document.getElementById("listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const hasActiveFilters =
    filters.listingType !== "all" ||
    filters.unitType ||
    filters.propertyType ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.location ||
    filters.featured !== "all";

  const resetFilters = () => {
    setFilters({
      listingType: "all",
      unitType: "",
      propertyType: "",
      minPrice: "",
      maxPrice: "",
      location: "",
      featured: "all",
    });
  };

  return (
    <main className="relative isolate min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden pt-28 pb-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_60%)]" />
        <div className="absolute -right-24 top-12 h-56 w-56 rounded-full bg-emerald-200/35 blur-[110px]" />
        <div className="absolute -left-24 bottom-6 h-56 w-56 rounded-full bg-amber-200/35 blur-[110px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-semibold text-slate-900 font-[var(--font-cormorant)]">
              Sorana Market Place.
            </h1>
            <p className="mt-4 text-sm text-slate-600 max-w-xl">
              Browse verified listings across Kenya.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Verified inventory", value: "Quality reviewed" },
                { label: "Transparent pricing", value: "Clear terms" },
                { label: "Professional care", value: "Dedicated support" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.35)] backdrop-blur"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Listings</p>
            <h2 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-semibold text-slate-900 font-[var(--font-cormorant)]">
              Browse listings.
            </h2>
            <p className="mt-3 text-sm text-slate-600 max-w-2xl">
              Verified properties with clear terms and professional oversight.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-600 transition hover:text-slate-900"
              aria-expanded={isFilterOpen}
              aria-controls="filter-panel"
            >
              {isFilterOpen ? <X size={14} /> : <SlidersHorizontal size={14} />}
              {isFilterOpen ? "Close Filters" : "Filters"}
            </button>

            <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-600">
              <span className="text-slate-500">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none"
                aria-label="Sort listings"
              >
                <option value="featured">Featured</option>
                <option value="newest">Newest</option>
                <option value="price_low">Price: Low</option>
                <option value="price_high">Price: High</option>
                <option value="rating">Rating</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setIsFilterOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-800"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            id="filter-panel"
            initial={{ opacity: 0, y: -10, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(8px)" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-7xl mx-auto px-6 mt-6"
          >
            <div className="rounded-3xl border border-white/70 bg-white/80 p-6 sm:p-7 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.4)] backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-3">
                  <SlidersHorizontal size={18} className="text-emerald-600" />
                  Refine criteria
                </h3>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50/70 px-4 py-1 text-[9px] uppercase tracking-[0.28em] text-emerald-700">
                  <Sparkles size={11} />
                  Precision filters
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Category
                  </label>
                  <select
                    value={filters.listingType}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        listingType: e.target.value as FilterState["listingType"],
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  >
                    <option value="all">All listings</option>
                    <option value="rentals">Long-term rentals</option>
                    <option value="airbnb">Short-term stays</option>
                    <option value="sale">Properties for sale</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Westlands"
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Unit Type
                  </label>
                  <select
                    value={filters.unitType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, unitType: e.target.value }))}
                    disabled={filters.listingType === "airbnb" || filters.listingType === "sale"}
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  >
                    <option value="">All types</option>
                    {unitTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Property Type
                  </label>
                  <select
                    value={filters.propertyType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, propertyType: e.target.value }))}
                    disabled={filters.listingType !== "sale" && filters.listingType !== "all"}
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  >
                    <option value="">All sale types</option>
                    {salePropertyTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Min Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Max Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                    placeholder="50000"
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
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

      <section id="listings" className="max-w-7xl mx-auto px-6 mt-12 pb-16">
        {error && (
          <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-900">
            {error}
          </div>
        )}

        {isLoading ? (
          <ListingsSkeleton />
        ) : sortedListings.length === 0 ? (
          <div className="rounded-[32px] border border-slate-200 bg-white/85 px-6 sm:px-10 py-14 sm:py-16 text-center shadow-[0_20px_45px_-35px_rgba(15,23,42,0.4)] backdrop-blur">
            <Building2 className="mx-auto mb-5 h-12 w-12 sm:h-14 sm:w-14 text-slate-400" />
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-3">
              {hasActiveFilters ? "No matching properties found" : "No listings available yet"}
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-lg mx-auto">
              {hasActiveFilters
                ? "Adjust filters or clear to view available inventory."
                : "Additional verified listings will be published shortly."}
            </p>
            <p className="text-[11px] text-slate-400">Rates reflect monthly, nightly, or sale prices.</p>
            {hasActiveFilters && (
                <button
                  onClick={() => {
                    resetFilters();
                    setIsFilterOpen(false);
                  }}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-foreground shadow-[0_16px_30px_-18px_rgba(66,199,117,0.55)] hover:bg-primary-hover transition-all"
              >
                <X size={14} />
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-600 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur">
              <p className="font-medium">
                Showing{" "}
                <span className="font-semibold text-slate-900">
                  {(currentPage - 1) * PAGE_SIZE + 1}
                </span>
                {" "}to{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(currentPage * PAGE_SIZE, sortedListings.length)}
                </span>
                {" "}of{" "}
                <span className="font-semibold text-slate-900">{sortedListings.length}</span>
              </p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Page {currentPage} of {totalPages}
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedListings.map((property, index) => (
                <PropertyCard key={property._id} property={property} index={index} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="flex flex-wrap items-center justify-center gap-2 pt-2" aria-label="Pagination">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-700 transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>

                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    aria-current={p === currentPage ? "page" : undefined}
                    className={`h-10 w-10 rounded-full border text-xs font-semibold transition ${
                      p === currentPage
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 bg-white/85 text-slate-700 hover:bg-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-700 transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

interface PropertyCardProps {
  property: PublicListing;
  index: number;
}

const ListingsSkeleton = () => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: 8 }).map((_, idx) => (
      <div
        key={`skeleton-${idx}`}
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/80 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)] backdrop-blur animate-pulse"
      >
        <div className="h-52 bg-slate-200/70" />
        <div className="space-y-3 px-6 pb-6 pt-4">
          <div className="space-y-2">
            <div className="h-4 w-3/4 rounded-full bg-slate-200/80" />
            <div className="h-3 w-5/6 rounded-full bg-slate-200/70" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-3 w-24 rounded-full bg-slate-200/70" />
            <div className="h-3 w-16 rounded-full bg-slate-200/70" />
          </div>
          <div className="h-8 w-full rounded-full bg-slate-200/80" />
        </div>
      </div>
    ))}
  </div>
);

const PropertyCard: React.FC<PropertyCardProps> = ({ property, index }) => {
  const isAirbnb = property.listingType === "airbnb";
  const isSale = property.listingType === "sale";
  const availability: AvailabilitySummary | null =
    !isAirbnb && !isSale ? ensureAvailability(property) : null;
  const propertyUnits = !isAirbnb && !isSale ? property.unitTypes ?? [] : [];
  const minPrice = propertyUnits.length ? Math.min(...propertyUnits.map((unit) => Number(unit.price) || 0)) : 0;
  const nightlyRate = isAirbnb ? (property as AirbnbPublicListing).baseRate : 0;
  const salePrice = isSale ? Number((property as SalePublicListing).price || 0) : 0;
  const priceLabel = isAirbnb
    ? nightlyRate
      ? nightlyRate.toLocaleString()
      : ""
    : isSale
      ? salePrice
        ? salePrice.toLocaleString()
        : ""
      : minPrice
        ? minPrice.toLocaleString()
        : "";
  const vacancyCount = availability?.totalVacant ?? 0;
  const unitCount = isAirbnb ? (property as AirbnbPublicListing).units ?? 1 : 0;
  const vacancyBadge = !isAirbnb && !isSale
    ? `${vacancyCount} vacant unit${vacancyCount === 1 ? "" : "s"}`
    : isSale
      ? (() => {
          const sale = property as SalePublicListing;
          const parts = [
            sale.propertyType ? sale.propertyType : null,
            Number.isFinite(Number(sale.bedrooms)) ? `${Number(sale.bedrooms)} bed` : null,
            Number.isFinite(Number(sale.bathrooms)) ? `${Number(sale.bathrooms)} bath` : null,
          ].filter(Boolean);
          return parts.length ? parts.join(" • ") : "For sale";
        })()
      : `${unitCount} unit${unitCount === 1 ? "" : "s"}`;

  const statusTone = isAirbnb
    ? property.status === "published"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600"
    : isSale
      ? property.status === "published"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-600"
      : property.status === "Active"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-600";

  const images = property.images?.length ? property.images : ["/logo.png"];
  const heroImage = images[0];

  const featuredLabel = isAirbnb
    ? (property.rating ?? 0) >= 4.6
    : isSale
      ? !!(property as SalePublicListing).isFeatured
      : !!(property as any).isAdvertised;
  const badgeLabel = isAirbnb ? "Short-term" : isSale ? "For sale" : "Long-term";
  const reviewCount = property.reviewCount ?? 0;
  const ratingValue = property.rating ?? 0;
  const reviewLabel = reviewCount
    ? `${ratingValue.toFixed(1)}★ (${reviewCount})`
    : "No reviews yet";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_50px_-40px_rgba(15,23,42,0.5)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-45px_rgba(15,23,42,0.55)]"
    >
      <div className="relative h-52 overflow-hidden">
        <Image
          src={heroImage}
          alt={property.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 1024px) 50vw, 25vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {featuredLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-900">
              <Star size={11} fill="#111827" />
              Featured
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-700">
            {badgeLabel}
          </span>
        </div>
        <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-wider ${statusTone}`}>
          {property.status}
        </span>
      </div>

      <div className="space-y-3 px-6 pb-6 pt-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 line-clamp-2">{property.name}</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={13} className="flex-shrink-0" />
            <span className="line-clamp-1">{property.address}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <DollarSign size={14} className="text-emerald-600" />
            {priceLabel ? (
              <span className="font-medium text-slate-900">
                {isSale ? `Ksh ${priceLabel}` : `From Ksh ${priceLabel}/${isAirbnb ? "night" : "mo"}`}
              </span>
            ) : (
              <span>Pricing on request</span>
            )}
          </div>
          <span className="text-slate-500 font-medium">{vacancyBadge}</span>
          <span className="text-slate-500 font-medium">{reviewLabel}</span>
        </div>

        <Link
          href={`/market-place/${property._id}`}
          className="mt-3 inline-flex w-full items-center justify-between rounded-full bg-primary px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition hover:bg-primary-hover"
        >
          {isAirbnb ? "Reserve stay" : isSale ? "Request details" : "View details"}
          <ArrowUpRight size={12} />
        </Link>
      </div>
    </motion.article>
  );
};
