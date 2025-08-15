"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Home, Pencil, Trash2, Plus, ArrowUpDown, MapPin, DollarSign, Star, ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Property {
  _id: string;
  name: string;
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
  images: string[];
  isAdvertised: boolean;
  adExpiration?: string;
  ownerId: string;
  description?: string;
  facilities?: string[];
}

const UNIT_TYPES = [
  "Single",
  "Bed-Sitter",
  "1-Bedroom",
  "2-Bedroom",
  "3-Bedroom",
  "Duplex",
  "Commercial",
];

const FACILITIES = [
  "Wi-Fi",
  "Parking",
  "Gym",
  "Swimming Pool",
  "Security",
  "Elevator",
  "Air Conditioning",
  "Heating",
  "Balcony",
  "Garden",
];

interface SortConfig {
  key: "name" | "address" | "createdAt" | "status";
  direction: "asc" | "desc";
}

interface PropertyModalProps {
  property: Property | null;
  onClose: () => void;
}

const PropertyModal: React.FC<PropertyModalProps> = ({ property, onClose }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (!property) return null;

  const images = property.images && property.images.length > 0 ? property.images : ["/logo.png"];
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
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 z-10"
            aria-label="Close modal"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative">
              <motion.div
                key={currentImageIndex}
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative h-64 sm:h-80 lg:h-96"
              >
                <Image
                  src={images[currentImageIndex]}
                  alt={`${property.name} image ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                  width={500}
                  height={300}
                  style={{ width: "auto", height: "auto" }}
                  priority={currentImageIndex === 0}
                  placeholder="blur"
                  blurDataURL="/logo.png"
                />
                <button
                  onClick={() => setIsFullScreen(true)}
                  className="absolute bottom-4 right-4 bg-[#012a4a] text-white p-2 rounded-full hover:bg-[#014a7a] transition"
                  aria-label="View full screen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </motion.div>
              {!isSingleImage && (
                <div className="flex justify-between mt-4">
                  <button
                    onClick={handlePrevImage}
                    className="bg-gray-200 text-gray-800 p-2 rounded-full hover:bg-gray-300 transition disabled:opacity-50"
                    disabled={isSingleImage}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="bg-gray-200 text-gray-800 p-2 rounded-full hover:bg-gray-300 transition disabled:opacity-50"
                    disabled={isSingleImage}
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-[#012a4a]">{property.name}</h2>
              <div className="flex items-center text-gray-600">
                <MapPin className="h-5 w-5 mr-2 text-[#012a4a]" />
                <span>{property.address}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <DollarSign className="h-5 w-5 mr-2 text-[#012a4a]" />
                <span>
                  Starting from Ksh {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()} /mo
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Unit Types</h3>
                <ul className="list-disc pl-5 text-gray-600">
                  {property.unitTypes.map((unit, index) => (
                    <li key={index}>
                      {unit.type} (x{unit.quantity}): Ksh {unit.price.toLocaleString()}/mo, Deposit: Ksh {unit.deposit.toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Facilities</h3>
                <ul className="list-disc pl-5 text-gray-600">
                  {property.facilities && property.facilities.length > 0 ? (
                    property.facilities.map((facility, index) => (
                      <li key={index}>{facility}</li>
                    ))
                  ) : (
                    <li>No facilities listed.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Status</h3>
                <span className="text-gray-600">{property.status}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Advertising</h3>
                <span className="text-gray-600 flex items-center">
                  {property.isAdvertised ? (
                    <>
                      <Star className="h-5 w-5 mr-2 text-[#012a4a]" />
                      Featured (Expires: {property.adExpiration ? new Date(property.adExpiration).toLocaleDateString() : "N/A"})
                    </>
                  ) : (
                    "Not Featured"
                  )}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Owner ID</h3>
                <span className="text-gray-600">{property.ownerId}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Created At</h3>
                <span className="text-gray-600">{new Date(property.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Updated At</h3>
                <span className="text-gray-600">{new Date(property.updatedAt).toLocaleDateString()}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">Description</h3>
                <p className="text-gray-600">{property.description || "No description available."}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsFullScreen(false)}
          >
            <motion.div
              className="relative max-w-full max-h-full"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[currentImageIndex]}
                alt={`${property.name} full-screen image ${currentImageIndex + 1}`}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                width={1200}
                height={800}
                style={{ width: "auto", height: "auto" }}
                priority={currentImageIndex === 0}
                placeholder="blur"
                blurDataURL="/logo.png"
              />
              <button
                onClick={() => setIsFullScreen(false)}
                className="absolute top-4 right-4 bg-[#012a4a] text-white p-2 rounded-full hover:bg-[#014a7a] transition"
                aria-label="Close full-screen view"
              >
                <X className="h-5 w-5" />
              </button>
              {!isSingleImage && (
                <div className="absolute bottom-4 left-4 right-4 flex justify-between">
                  <button
                    onClick={handlePrevImage}
                    className="bg-gray-200 text-gray-800 p-2 rounded-full hover:bg-gray-300 transition"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="bg-gray-200 text-gray-800 p-2 rounded-full hover:bg-gray-300 transition"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default function ListPropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [isAdvertised, setIsAdvertised] = useState<boolean>(false);
  const [unitTypes, setUnitTypes] = useState<
    { type: string; price: string; deposit: string; quantity: string }[]
  >([{ type: "", price: "", deposit: "", quantity: "" }]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Validate form dynamically
  useEffect(() => {
    const errors: { [key: string]: string } = {};
    if (!propertyName.trim()) errors.propertyName = "Property name is required";
    if (!address.trim()) errors.address = "Address is required";
    if (description.length > 500) errors.description = "Description cannot exceed 500 characters";
    if (modalMode === "add" && facilities.length === 0) {
      errors.facilities = "At least one facility is required for new properties";
    }
    if (facilities.length > 10) {
      errors.facilities = "Maximum 10 facilities allowed";
    }
    const unitTypeSet = new Set();
    unitTypes.forEach((unit, index) => {
      if (!unit.type || !UNIT_TYPES.includes(unit.type)) {
        errors[`unitType_${index}`] = `Unit type ${index + 1} must be selected from the list`;
      } else if (unitTypeSet.has(unit.type)) {
        errors[`unitType_${index}`] = `Unit type ${index + 1} must be unique`;
      } else {
        unitTypeSet.add(unit.type);
      }
      if (!unit.price || isNaN(parseFloat(unit.price)) || parseFloat(unit.price) < 0) {
        errors[`unitPrice_${index}`] = `Price for unit ${index + 1} must be a non-negative number`;
      }
      if (!unit.deposit || isNaN(parseFloat(unit.deposit)) || parseFloat(unit.deposit) < 0) {
        errors[`unitDeposit_${index}`] = `Deposit for unit ${index + 1} must be a non-negative number`;
      }
      if (!unit.quantity || isNaN(parseInt(unit.quantity)) || parseInt(unit.quantity) < 0) {
        errors[`unitQuantity_${index}`] = `Quantity for unit ${index + 1} must be a non-negative integer`;
      }
    });
    const totalImages = imagePreviews.length;
    if (modalMode === "add" && totalImages === 0) {
      errors.images = "At least one image is required for new properties";
    }
    if (totalImages > 10) {
      errors.images = "Maximum 10 images allowed";
    }
    setFormErrors(errors);
  }, [propertyName, address, description, facilities, unitTypes, imagePreviews, modalMode]);

  useEffect(() => {
    const uid = Cookies.get("userId") ?? null;
    const userRole = Cookies.get("role") ?? null;
    const originalRole = Cookies.get("originalRole") ?? null;
    const originalUserId = Cookies.get("originalUserId") ?? null;

    console.log("Cookies retrieved:", {
      userId: uid ?? "null",
      role: userRole ?? "null",
      originalRole: originalRole ?? "null",
      originalUserId: originalUserId ?? "null",
      documentCookie: document.cookie,
    });

    if (!uid || (userRole !== "propertyOwner" && !(originalRole === "propertyOwner" && originalUserId))) {
      setError("Unauthorized. Please log in as a property owner.");
      console.log(
        `Unauthorized access - userId: ${uid ?? "null"}, role: ${userRole ?? "null"}, originalRole: ${
          originalRole ?? "null"
        }, originalUserId: ${originalUserId ?? "null"}`
      );
      setTimeout(() => router.push("/"), 2000);
      return;
    }

    setUserId(uid);
    setRole(userRole);

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        } else {
          console.error("Failed to fetch CSRF token on mount:", {
            message: data.message || "No token returned",
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
          });
          setError(data.message || "Failed to fetch CSRF token.");
        }
      } catch (err) {
        console.error("CSRF token fetch error:", err instanceof Error ? err.message : "Unknown error");
        setError("Failed to connect to the server for CSRF token.");
      }
    };

    if (uid && userRole === "propertyOwner") {
      fetchCsrf();
    }
  }, [router]);

  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/list-properties?userId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const propertiesWithFacilities = (data.properties || []).map((prop: Property) => ({
          ...prop,
          facilities: prop.facilities || [],
        }));
        setProperties(propertiesWithFacilities);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch (err) {
      console.error("Fetch properties error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchProperties();
    }
  }, [userId, role, fetchProperties]);

  const resetForm = useCallback(() => {
    setPropertyName("");
    setAddress("");
    setDescription("");
    setFacilities([]);
    setStatus("Active");
    setIsAdvertised(false);
    setUnitTypes([{ type: "", price: "", deposit: "", quantity: "" }]);
    setImages([]);
    setImagePreviews([]);
    setImageUploadError(null);
    setFormErrors({});
    setEditingPropertyId(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setModalMode("add");
    setIsModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback(
    (property: Property) => {
      setModalMode("edit");
      setEditingPropertyId(property._id);
      setPropertyName(property.name);
      setAddress(property.address);
      setDescription(property.description || "");
      setFacilities(property.facilities || []);
      setStatus(property.status);
      setIsAdvertised(property.isAdvertised);
      setUnitTypes(
        property.unitTypes.map((u) => ({
          type: u.type,
          price: u.price.toString(),
          deposit: u.deposit.toString(),
          quantity: u.quantity.toString(),
        }))
      );
      setImages([]);
      setImagePreviews(property.images || []);
      setImageUploadError(null);
      setFormErrors({});
      setIsModalOpen(true);
    },
    []
  );

  const handleDelete = useCallback((id: string) => {
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!propertyToDelete || !csrfToken) {
      setError("CSRF token or property ID missing.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/list-properties?id=${propertyToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Property deleted successfully!");
        fetchProperties();
      } else {
        setError(data.message || "Failed to delete property.");
      }
    } catch (err) {
      console.error("Delete property error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setPropertyToDelete(null);
    }
  }, [propertyToDelete, csrfToken, fetchProperties]);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    newFiles.forEach((file) => {
      if (!["image/jpeg", "image/png"].includes(file.type)) {
        errors.push(`${file.name} is not a valid image (JPEG or PNG only)`);
      } else if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name} exceeds 5MB limit`);
      } else {
        validFiles.push(file);
      }
    });

    const totalImages = validFiles.length + imagePreviews.length;
    if (totalImages > 10) {
      errors.push("Maximum 10 images allowed");
      validFiles.splice(10 - imagePreviews.length);
    }

    setImages((prev) => [...prev, ...validFiles]);
    setImagePreviews((prev) => [
      ...prev,
      ...validFiles.map((file) => URL.createObjectURL(file)),
    ]);
    setImageUploadError(errors.join("; ") || null);
  }, [imagePreviews]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const newImages = prev.filter((_, i) => i !== (index - (imagePreviews.length - prev.length)));
      return newImages;
    });
    setImagePreviews((prev) => {
      const newPreviews = prev.filter((_, i) => i !== index);
      if (index >= prev.length - images.length) {
        URL.revokeObjectURL(prev[index]);
      }
      return newPreviews;
    });
    setImageUploadError(null);
  }, [imagePreviews, images]);

  const uploadImages = useCallback(async (files: File[]): Promise<string[]> => {
    if (!csrfToken) {
      throw new Error("CSRF token not available");
    }
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      const data = await res.json();
      if (data.success && data.urls) {
        return Array.isArray(data.urls) ? data.urls : [data.urls];
      } else {
        throw new Error(data.message || "Image upload failed");
      }
    } catch (err) {
      console.error("Image upload error:", err instanceof Error ? err.message : "Unknown error");
      setImageUploadError(err instanceof Error ? err.message : "Failed to upload images");
      throw err;
    }
  }, [csrfToken]);

  const handleFacilitiesChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map((option) => option.value);
    setFacilities(selectedOptions);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (Object.keys(formErrors).length > 0) return;
      if (!userId || !csrfToken) {
        setError("User ID or CSRF token is missing.");
        return;
      }
      setIsLoading(true);
      setIsUploading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        let imageUrls = modalMode === "edit" ? [...imagePreviews] : [];
        if (images.length > 0) {
          const uploadedUrls = await uploadImages(images);
          imageUrls = modalMode === "edit" ? [...imagePreviews, ...uploadedUrls] : uploadedUrls;
        }

        const propertyData = {
          name: propertyName,
          address,
          description: description.trim() || undefined,
          facilities,
          status,
          isAdvertised,
          unitTypes: unitTypes.map((u) => ({
            type: u.type,
            price: parseFloat(u.price) || 0,
            deposit: parseFloat(u.deposit) || 0,
            quantity: parseInt(u.quantity) || 0,
          })),
          ownerId: userId,
          images: imageUrls,
        };

        const url = modalMode === "add" ? "/api/list-properties" : `/api/list-properties`;
        const method = modalMode === "add" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify(method === "PUT" ? { ...propertyData, _id: editingPropertyId } : propertyData),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMessage(`Property ${modalMode === "add" ? "added" : "updated"} successfully!`);
          setIsModalOpen(false);
          resetForm();
          fetchProperties();
        } else {
          setError(data.message || `Failed to ${modalMode === "add" ? "add" : "update"} property.`);
        }
      } catch (err) {
        console.error("Property submit error:", err instanceof Error ? err.message : "Unknown error");
        setError(err instanceof Error ? err.message : "Failed to connect to the server.");
      } finally {
        setIsLoading(false);
        setIsUploading(false);
      }
    },
    [userId, csrfToken, modalMode, editingPropertyId, propertyName, address, description, facilities, status, isAdvertised, unitTypes, images, imagePreviews, fetchProperties, resetForm, formErrors, uploadImages]
  );

  const sortedProperties = useMemo(() => {
    const sorted = [...properties];
    const { key, direction } = sortConfig;
    sorted.sort((a, b) => {
      if (key === "createdAt") {
        return direction === "asc"
          ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
          : new Date(b[key]).getTime() - new Date(a[key]).getTime();
      }
      return direction === "asc"
        ? a[key].localeCompare(b[key])
        : b[key].localeCompare(a[key]);
    });
    return sorted;
  }, [properties, sortConfig]);

  const handleSort = useCallback((key: "name" | "address" | "createdAt" | "status") => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const getSortIcon = useCallback((key: "name" | "address" | "createdAt" | "status") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const addUnitType = useCallback(() => {
    setUnitTypes((prev) => [...prev, { type: "", price: "", deposit: "", quantity: "" }]);
  }, []);

  const updateUnitType = useCallback((index: number, field: string, value: string) => {
    setUnitTypes((prev) =>
      prev.map((unit, i) =>
        i === index ? { ...unit, [field]: value } : unit
      )
    );
  }, []);

  const removeUnitType = useCallback((index: number) => {
    setUnitTypes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <motion.div
            className="flex justify-between items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Home className="text-[#012a4a]" />
              List Properties
            </h1>
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium ${
                isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#012a4a] hover:bg-[#014a7a]"
              }`}
              disabled={isLoading}
              aria-label="Add new property"
            >
              <Plus className="h-5 w-5" />
              Add Property
            </button>
          </motion.div>
          {error && (
            <motion.div
              className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              className="bg-green-100 text-green-700 p-4 mb-4 rounded-lg shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {successMessage}
            </motion.div>
          )}
          {isLoading ? (
            <motion.div
              className="text-center text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading properties...</span>
            </motion.div>
          ) : sortedProperties.length === 0 ? (
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              No properties found. Add a property to get started.
            </motion.div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    {["name", "address", "status", "createdAt"].map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                        onClick={() => handleSort(key as "name" | "address" | "createdAt" | "status")}
                      >
                        {key[0].toUpperCase() + key.slice(1)} {getSortIcon(key as "name" | "address" | "createdAt" | "status")}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left">Unit Types</th>
                    <th className="px-4 py-3 text-left">Facilities</th>
                    <th className="px-4 py-3 text-left">Advertised</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProperties.map((p, index) => (
                    <motion.tr
                      key={p._id}
                      className="border-t hover:bg-gray-50 transition cursor-pointer"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      onClick={() => setSelectedProperty(p)}
                    >
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3">{p.address}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            p.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {p.unitTypes.map((u) => `${u.type} (x${u.quantity})`).join(", ") || "N/A"}
                      </td>
                      <td className="px-4 py-3">
                        {p.facilities && p.facilities.length > 0 ? p.facilities.join(", ") : "None"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            p.isAdvertised ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {p.isAdvertised ? "Yes" : "No"}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-[#012a4a] hover:text-[#014a7a] transition"
                          title="Edit Property"
                          aria-label={`Edit property ${p.name}`}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p._id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete Property"
                          aria-label={`Delete property ${p.name}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AnimatePresence>
            {isModalOpen && (
              <Modal
                title={modalMode === "add" ? "Add Property" : "Edit Property"}
                isOpen={isModalOpen}
                onClose={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Property Name</label>
                    <input
                      placeholder="Enter property name"
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      required
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                        formErrors.propertyName ? "border-red-500" : "border-gray-300"
                      } text-sm sm:text-base`}
                    />
                    {formErrors.propertyName && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.propertyName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <input
                      placeholder="Enter address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                        formErrors.address ? "border-red-500" : "border-gray-300"
                      } text-sm sm:text-base`}
                    />
                    {formErrors.address && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.address}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description (Optional, max 500 characters)</label>
                    <textarea
                      placeholder="Enter property description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                        formErrors.description ? "border-red-500" : "border-gray-300"
                      } text-sm sm:text-base resize-y min-h-[100px]`}
                      rows={4}
                    />
                    <p className="text-xs text-gray-500 mt-1">{description.length}/500 characters</p>
                    {formErrors.description && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Facilities (Select up to 10)</label>
                    <select
                      multiple
                      value={facilities}
                      onChange={handleFacilitiesChange}
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                        formErrors.facilities ? "border-red-500" : "border-gray-300"
                      } text-sm sm:text-base h-32`}
                      aria-multiselectable="true"
                    >
                      {FACILITIES.map((facility) => (
                        <option key={facility} value={facility}>
                          {facility}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple facilities</p>
                    {facilities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {facilities.map((facility, index) => (
                          <span
                            key={index}
                            className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs flex items-center"
                          >
                            {facility}
                            <button
                              type="button"
                              onClick={() => {
                                const newFacilities = facilities.filter((f) => f !== facility);
                                setFacilities(newFacilities);
                              }}
                              className="ml-2 text-red-600 hover:text-red-800"
                              aria-label={`Remove ${facility}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {formErrors.facilities && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.facilities}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Images (Max 10, JPEG/PNG, 5MB each)</label>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png"
                      onChange={handleImageChange}
                      className="mt-1 w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition border-gray-300 text-sm sm:text-base"
                      disabled={isUploading}
                    />
                    {imagePreviews.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative">
                            <Image
                              src={preview}
                              alt={`Preview ${index + 1}`}
                              className="h-24 w-full object-cover rounded-lg"
                              width={200}
                              height={96}
                              style={{ width: "auto", height: "auto" }}
                              placeholder="blur"
                              blurDataURL="/logo.png"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full hover:bg-red-700 transition"
                              aria-label={`Remove image ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {formErrors.images && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.images}</p>
                    )}
                    {imageUploadError && (
                      <p className="text-red-500 text-xs mt-1">{imageUploadError}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "Active" | "Inactive")}
                      className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition border-gray-300 text-sm sm:text-base"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Advertise Property</label>
                    <div className="mt-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={isAdvertised}
                        onChange={(e) => setIsAdvertised(e.target.checked)}
                        className="h-4 w-4 text-[#012a4a] focus:ring-[#012a4a] border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-600">Advertise this property on the landing page</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unit Types</label>
                    {unitTypes.map((unit, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4 sm:mb-2"
                      >
                        <select
                          value={unit.type}
                          onChange={(e) => updateUnitType(index, "type", e.target.value)}
                          className={`w-full sm:flex-1 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                            formErrors[`unitType_${index}`] ? "border-red-500" : "border-gray-300"
                          } text-sm sm:text-base`}
                        >
                          <option value="" disabled>
                            Select unit type
                          </option>
                          {UNIT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Price (Ksh/month)"
                          value={unit.price}
                          onChange={(e) => updateUnitType(index, "price", e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-full sm:w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                            formErrors[`unitPrice_${index}`] ? "border-red-500" : "border-gray-300"
                          } text-sm sm:text-base`}
                        />
                        <input
                          placeholder="Deposit (Ksh)"
                          value={unit.deposit}
                          onChange={(e) => updateUnitType(index, "deposit", e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-full sm:w-24 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                            formErrors[`unitDeposit_${index}`] ? "border-red-500" : "border-gray-300"
                          } text-sm sm:text-base`}
                        />
                        <input
                          placeholder="Quantity"
                          value={unit.quantity}
                          onChange={(e) => updateUnitType(index, "quantity", e.target.value)}
                          type="number"
                          min="0"
                          step="1"
                          className={`w-full sm:w-20 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition ${
                            formErrors[`unitQuantity_${index}`] ? "border-red-500" : "border-gray-300"
                          } text-sm sm:text-base`}
                        />
                        {unitTypes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeUnitType(index)}
                            className="text-red-600 hover:text-red-800 transition self-start sm:self-center"
                            aria-label={`Remove unit type ${index + 1}`}
                          >
                            <Trash2 className="h-6 w-6 sm:h-5 sm:w-5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {unitTypes.map((_, index) => (
                      <div key={index} className="space-y-1">
                        {formErrors[`unitType_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitType_${index}`]}</p>
                        )}
                        {formErrors[`unitPrice_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitPrice_${index}`]}</p>
                        )}
                        {formErrors[`unitDeposit_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitDeposit_${index}`]}</p>
                        )}
                        {formErrors[`unitQuantity_${index}`] && (
                          <p className="text-red-500 text-xs">{formErrors[`unitQuantity_${index}`]}</p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addUnitType}
                      className="text-[#012a4a] hover:text-[#014a7a] transition text-sm"
                      aria-label="Add another unit type"
                    >
                      + Add Unit Type
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        resetForm();
                      }}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                      aria-label="Cancel property form"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || isUploading || Object.keys(formErrors).length > 0 || !csrfToken}
                      className={`px-4 py-2 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm sm:text-base ${
                        isLoading || isUploading || Object.keys(formErrors).length > 0 || !csrfToken
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-[#012a4a] hover:bg-[#014a7a]"
                      }`}
                      aria-label={modalMode === "add" ? "Add property" : "Update property"}
                    >
                      {(isLoading || isUploading) && (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                      )}
                      {modalMode === "add" ? "Add Property" : "Update Property"}
                    </button>
                  </div>
                </form>
              </Modal>
            )}
            {isDeleteModalOpen && (
              <Modal
                title="Confirm Delete"
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
              >
                <p className="mb-6 text-gray-700 text-sm sm:text-base">
                  Are you sure you want to delete this property? This action cannot be undone.
                </p>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                    aria-label="Cancel delete property"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm sm:text-base"
                    aria-label="Confirm delete property"
                    disabled={!csrfToken}
                  >
                    Delete
                  </button>
                </div>
              </Modal>
            )}
            {selectedProperty && (
              <PropertyModal property={selectedProperty} onClose={() => setSelectedProperty(null)} />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}