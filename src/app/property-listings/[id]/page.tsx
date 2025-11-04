// src/app/property-listings/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, DollarSign, Star, ChevronLeft, ChevronRight, Maximize2, Mail, Phone, X, Menu } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  vacant?: number;
}

interface PropertyListing {
  _id: string;
  name: string;
  address: string;
  unitTypes: UnitType[];
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
  images: string[];
  isAdvertised: boolean;
  adExpiration?: string;
  description?: string;
  facilities?: string[];
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
              Smart Choice Rentals connects property owners with tenants, offering premium rentals with unmatched quality.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4 tracking-tight">Quick Links</h3>
            <ul className="text-sm space-y-3">
              <li><Link href="/" className="hover:text-[#34d399]">Home</Link></li>
              <li><Link href="/property-listings" className="hover:text-[#34d399]">Properties</Link></li>
              <li><Link href="/contact" className="hover:text-[#34d399]">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4 tracking-tight">Contact</h3>
            <p className="text-sm text-gray-200">Email: support@smartchoicemanagement.com</p>
            <p className="text-sm text-gray-200 mt-2">Phone: +254 117 649 850</p>
          </div>
        </div>
        <div className="mt-10 text-center text-sm text-gray-300">
          © {new Date().getFullYear()} Smart Choice Rental Management Ltd.
        </div>
        <div className="mt-2 text-center text-xs text-gray-400">
          Created by <a href="https://vickins-technologies.onrender.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#34d399] underline">Vickins Technologies</a>
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchProperty() {
      try {
        const { id } = await params;
        const res = await fetch(`/api/public-properties/${id}`);
        const data: PropertyResponse = await res.json();
        if (data.success) {
          setProperty(data.property);
          setOwner(data.owner);
        } else {
          setError(data.message || "Property not found");
        }
      } catch (err) {
        setError("Failed to connect");
      } finally {
        setIsLoading(false);
      }
    }
    fetchProperty();
  }, [params]);

  const images = property?.images.length ? property.images : ["/logo.png"];
  const isSingleImage = images.length === 1;

  const handlePrevImage = () => setCurrentImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  const handleNextImage = () => setCurrentImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-10 w-10 border-t-4 border-[#34d399] rounded-full"></div></div>;
  if (error || !property) return <div className="min-h-screen flex items-center justify-center text-red-600 text-xl">{error || "Not found"}</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white py-6 shadow-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Logo" width={48} height={48} />
            <h1 className="text-2xl font-bold text-[#1e3a8a]">Smart Choice Rentals</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden">
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <Link href="/property-listings" className="inline-flex items-center text-[#1e3a8a] hover:text-[#2563eb] mb-8">
          <ChevronLeft className="h-5 w-5 mr-1" /> Back
        </Link>

        <motion.div className="bg-white rounded-2xl shadow-lg p-6 lg:p-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="relative h-80 rounded-xl overflow-hidden">
                <Image src={images[currentImageIndex]} alt="" fill className="object-cover" />
                <button onClick={() => setIsFullScreen(true)} className="absolute bottom-4 right-4 bg-white p-2 rounded-full shadow">
                  <Maximize2 className="h-5 w-5" />
                </button>
                {property.isAdvertised && (
                  <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center">
                    <Star className="h-4 w-4 mr-1" /> Featured
                  </div>
                )}
              </div>
              {!isSingleImage && (
                <div className="flex justify-center gap-2 mt-4">
                  <button onClick={handlePrevImage} className="p-2 bg-white rounded-full shadow"><ChevronLeft /></button>
                  <span className="text-sm">{currentImageIndex + 1} / {images.length}</span>
                  <button onClick={handleNextImage} className="p-2 bg-white rounded-full shadow"><ChevronRight /></button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <h2 className="text-4xl font-bold text-[#1e3a8a]">{property.name}</h2>
              <div className="flex items-center text-gray-600">
                <MapPin className="h-5 w-5 mr-2 text-[#34d399]" />
                <span>{property.address}</span>
              </div>
              <div className="text-2xl font-bold text-[#34d399]">
                Ksh {Math.min(...property.unitTypes.map(u => u.price)).toLocaleString()}/mo
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3">Available Units</h3>
                <ul className="space-y-3">
                  {property.unitTypes.map((u, i) => (
                    <li key={i} className="flex justify-between items-center">
                      <span>{u.type} (x{u.quantity})</span>
                      <span className="text-green-600 font-medium">{u.vacant ?? u.quantity} available</span>
                    </li>
                  ))}
                </ul>
              </div>

              {property.facilities?.length ? (
                <div>
                  <h3 className="text-xl font-semibold mb-3">Facilities</h3>
                  <div className="flex flex-wrap gap-2">
                    {property.facilities.map((f, i) => (
                      <span key={i} className="bg-gray-100 px-3 py-1 rounded-full text-sm">{f}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {property.description && (
                <div>
                  <h3 className="text-xl font-semibold mb-3">Description</h3>
                  <p className="text-gray-600">{property.description}</p>
                </div>
              )}

              <div>
                <h3 className="text-xl font-semibold mb-4">Contact Owner</h3>
                {owner ? (
                  <div className="flex gap-3">
                    <a
                      href={`https://wa.me/${owner.phone.replace(/[^0-9]/g, "")}?text=Hi! I'm interested in ${encodeURIComponent(property.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition shadow-md"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.263c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                      </svg>
                      WhatsApp
                    </a>
                    <a href={`tel:${owner.phone}`} className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md">
                      <Phone className="w-5 h-5" /> Call
                    </a>
                  </div>
                ) : (
                  <p className="text-gray-500">Contact not available</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {isFullScreen && (
          <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4" onClick={() => setIsFullScreen(false)}>
            <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              <Image src={images[currentImageIndex]} alt="" width={1200} height={800} className="w-full h-auto rounded-xl" />
              <button onClick={() => setIsFullScreen(false)} className="absolute top-4 right-4 bg-white p-2 rounded-full">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}