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
import { PublicListing, AirbnbPublicListing, AvailabilitySummary } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";

interface FilterState {
  listingType: "all" | "rentals" | "airbnb";
  unitType: string;
  minPrice: string;
  maxPrice: string;
  location: string;
  featured: "all" | "featured" | "standard";
}

export default function PropertyListings() {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    listingType: "all",
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
    const types = listings
      .filter((listing) => listing.listingType === "rentals")
      .flatMap((listing) => (listing.unitTypes ?? []).map((unit) => unit.type));
    return Array.from(new Set(types)).sort();
  }, [listings]);

  const filteredListings = useMemo(() => {
    const locationFilter = filters.location.trim().toLowerCase();
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;

    return listings.filter((listing) => {
      const isAirbnb = listing.listingType === "airbnb";
      const units = listing.listingType === "rentals" ? listing.unitTypes ?? [] : [];

      if (filters.listingType !== "all" && listing.listingType !== filters.listingType) {
        return false;
      }

      if (filters.unitType && !units.some((unit) => unit.type === filters.unitType)) {
        return false;
      }

      if (locationFilter) {
        const addressMatch = listing.address?.toLowerCase().includes(locationFilter);
        const nameMatch = listing.name?.toLowerCase().includes(locationFilter);
        if (!addressMatch && !nameMatch) return false;
      }

      const isFeatured = isAirbnb
        ? (listing.rating ?? 0) >= 4.6 && (listing.reviewCount ?? 0) >= 8
        : !!listing.isAdvertised;

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
        } else {
          return false;
        }
      }

      return true;
    });
  }, [listings, filters]);

  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      const aFeatured = a.listingType === "airbnb"
        ? (a.rating ?? 0) >= 4.6 && (a.reviewCount ?? 0) >= 8
        : !!a.isAdvertised;
      const bFeatured = b.listingType === "airbnb"
        ? (b.rating ?? 0) >= 4.6 && (b.reviewCount ?? 0) >= 8
        : !!b.isAdvertised;

      if (aFeatured === bFeatured) {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }
      return aFeatured ? -1 : 1;
    });
  }, [filteredListings]);

  const heroImages = useMemo(() => {
    const images = sortedListings
      .flatMap((listing) => listing.images || [])
      .filter(Boolean)
      .slice(0, 4);
    if (images.length >= 4) return images;
    const fallback = "/logo.png";
    return [...images, ...Array.from({ length: 4 - images.length }).map(() => fallback)];
  }, [sortedListings]);

  const hasActiveFilters =
    filters.listingType !== "all" ||
    filters.unitType ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.location ||
    filters.featured !== "all";

  const resetFilters = () => {
    setFilters({
      listingType: "all",
      unitType: "",
      minPrice: "",
      maxPrice: "",
      location: "",
      featured: "all",
    });
  };

  return (
    <main className="min-h-screen bg-[#f6f3ef] text-slate-900">
      <section className="relative overflow-hidden pt-28 pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%)]" />
        <div className="absolute -right-40 top-16 h-72 w-72 rounded-full bg-emerald-200/40 blur-[120px]" />
        <div className="absolute -left-32 bottom-8 h-72 w-72 rounded-full bg-amber-200/40 blur-[120px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-emerald-700">Sorana curated stays</p>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold text-slate-900 font-[var(--font-cormorant)]">
                Elevated stays and rentals designed for discerning guests.
              </h1>
              <p className="mt-5 text-sm sm:text-base text-slate-600 max-w-xl">
                Discover premium long-term residences and Airbnb-grade short-term stays with concierge-level
                property management, transparent pricing, and instant booking confidence.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="#listings"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.6)] transition hover:bg-slate-800"
                >
                  Browse listings
                  <ArrowUpRight size={14} />
                </Link>
                <a
                  href="mailto:bookings@soranapropertymanagers.com"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:border-slate-400"
                >
                  Talk to concierge
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={`hero-${idx}`}
                  className={`relative overflow-hidden rounded-3xl ${idx === 0 ? "row-span-2 h-64" : "h-32"} shadow-[0_20px_45px_-30px_rgba(15,23,42,0.6)]`}
                >
                  <Image
                    src={heroImages[idx]}
                    alt="Featured property"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 45vw, 20vw"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500">Properties</p>
            <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-semibold text-slate-900 font-[var(--font-cormorant)]">
              Curated inventory for every stay length
            </h2>
            <p className="mt-3 text-sm text-slate-600 max-w-2xl">
              All listings are verified, professionally managed, and ready for move-in or immediate booking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:text-slate-900"
              aria-expanded={isFilterOpen}
              aria-controls="filter-panel"
            >
              {isFilterOpen ? <X size={16} /> : <SlidersHorizontal size={16} />}
              {isFilterOpen ? "Close Filters" : "Filters"}
            </button>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setIsFilterOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-800"
              >
                <X size={16} />
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
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-7xl mx-auto px-6 mt-6"
          >
            <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 sm:p-7 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.4)] backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-3">
                  <SlidersHorizontal size={22} className="text-emerald-600" />
                  Refine your search
                </h3>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1 text-[10px] uppercase tracking-[0.3em] text-emerald-700">
                  <Sparkles size={12} />
                  Premium filters
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Stay Type
                  </label>
                  <select
                    value={filters.listingType}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        listingType: e.target.value as FilterState["listingType"],
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  >
                    <option value="all">All stays</option>
                    <option value="rentals">Long-term rentals</option>
                    <option value="airbnb">Short-term stays</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Westlands, Kilimani..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Unit Type
                  </label>
                  <select
                    value={filters.unitType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, unitType: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Min Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Max Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                    placeholder="50000"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
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
          <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-rose-900">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[45vh]">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : sortedListings.length === 0 ? (
          <div className="rounded-[32px] border border-slate-200 bg-white/90 px-6 sm:px-10 py-16 sm:py-20 text-center shadow-[0_20px_45px_-35px_rgba(15,23,42,0.4)]">
            <Building2 className="mx-auto mb-6 h-16 w-16 sm:h-20 sm:w-20 text-slate-400" />
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-4">
              {hasActiveFilters ? "No matching properties found" : "No listings available yet"}
            </h3>
            <p className="text-slate-500 mb-8 max-w-lg mx-auto">
              {hasActiveFilters
                ? "Try adjusting your filters or clear them to see all available properties."
                : "We are constantly adding new verified listings. Please check back soon."}
            </p>
            <p className="text-xs text-slate-400">
              Pricing reflects monthly rates for long-term rentals and nightly rates for short-term stays.
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setIsFilterOpen(false);
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.6)] hover:bg-slate-800 transition-all"
              >
                <X size={16} />
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
      </section>
    </main>
  );
}

interface PropertyCardProps {
  property: PublicListing;
  index: number;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, index }) => {
  const isAirbnb = property.listingType === "airbnb";
  const availability: AvailabilitySummary | null = isAirbnb ? null : ensureAvailability(property);
  const propertyUnits = !isAirbnb ? property.unitTypes ?? [] : [];
  const minPrice = propertyUnits.length ? Math.min(...propertyUnits.map((unit) => Number(unit.price) || 0)) : 0;
  const nightlyRate = isAirbnb ? (property as AirbnbPublicListing).baseRate : 0;
  const priceLabel = isAirbnb
    ? nightlyRate
      ? nightlyRate.toLocaleString()
      : ""
    : minPrice
      ? minPrice.toLocaleString()
      : "";
  const vacancyCount = availability?.totalVacant ?? 0;
  const unitCount = isAirbnb ? (property as AirbnbPublicListing).units ?? 1 : 0;
  const vacancyBadge = !isAirbnb
    ? `${vacancyCount} vacant unit${vacancyCount === 1 ? "" : "s"}`
    : `${unitCount} unit${unitCount === 1 ? "" : "s"}`;

  const statusTone = isAirbnb
    ? property.status === "published"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600"
    : property.status === "Active"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600";

  const images = property.images?.length ? property.images : ["/logo.png"];
  const heroImage = images[0];

  const featuredLabel = !isAirbnb ? property.isAdvertised : (property.rating ?? 0) >= 4.6;
  const badgeLabel = isAirbnb ? "Short-term" : "Long-term";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_50px_-40px_rgba(15,23,42,0.5)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-45px_rgba(15,23,42,0.55)]"
    >
      <div className="relative h-56 overflow-hidden">
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-900">
              <Star size={12} fill="#111827" />
              Featured
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            {badgeLabel}
          </span>
        </div>
        <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusTone}`}>
          {property.status}
        </span>
      </div>

      <div className="space-y-4 px-6 pb-6 pt-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 line-clamp-2">{property.name}</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin size={15} className="flex-shrink-0" />
            <span className="line-clamp-1">{property.address}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <DollarSign size={16} className="text-emerald-600" />
            {priceLabel ? (
              <span className="font-medium text-slate-900">
                From Ksh {priceLabel}/{isAirbnb ? "night" : "mo"}
              </span>
            ) : (
              <span>Pricing on request</span>
            )}
          </div>
          <span className="text-slate-500 font-medium">{vacancyBadge}</span>
          {isAirbnb && (
            <span className="text-slate-500 font-medium">
              {(property.rating ?? 0).toFixed(1)}★ ({property.reviewCount ?? 0})
            </span>
          )}
        </div>

        <Link
          href={`/property-listings/${property._id}`}
          className="mt-3 inline-flex w-full items-center justify-between rounded-full bg-slate-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-slate-800"
        >
          {isAirbnb ? "Reserve stay" : "View details"}
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </motion.article>
  );
};
