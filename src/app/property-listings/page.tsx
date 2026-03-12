"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, DollarSign, MapPin, Star } from "lucide-react";
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
        const minListingPrice = Math.min(...units.map((unit) => unit.price));
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
      <header className="border-b border-slate-200 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Sorana Property Managers</p>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900">Available listings</h1>
              <p className="mt-2 text-sm text-slate-600">
                Explore verified listings from property owners with live availability.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400"
            >
              Contact us
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Filter listings</p>
              <p className="text-sm text-slate-600">Keep it simple and narrow down the options.</p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-600 hover:border-slate-400"
            >
              Reset
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Location
              <input
                type="text"
                value={filters.location}
                onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="e.g. Westlands"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Unit type
              <select
                value={filters.unitType}
                onChange={(event) => setFilters((prev) => ({ ...prev, unitType: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All types</option>
                {unitTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Min price
              <input
                type="number"
                value={filters.minPrice}
                onChange={(event) => setFilters((prev) => ({ ...prev, minPrice: event.target.value }))}
                placeholder="0"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Max price
              <input
                type="number"
                value={filters.maxPrice}
                onChange={(event) => setFilters((prev) => ({ ...prev, maxPrice: event.target.value }))}
                placeholder="50000"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Featured
              <select
                value={filters.featured}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, featured: event.target.value as FilterState["featured"] }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All</option>
                <option value="featured">Featured</option>
                <option value="standard">Standard</option>
              </select>
            </label>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-cyan-500" />
          </div>
        ) : sortedListings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-600 shadow-sm">
            <Building2 className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <p className="text-lg font-medium">
              {hasActiveFilters ? "No listings match your filters." : "No listings available yet."}
            </p>
            <p className="mt-1 text-sm">
              {hasActiveFilters ? "Try adjusting the filters above." : "Check back soon as new properties are added."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-600 hover:border-slate-400"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sortedListings.map((property, index) => (
              <PropertyCard key={property._id} property={property} index={index} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface PropertyCardProps {
  property: Listing;
  index: number;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, index }) => {
  const availability: AvailabilitySummary = ensureAvailability(property);
  const propertyUnits = property.unitTypes ?? [];
  const minPrice = propertyUnits.length ? Math.min(...propertyUnits.map((unit) => unit.price)) : 0;
  const priceLabel = minPrice ? minPrice.toLocaleString() : "";
  const vacancyCount = availability.totalVacant;
  const vacancyBadge = vacancyCount + " vacant unit" + (vacancyCount === 1 ? "" : "s");
  const statusTone =
    property.status === "Active"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : property.status === "Inactive"
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-slate-300 bg-slate-100 text-slate-600";

  const images = property.images && property.images.length ? property.images : ["/logo.png"];
  const heroImage = images[0];
  const sideImageOne = images[1] || images[0];
  const sideImageTwo = images[2] || images[0];

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60"
    >
      <div className="grid h-48 grid-cols-6 grid-rows-2 gap-2 p-4">
        <div className="relative col-span-4 row-span-2 overflow-hidden rounded-2xl">
          <Image src={heroImage} alt={property.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent" />
          {property.isAdvertised && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-cyan-600/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              <Star size={12} /> Featured
            </span>
          )}
        </div>
        <div className="relative col-span-2 row-span-1 overflow-hidden rounded-2xl">
          <Image src={sideImageOne} alt={property.name + " image"} fill className="object-cover" />
        </div>
        <div className="relative col-span-2 row-span-1 overflow-hidden rounded-2xl">
          <Image src={sideImageTwo} alt={property.name + " image"} fill className="object-cover" />
        </div>
      </div>

      <div className="space-y-4 px-6 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{property.name}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <MapPin size={14} /> {property.address}
            </p>
          </div>
          <span className={"rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest " + statusTone}>
            {property.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
          <div className="flex items-center gap-1">
            <DollarSign size={16} />
            {minPrice ? <span>From Ksh {priceLabel}/mo</span> : <span>Pricing on request</span>}
          </div>
          <span className="text-slate-500">{vacancyBadge}</span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {propertyUnits.map((unit, unitIndex) => (
            <span
              key={property._id + "-" + unit.type + "-" + (unit.uniqueType ?? "standard") + "-" + unitIndex}
              className="rounded-full border border-slate-200 px-3 py-1"
            >
              {unit.type} - {unit.vacant ?? unit.quantity} left
            </span>
          ))}
        </div>

        <Link
          href={"/property-listings/" + property._id}
          className="block rounded-2xl bg-cyan-600 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-cyan-500"
        >
          View details
        </Link>
      </div>
    </motion.article>
  );
};
