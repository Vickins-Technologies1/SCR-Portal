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
    <main className="min-h-screen pt-28 pb-16">
      <section className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Properties</p>
            <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold text-display">
              Explore curated listings across Kenya
            </h1>
            <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl">
              Browse verified homes and investment-ready rentals managed with Sorana&apos;s
              concierge-level care. Filter by location, pricing, and unit mix to match your needs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
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
                className="flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
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
            <div className="glass-panel rounded-3xl p-6 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-3">
                  <SlidersHorizontal size={22} className="text-primary" />
                  Refine your search
                </h2>
              </div>

              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
                  >
                    <option value="all">All stays</option>
                    <option value="rentals">Long-term rentals</option>
                    <option value="airbnb">Short-term stays</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Westlands, Kilimani..."
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Unit Type
                  </label>
                  <select
                    value={filters.unitType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, unitType: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Min Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Max Price (Ksh)
                  </label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                    placeholder="50000"
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition"
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

      <section className="max-w-7xl mx-auto px-6 mt-10">
        {error && (
          <div className="mb-8 rounded-2xl border border-border bg-card px-6 py-5 text-foreground shadow-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sortedListings.length === 0 ? (
          <div className="surface-card rounded-3xl px-6 sm:px-10 py-16 sm:py-20 text-center">
            <Building2 className="mx-auto mb-6 h-16 w-16 sm:h-20 sm:w-20 text-muted-foreground" />
            <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-4">
              {hasActiveFilters ? "No matching properties found" : "No listings available yet"}
            </h3>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              {hasActiveFilters
                ? "Try adjusting your filters or clear them to see all available properties."
                : "We are constantly adding new verified listings. Please check back soon."}
            </p>
            <p className="text-xs text-muted-foreground/80">
              Pricing reflects monthly rates for long-term rentals and nightly rates for short-term stays.
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setIsFilterOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground text-xs font-semibold uppercase tracking-[0.2em] shadow-[0_16px_30px_-18px_rgba(66,199,117,0.6)] hover:bg-primary-hover transition-all"
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

// ──────────────────────────────────────────────
// PropertyCard (unchanged – included for completeness)
// ──────────────────────────────────────────────

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
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-muted/70 text-muted-foreground"
    : property.status === "Active"
      ? "border-primary/30 bg-primary/10 text-primary"
      : property.status === "Inactive"
        ? "border-border bg-muted/80 text-muted-foreground"
        : "border-border bg-muted/60 text-muted-foreground";

  const images = property.images?.length ? property.images : ["/logo.png"];
  const heroImage = images[0];
  const sideImageOne = images[1] || images[0];
  const sideImageTwo = images[2] || images[0];

  const featuredLabel = !isAirbnb ? property.isAdvertised : (property.rating ?? 0) >= 4.6;
  const badgeLabel = isAirbnb ? "Short-term" : "Long-term";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group overflow-hidden rounded-3xl border border-border bg-card shadow-[0_20px_50px_-35px_rgba(30,58,138,0.45)] transition-all duration-300 hover:shadow-[0_30px_70px_-40px_rgba(30,58,138,0.55)]"
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
          {featuredLabel && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur-sm">
              <Star size={12} fill="white" />
              Featured
            </span>
          )}
          <span className="absolute right-4 top-4 inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground">
            {badgeLabel}
          </span>
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
            <h2 className="text-xl font-semibold text-foreground line-clamp-2">{property.name}</h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
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

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <DollarSign size={16} className="text-primary" />
            {priceLabel ? (
              <span className="font-medium text-foreground">
                Starting from Ksh {priceLabel}/{isAirbnb ? "night" : "mo"}
              </span>
            ) : (
              <span>Pricing on request</span>
            )}
          </div>
          <span className="text-muted-foreground font-medium">{vacancyBadge}</span>
          {isAirbnb && (
            <span className="text-muted-foreground font-medium">
              {(property.rating ?? 0).toFixed(1)}★ ({property.reviewCount ?? 0})
            </span>
          )}
        </div>

        <Link
          href={`/property-listings/${property._id}`}
          className="mt-3 block w-full rounded-full bg-primary px-6 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground shadow-[0_16px_30px_-18px_rgba(66,199,117,0.6)] hover:bg-primary-hover transition-all duration-300"
        >
          View Details
        </Link>
      </div>
    </motion.article>
  );
}
