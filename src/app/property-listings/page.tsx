"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { MapPin, DollarSign, Star, Filter, Menu, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface PropertyListing {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; quantity: number; deposit: number }[];
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
  images: string[];
  isAdvertised: boolean;
  adExpiration?: string;
  description?: string;
  facilities?: string[];
  ownerId: string;
}

interface FilterState {
  unitType: string;
  priceRange: [number, number];
  isAdvertised: boolean | null;
  location: string;
}

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#012a4a] text-white py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">About Us</h3>
            <p className="text-sm text-gray-200">
              We connect property owners with tenants, offering premium rental properties across the region.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="text-sm space-y-2">
              <li><Link href="/" className="hover:text-[#34d399] transition">Home</Link></li>
              <li><Link href="/property-listings" className="hover:text-[#34d399] transition">Properties</Link></li>
              <li><Link href="/contact" className="hover:text-[#34d399] transition">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <p className="text-sm text-gray-200">Email: support@smartchoicemanagement.com</p>
            <p className="text-sm text-gray-200">Phone: +254 117 649 850</p>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-gray-200">
          &copy; {new Date().getFullYear()} Smart Choice Rental Management Ltd. All rights reserved.
        </div>
        <div className="mt-2 text-center text-xs text-gray-400">
        Developed by <a href="https://vickins-technologies-lv2h.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-[#34d399] underline">Vickins Technologies</a>
        </div>
      </div>
    </footer>
  );
};

export default function LandingPage() {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<PropertyListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    unitType: "",
    priceRange: [0, Infinity],
    isAdvertised: null,
    location: "",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public-properties", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        const sortedProperties = (data.properties || []).sort((a: PropertyListing, b: PropertyListing) => {
          if (a.isAdvertised && !b.isAdvertised) return -1;
          if (!a.isAdvertised && b.isAdvertised) return 1;
          return a.name.localeCompare(b.name);
        });
        setProperties(sortedProperties);
        setFilteredProperties(sortedProperties);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch (err) {
      console.error("Fetch properties error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  useEffect(() => {
    const applyFilters = () => {
      let filtered = properties.filter((p) => p.status === "Active");

      if (filters.unitType) {
        filtered = filtered.filter((p) => p.unitTypes.some((u) => u.type === filters.unitType));
      }

      if (filters.priceRange[1] !== Infinity) {
        filtered = filtered.filter((p) => {
          const minPrice = Math.min(...p.unitTypes.map((u) => u.price));
          return minPrice >= filters.priceRange[0] && minPrice <= filters.priceRange[1];
        });
      }

      if (filters.isAdvertised !== null) {
        filtered = filtered.filter((p) => p.isAdvertised === filters.isAdvertised);
      }

      if (filters.location) {
        filtered = filtered.filter((p) =>
          p.address.toLowerCase().includes(filters.location.toLowerCase())
        );
      }

      setFilteredProperties(filtered);
    };

    applyFilters();
  }, [filters, properties]);

  const handleFilterChange = useCallback(
    (key: keyof FilterState, value: string | [number, number] | boolean | null) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters({ unitType: "", priceRange: [0, Infinity], isAdvertised: null, location: "" });
    setIsFilterOpen(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const unitTypes = useMemo(
    () => Array.from(new Set(properties.flatMap((p) => p.unitTypes.map((u) => u.type)))),
    [properties]
  );

  // Animation variants for the filter panel
  const filterVariants: Variants = {
    hidden: { opacity: 0, height: 0, y: -20 },
    visible: { opacity: 1, height: "auto", y: 0 },
    exit: { opacity: 0, height: 0, y: -20 },
  };

  // Animation variants for filter inputs
  const inputVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.3, ease: "easeOut" },
    }),
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <header className="bg-white text-gray-800 py-6 shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Smart Choice Rental Management Logo"
              width={52}
              height={52}
              className="object-contain"
            />
            <h1 className="text-3xl md:text-4xl font-bold">
              Smart Choice Rentals
            </h1>
          </div>
          <div className="flex items-center">
            <nav className="hidden md:flex gap-6">
              <Link href="https://smartchoicerentalmanagement.com/" className="text-sm font-medium hover:text-[#012a4a] transition">
                Home
              </Link>
              <Link href="https://www.smartchoicerentalmanagement.com/contact-us" className="text-sm font-medium hover:text-[#012a4a] transition">
                Contact
              </Link>
            </nav>
            <button
              className="md:hidden p-2 text-gray-800 hover:text-[#012a4a] transition"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.nav
              className="md:hidden bg-white shadow-lg"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="container mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
                <Link
                  href="https://smartchoicerentalmanagement.com/"
                  className="text-sm font-medium hover:text-[#012a4a] transition"
                  onClick={toggleMobileMenu}
                >
                  Home
                </Link>
                <Link
                  href="https://www.smartchoicerentalmanagement.com/contact-us"
                  className="text-sm font-medium hover:text-[#012a4a] transition"
                  onClick={toggleMobileMenu}
                >
                  Contact
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          className="flex flex-col sm:flex-row justify-between items-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <h2 className="text-2xl md:text-3xl font-semibold text-[#012a4a]">
            Available Properties
          </h2>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="mt-4 sm:mt-0 flex items-center gap-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition"
          >
            <Filter className="h-5 w-5" />
            {isFilterOpen ? "Close Filters" : "Open Filters"}
          </button>
        </motion.div>
        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              className="bg-gray-50 p-6 rounded-lg shadow-md mb-8"
              variants={filterVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: "Location",
                    component: (
                      <input
                        type="text"
                        placeholder="Enter city or address"
                        value={filters.location}
                        onChange={(e) => handleFilterChange("location", e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm"
                      />
                    ),
                  },
                  {
                    label: "Unit Type",
                    component: (
                      <select
                        value={filters.unitType}
                        onChange={(e) => handleFilterChange("unitType", e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm"
                      >
                        <option value="">All Unit Types</option>
                        {unitTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                  {
                    label: "Price Range (Ksh/mo)",
                    component: (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          value={filters.priceRange[0] === 0 ? "" : filters.priceRange[0]}
                          onChange={(e) =>
                            handleFilterChange("priceRange", [
                              parseInt(e.target.value) || 0,
                              filters.priceRange[1],
                            ])
                          }
                          className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm"
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={filters.priceRange[1] === Infinity ? "" : filters.priceRange[1]}
                          onChange={(e) =>
                            handleFilterChange("priceRange", [
                              filters.priceRange[0],
                              parseInt(e.target.value) || Infinity,
                            ])
                          }
                          className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm"
                        />
                      </div>
                    ),
                  },
                  {
                    label: "Advertising Status",
                    component: (
                      <select
                        value={filters.isAdvertised === null ? "all" : filters.isAdvertised ? "yes" : "no"}
                        onChange={(e) =>
                          handleFilterChange(
                            "isAdvertised",
                            e.target.value === "all" ? null : e.target.value === "yes"
                          )
                        }
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm"
                      >
                        <option value="all">All Properties</option>
                        <option value="yes">Featured Only</option>
                        <option value="no">Non-Featured Only</option>
                      </select>
                    ),
                  },
                ].map((filter, index) => (
                  <motion.div
                    key={filter.label}
                    variants={inputVariants}
                    initial="hidden"
                    animate="visible"
                    custom={index}
                  >
                    <label className="block text-sm font-medium text-[#012a4a] mb-2">
                      {filter.label}
                    </label>
                    {filter.component}
                  </motion.div>
                ))}
              </div>
              <motion.div
                className="mt-4 flex justify-end"
                variants={inputVariants}
                initial="hidden"
                animate="visible"
                custom={4}
              >
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition text-sm"
                >
                  Reset Filters
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <motion.div
            className="bg-red-100 text-red-700 p-4 mb-8 rounded-lg shadow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}
        {isLoading ? (
          <motion.div
            className="text-center text-[#012a4a]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
            <span className="ml-2 text-lg">Loading properties...</span>
          </motion.div>
        ) : filteredProperties.length === 0 ? (
          <motion.div
            className="bg-white border border-gray-200 rounded-xl p-8 shadow-md text-center text-[#012a4a]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-lg">No properties match your filters.</p>
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm"
            >
              Clear Filters
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProperties.map((property, index) => (
              <motion.div
                key={property._id}
                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition relative group"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                {property.isAdvertised && (
                  <div className="absolute top-3 right-3 bg-[#012a4a] text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center z-10">
                    <Star className="h-4 w-4 mr-1" />
                    Featured
                  </div>
                )}
                <div className="relative h-56">
                  {property.images && property.images.length > 0 ? (
                    <Image
                      src={property.images[0]}
                      alt={`${property.name} image`}
                      width={400}
                      height={224}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <Image
                        src="/logo.png"
                        alt="Placeholder Logo"
                        width={64}
                        height={64}
                        className="object-contain"
                      />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-semibold text-[#012a4a] mb-2 truncate">{property.name}</h3>
                  <div className="flex items-center text-gray-600 mb-2">
                    <MapPin className="h-5 w-5 mr-1 text-[#012a4a]" />
                    <span className="text-sm">{property.address}</span>
                  </div>
                  <div className="flex items-center text-gray-600 mb-2">
                    <DollarSign className="h-5 w-5 mr-1 text-[#012a4a]" />
                    <span className="text-sm">
                      Starting from Ksh {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()} /mo
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    {property.unitTypes.map((u) => `${u.type} (x${u.quantity})`).join(", ")}
                  </div>
                  <Link
                    href={`/property-listings/${property._id}`}
                    className="w-full bg-[#012a4a] text-white py-2 rounded-lg hover:bg-[#014a7a] transition text-sm font-medium text-center block"
                  >
                    View Details
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
      <Footer />
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}