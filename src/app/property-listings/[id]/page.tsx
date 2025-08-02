"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, DollarSign, Star, ChevronLeft, ChevronRight, Maximize2, Mail, Phone, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

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

interface Owner {
  email: string;
  phone: string;
}

interface PropertyResponse {
  success: boolean;
  property: PropertyListing;
  owner: Owner | null;
  message?: string;
}

const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-r from-[#1e3a8a] to-[#0f172a] text-white py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <h3 className="text-xl font-semibold mb-4 tracking-tight">About Us</h3>
            <p className="text-sm text-gray-200 leading-relaxed">
              Smart Choice Rentals connects property owners with tenants, offering premium rental properties with unmatched quality and service.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4 tracking-tight">Quick Links</h3>
            <ul className="text-sm space-y-3">
              <li><Link href="/" className="hover:text-[#34d399] transition-colors duration-200">Home</Link></li>
              <li><Link href="/property-listings" className="hover:text-[#34d399] transition-colors duration-200">Properties</Link></li>
              <li><Link href="/contact" className="hover:text-[#34d399] transition-colors duration-200">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4 tracking-tight">Contact</h3>
            <p className="text-sm text-gray-200">Email: support@smartchoicemanagement.com</p>
            <p className="text-sm text-gray-200 mt-2">Phone: +254 117 649 850</p>
          </div>
        </div>
        <div className="mt-10 text-center text-sm text-gray-300">
          &copy; {new Date().getFullYear()} Smart Choice Rental Management Ltd. All rights reserved.
        </div>
        <div className="mt-2 text-center text-xs text-gray-400">
          Created by <a href="https://vickins-technologies.onrender.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#34d399] underline transition-colors duration-200">Vickins Technologies</a>
        </div>
      </div>
    </footer>
  );
};

export default function PropertyDetails({ params }: { params: Promise<{ id: string }> }) {
  const [property, setProperty] = useState<PropertyListing | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchProperty() {
      try {
        const { id } = await params;
        const res = await fetch(`/api/public-properties/${id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        const data: PropertyResponse = await res.json();
        if (data.success) {
          setProperty(data.property);
          setOwner(data.owner);
        } else {
          setError(data.message || "Failed to fetch property details.");
        }
      } catch (err) {
        console.error("Fetch property error:", err instanceof Error ? err.message : "Unknown error");
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchProperty();
  }, [params]);

  const images = property?.images && property.images.length > 0 ? property.images : ["/logo.png"];
  const isSingleImage = images.length === 1;

  const handlePrevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const handleThumbnailClick = useCallback((index: number) => {
    setCurrentImageIndex(index);
  }, []);

  const handleImageError = useCallback(() => {
    return "/logo.png"; // Fallback to default image on error
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          className="text-center text-[#1e3a8a]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#34d399]"></div>
          <span className="ml-3 text-lg font-medium">Loading property details...</span>
        </motion.div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          className="bg-red-50 text-red-600 p-6 rounded-xl shadow-lg max-w-md text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-lg font-medium">{error || "Property not found."}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-6 py-2 bg-[#1e3a8a] text-white rounded-lg hover:bg-[#2563eb] transition-colors duration-200 text-sm font-medium"
          >
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <header className="bg-white py-6 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Smart Choice Rental Management Logo"
              width={56}
              height={56}
              className="object-contain"
              onError={() => handleImageError()}
            />
            <h1 className="text-2xl md:text-3xl font-bold text-[#1e3a8a] tracking-tight">Smart Choice Rentals</h1>
          </div>
          <nav className="hidden md:flex gap-8">
            <Link href="https://smartchoicerentalmanagement.com/" className="text-sm font-medium text-gray-600 hover:text-[#2563eb] transition-colors duration-200">
              Home
            </Link>
            <Link href="https://www.smartchoicerentalmanagement.com/contact-us" className="text-sm font-medium text-gray-600 hover:text-[#2563eb] transition-colors duration-200">
              Contact
            </Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/property-listings"
          className="inline-flex items-center text-[#1e3a8a] hover:text-[#2563eb] mb-8 text-sm font-medium transition-colors duration-200"
        >
          <ChevronLeft className="h-5 w-5 mr-1" />
          Back to Properties
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-white rounded-2xl shadow-lg p-6 lg:p-8"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="relative group">
                <motion.div
                  key={currentImageIndex}
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -50, opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="relative h-64 sm:h-80 lg:h-[28rem] rounded-xl overflow-hidden shadow-md"
                >
                  <Image
                    src={images[currentImageIndex]}
                    alt={`${property.name} image ${currentImageIndex + 1}`}
                    width={672}
                    height={448}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => handleImageError()}
                  />
                  <button
                    onClick={() => setIsFullScreen(true)}
                    className="absolute bottom-4 right-4 bg-[#1e3a8a] text-white p-2 rounded-full hover:bg-[#2563eb] transition-colors duration-200 opacity-0 group-hover:opacity-100"
                    aria-label="View full screen"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                </motion.div>
                {!isSingleImage && (
                  <div className="flex justify-between items-center mt-4">
                    <button
                      onClick={handlePrevImage}
                      className="bg-white text-gray-800 p-2 rounded-full shadow-sm hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
                      disabled={isSingleImage}
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm font-medium text-gray-600">
                      {currentImageIndex + 1} / {images.length}
                    </span>
                    <button
                      onClick={handleNextImage}
                      className="bg-white text-gray-800 p-2 rounded-full shadow-sm hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
                      disabled={isSingleImage}
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex overflow-x-auto gap-3 py-3 thumbnail-container">
                  {images.map((image, index) => (
                    <motion.button
                      key={index}
                      onClick={() => handleThumbnailClick(index)}
                      className={`flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 shadow-sm ${
                        currentImageIndex === index ? "border-[#34d399]" : "border-gray-200"
                      } hover:border-[#2563eb] transition-colors duration-200`}
                      aria-label={`View image ${index + 1}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Image
                        src={image}
                        alt={`${property.name} thumbnail ${index + 1}`}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError()}
                      />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-8">
              <motion.h2
                className="text-3xl md:text-4xl font-bold text-[#1e3a8a] tracking-tight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {property.name}
              </motion.h2>
              <div className="flex items-center text-gray-600">
                <MapPin className="h-5 w-5 mr-2 text-[#34d399]" />
                <span className="text-sm font-medium">{property.address}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <DollarSign className="h-5 w-5 mr-2 text-[#34d399]" />
                <span className="text-sm font-medium">
                  Starting from Ksh {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()} /mo
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Unit Types</h3>
                <ul className="space-y-2 text-gray-600">
                  {property.unitTypes.map((unit, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <span className="w-2 h-2 bg-[#34d399] rounded-full mr-2"></span>
                      {unit.type} (x{unit.quantity}): Ksh {unit.price.toLocaleString()}/mo, Deposit: Ksh {unit.deposit.toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Facilities</h3>
                <ul className="space-y-2 text-gray-600">
                  {property.facilities && property.facilities.length > 0 ? (
                    property.facilities.map((facility, index) => (
                      <li key={index} className="flex items-center text-sm">
                        <span className="w-2 h-2 bg-[#34d399] rounded-full mr-2"></span>
                        {facility}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm">No facilities listed.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Status</h3>
                <span className="text-sm text-gray-600">{property.status}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Advertising</h3>
                <span className="text-sm text-gray-600 flex items-center">
                  {property.isAdvertised ? (
                    <>
                      <Star className="h-5 w-5 mr-2 text-[#34d399]" />
                      Featured (Expires: {property.adExpiration ? new Date(property.adExpiration).toLocaleDateString() : "N/A"})
                    </>
                  ) : (
                    "Not Featured"
                  )}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{property.description || "No description available."}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a8a] mb-3 tracking-tight">Contact Owner</h3>
                {owner ? (
                  <div className="space-y-3 text-gray-600">
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 mr-2 text-[#34d399]" />
                      <a href={`mailto:${owner.email}`} className="text-sm hover:text-[#2563eb] transition-colors duration-200">
                        {owner.email}
                      </a>
                    </div>
                    <div className="flex items-center">
                      <Phone className="h-5 w-5 mr-2 text-[#34d399]" />
                      <a href={`tel:${owner.phone}`} className="text-sm hover:text-[#2563eb] transition-colors duration-200">
                        {owner.phone}
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Contact information not available.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsFullScreen(false)}
          >
            <motion.div
              className="relative max-w-5xl w-full flex flex-col items-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[currentImageIndex]}
                alt={`${property.name} full-screen image ${currentImageIndex + 1}`}
                width={1280}
                height={720}
                className="max-w-full max-h-[65vh] object-contain rounded-xl shadow-lg"
                onError={() => handleImageError()}
              />
              <button
                onClick={() => setIsFullScreen(false)}
                className="absolute top-4 right-4 bg-[#1e3a8a] text-white p-2 rounded-full hover:bg-[#2563eb] transition-colors duration-200"
                aria-label="Close full-screen view"
              >
                <X className="h-5 w-5" />
              </button>
              {!isSingleImage && (
                <div className="flex justify-between items-center w-full max-w-2xl mt-4">
                  <button
                    onClick={handlePrevImage}
                    className="bg-white text-gray-800 p-2 rounded-full shadow-sm hover:bg-gray-100 transition-colors duration-200"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-medium text-white">
                    {currentImageIndex + 1} / {images.length}
                  </span>
                  <button
                    onClick={handleNextImage}
                    className="bg-white text-gray-800 p-2 rounded-full shadow-sm hover:bg-gray-100 transition-colors duration-200"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
              {images.length > 1 && (
                <div className="flex overflow-x-auto gap-3 mt-4 max-w-2xl p-3 bg-black bg-opacity-60 rounded-lg thumbnail-container">
                  {images.map((image, index) => (
                    <motion.button
                      key={index}
                      onClick={() => handleThumbnailClick(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 shadow-sm ${
                        currentImageIndex === index ? "border-[#34d399]" : "border-gray-200"
                      } hover:border-[#2563eb] transition-colors duration-200`}
                      aria-label={`View image ${index + 1}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Image
                        src={image}
                        alt={`${property.name} thumbnail ${index + 1}`}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError()}
                      />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer />
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .thumbnail-container::-webkit-scrollbar {
          height: 6px;
        }
        .thumbnail-container::-webkit-scrollbar-thumb {
          background-color: #4b5e7a;
          border-radius: 4px;
        }
        .thumbnail-container::-webkit-scrollbar-track {
          background: #e5e7eb;
        }
      `}</style>
    </div>
  );
}