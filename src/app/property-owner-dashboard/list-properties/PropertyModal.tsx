// src/app/property-owner-dashboard/list-properties/PropertyModal.tsx
import React, { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, X, Star, MapPin, DollarSign } from "lucide-react";
import { Listing } from "@/types/property";   // ← Updated to Listing

interface PropertyModalProps {
  property: Listing | null; // ← Updated
  onClose: () => void;
}

export default function PropertyModal({ property, onClose }: PropertyModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (!property) return null;

  const images = property.images?.length ? property.images : ["/logo.png"];
  const isSingleImage = images.length === 1;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-600 hover:text-gray-900 z-10"
            aria-label="Close modal"
          >
            <X className="h-7 w-7" />
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="relative">
              <motion.div
                key={currentImageIndex}
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                className="relative h-72 sm:h-96 lg:h-[28rem] rounded-xl overflow-hidden shadow-lg"
              >
                <Image
                  src={images[currentImageIndex]}
                  alt={`${property.name} image ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover"
                  width={800}
                  height={600}
                  priority={currentImageIndex === 0}
                  placeholder="blur"
                  blurDataURL="/logo.png"
                />
                <button
                  onClick={() => setIsFullScreen(true)}
                  className="absolute bottom-4 right-4 bg-primary text-white p-2.5 rounded-full hover:bg-primary-hover transition shadow-md"
                  aria-label="Full screen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </motion.div>

              {!isSingleImage && (
                <div className="flex justify-between mt-5">
                  <button
                    onClick={handlePrevImage}
                    className="bg-white text-gray-800 p-2.5 rounded-full shadow hover:bg-gray-100 transition"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="bg-white text-gray-800 p-2.5 rounded-full shadow hover:bg-gray-100 transition"
                    aria-label="Next"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <h2 className="text-3xl font-bold text-primary">{property.name}</h2>
              <div className="flex items-center text-gray-700">
                <MapPin className="h-5 w-5 mr-2 text-primary" />
                <span>{property.address}</span>
              </div>
              <div className="flex items-center text-gray-700">
                <DollarSign className="h-5 w-5 mr-2 text-primary" />
                <span>
                  Starting from Ksh{" "}
                  {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()} /mo
                </span>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Available Units</h3>
                <ul className="space-y-2 text-gray-700">
                  {property.unitTypes.map((unit, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {unit.type} (x{unit.vacant ?? 0})
                      </span>
                      <span className="font-medium">
                        Ksh {unit.price.toLocaleString()}/mo
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Facilities</h3>
                <div className="flex flex-wrap gap-2">
                  {property.facilities?.length ? (
                    property.facilities.map((f, i) => (
                      <span
                        key={i}
                        className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                      >
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">None listed</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium text-primary">Status:</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    property.status === "Active" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {property.status}
                </span>
              </div>

              {property.isAdvertised && (
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm">
                    Featured until{" "}
                    {property.adExpiration ? new Date(property.adExpiration).toLocaleDateString() : "N/A"}
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Description</h3>
                <p className="text-gray-700">
                  {property.description || "No description available."}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsFullScreen(false)}
          >
            <motion.div
              className="relative max-w-6xl w-full"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[currentImageIndex]}
                alt="Full-screen"
                width={1600}
                height={900}
                className="max-w-full max-h-[85vh] object-contain rounded-xl"
                priority
              />
              <button
                onClick={() => setIsFullScreen(false)}
                className="absolute top-5 right-5 bg-primary text-white p-3 rounded-full hover:bg-primary-hover"
              >
                <X className="h-6 w-6" />
              </button>
              {!isSingleImage && (
                <div className="absolute bottom-5 left-5 right-5 flex justify-between">
                  <button
                    onClick={handlePrevImage}
                    className="bg-white text-gray-800 p-3 rounded-full shadow-lg"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="bg-white text-gray-800 p-3 rounded-full shadow-lg"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}



