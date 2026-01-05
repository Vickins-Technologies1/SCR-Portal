"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Image from "next/image";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import {
  Home,
  Pencil,
  Trash2,
  Plus,
  ArrowUpDown,
  MapPin,
  DollarSign,
  Star,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Building2,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface UnitType {
  type: string;
  price: number;
  deposit: number;
  quantity: number;
  vacant?: number;
}

interface Property {
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
  ownerId: string;
  description?: string;
  facilities?: string[];
}

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

  const images =
    property.images && property.images.length > 0
      ? property.images
      : ["/logo.png"];
  const isSingleImage = images.length === 1;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev > 0 ? prev - 1 : images.length - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev < images.length - 1 ? prev + 1 : 0
    );
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
            {/* Image Section */}
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
                  className="absolute bottom-4 right-4 bg-[#012a4a] text-white p-2.5 rounded-full hover:bg-[#014a7a] transition shadow-md"
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

            {/* Details */}
            <div className="space-y-5">
              <h2 className="text-3xl font-bold text-[#012a4a]">{property.name}</h2>
              <div className="flex items-center text-gray-700">
                <MapPin className="h-5 w-5 mr-2 text-[#012a4a]" />
                <span>{property.address}</span>
              </div>
              <div className="flex items-center text-gray-700">
                <DollarSign className="h-5 w-5 mr-2 text-[#012a4a]" />
                <span>
                  Starting from Ksh{" "}
                  {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()}{" "}
                  /mo
                </span>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">
                  Available Units
                </h3>
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
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">
                  Facilities
                </h3>
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
                <span className="font-medium text-[#012a4a]">Status:</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    property.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
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
                    {property.adExpiration
                      ? new Date(property.adExpiration).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-[#012a4a] mb-2">
                  Description
                </h3>
                <p className="text-gray-700">
                  {property.description || "No description available."}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Fullscreen */}
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
                className="absolute top-5 right-5 bg-[#012a4a] text-white p-3 rounded-full hover:bg-[#014a7a]"
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
};

export default function ListPropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"list" | "edit">("list");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);

  // Form state
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [isAdvertised, setIsAdvertised] = useState(false);
  const [description, setDescription] = useState("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "createdAt",
    direction: "desc",
  });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Original properties (with accurate vacant counts)
  const [originalProperties, setOriginalProperties] = useState<Property[]>([]);
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  // Validate form
  useEffect(() => {
    const errors: Record<string, string> = {};
    if (modalMode === "list" && !selectedPropertyId)
      errors.property = "Please select a property to list";
    if (description.length > 500)
      errors.description = "Description cannot exceed 500 characters";
    if (facilities.length > 10)
      errors.facilities = "Maximum 10 facilities allowed";
    if (modalMode === "list" && imagePreviews.length === 0)
      errors.images = "At least one image is required";
    if (imagePreviews.length > 10)
      errors.images = "Maximum 10 images allowed";

    setFormErrors(errors);
  }, [
    modalMode,
    selectedPropertyId,
    description,
    facilities,
    imagePreviews,
  ]);

  // Auth & CSRF
  useEffect(() => {
    const uid = Cookies.get("userId") ?? null;
    const userRole = Cookies.get("role") ?? null;

    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      setTimeout(() => router.push("/"), 2000);
      return;
    }

    setUserId(uid);
    setRole(userRole);

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success) setCsrfToken(data.csrfToken);
      } catch {
        setError("Failed to fetch CSRF token.");
      }
    };
    fetchCsrf();
  }, [router]);

  // Fetch listings (public listed properties)
  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/list-properties?userId=${userId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const props = (data.properties || []).map((p: any) => ({
          ...p,
          unitTypes: p.unitTypes.map((u: any) => ({
            ...u,
            vacant: u.vacant ?? u.quantity, // fallback if vacant not provided
          })),
        }));
        setProperties(props);
      }
    } catch {
      setError("Failed to load listings.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch original properties with accurate vacant calculation
  const fetchOriginalProperties = useCallback(async () => {
    if (!userId) return;
    setLoadingOriginal(true);
    try {
      const res = await fetch(`/api/properties?ownerId=${userId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const props = data.properties || [];
        const withVacant = await Promise.all(
          props.map(async (prop: any) => {
            const tenantsRes = await fetch(
              `/api/tenants?propertyId=${prop._id}`,
              { credentials: "include" }
            );
            const tenantsData = await tenantsRes.json();
            const activeTenants = (tenantsData.tenants || []).filter(
              (t: any) => t.status === "active"
            ).length;

            // Distribute occupied units across types (simple: total occupied)
            // For more accuracy, group by unitType if needed
            const totalUnits = prop.unitTypes.reduce(
              (sum: number, u: any) => sum + u.quantity,
              0
            );
            const totalVacant = Math.max(0, totalUnits - activeTenants);

            // Simple proportional distribution or set vacant per type if possible
            // Here: update each type's vacant = quantity - estimated occupied
            // For simplicity, we'll set vacant based on total, but better to count per type
            // Assuming backend can be adjusted, but to make it accurate:
            // Let's count tenants per unitType
            const tenantsByType = (tenantsData.tenants || []).reduce(
              (acc: Record<string, number>, t: any) => {
                if (t.status === "active") {
                  acc[t.unitType] = (acc[t.unitType] || 0) + 1;
                }
                return acc;
              },
              {}
            );

            const unitTypes = prop.unitTypes.map((u: any) => ({
              ...u,
              vacant: Math.max(0, u.quantity - (tenantsByType[u.type] || 0)),
            }));

            return { ...prop, unitTypes };
          })
        );
        setOriginalProperties(withVacant);
      }
    } catch (err) {
      console.error("Failed to load original properties", err);
    } finally {
      setLoadingOriginal(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchProperties();
      fetchOriginalProperties();
    }
  }, [userId, role, fetchProperties, fetchOriginalProperties]);

  const resetForm = useCallback(() => {
    setSelectedPropertyId("");
    setIsAdvertised(false);
    setDescription("");
    setFacilities([]);
    setImages([]);
    setImagePreviews([]);
    setImageUploadError(null);
    setFormErrors({});
  }, []);

  const openListModal = useCallback(() => {
    resetForm();
    setModalMode("list");
    setIsModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback((property: Property) => {
    setModalMode("edit");
    setEditingPropertyId(property._id);
    setSelectedPropertyId(property._id);
    setIsAdvertised(property.isAdvertised);
    setDescription(property.description || "");
    setFacilities(property.facilities || []);
    setImagePreviews(property.images || []);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPropertyToDelete(id);
    setIsDeleteModalOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!propertyToDelete || !csrfToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/list-properties?id=${propertyToDelete}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Listing removed successfully.");
        fetchProperties();
      }
    } catch {
      setError("Failed to delete.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setPropertyToDelete(null);
    }
  }, [propertyToDelete, csrfToken, fetchProperties]);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const valid: File[] = [];
      const err: string[] = [];

      files.forEach((f) => {
        if (!["image/jpeg", "image/png"].includes(f.type))
          err.push(`${f.name}: JPEG/PNG only`);
        else if (f.size > 5 * 1024 * 1024)
          err.push(`${f.name}: Max 5MB`);
        else valid.push(f);
      });

      const total = valid.length + imagePreviews.length;
      if (total > 10) {
        err.push("Max 10 images");
        valid.splice(10 - imagePreviews.length);
      }

      setImages((p) => [...p, ...valid]);
      setImagePreviews((p) => [
        ...p,
        ...valid.map((f) => URL.createObjectURL(f)),
      ]);
      setImageUploadError(err.join("; ") || null);
    },
    [imagePreviews]
  );

  const removeImage = useCallback((idx: number) => {
    setImages((p) => p.filter((_, i) => i !== idx - (imagePreviews.length - p.length)));
    setImagePreviews((p) => {
      const url = p[idx];
      if (idx >= p.length - images.length) URL.revokeObjectURL(url);
      return p.filter((_, i) => i !== idx);
    });
  }, [imagePreviews, images]);

  const uploadImages = async (files: File[]): Promise<string[]> => {
    if (!csrfToken || files.length === 0) throw new Error("No files or token");
    const form = new FormData();
    files.forEach((f) => form.append("images", f));
    const res = await fetch("/api/upload", {
      method: "POST",
      body: form,
      headers: { "X-CSRF-Token": csrfToken },
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.urls;
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (Object.keys(formErrors).length > 0) return;

      setIsLoading(true);
      setIsUploading(true);
      try {
        let finalImages = imagePreviews;
        if (images.length > 0) {
          const uploaded = await uploadImages(images);
          finalImages = modalMode === "edit" ? [...imagePreviews, ...uploaded] : uploaded;
        }

        const payload: any = {
          isAdvertised,
          description: description.trim() || undefined,
          facilities,
          images: finalImages,
        };

        if (modalMode === "list") {
          payload.originalPropertyId = selectedPropertyId;
        } else {
          payload._id = editingPropertyId;
        }

        const url = "/api/list-properties";
        const method = modalMode === "list" ? "POST" : "PUT";

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken!,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          setSuccessMessage(
            modalMode === "list"
              ? "Property listed successfully!"
              : "Listing updated!"
          );
          setIsModalOpen(false);
          resetForm();
          fetchProperties();
        } else {
          setError(data.message);
        }
      } catch (err: any) {
        setError(err.message || "Failed to submit.");
      } finally {
        setIsLoading(false);
        setIsUploading(false);
      }
    },
    [
      formErrors,
      csrfToken,
      modalMode,
      selectedPropertyId,
      editingPropertyId,
      isAdvertised,
      description,
      facilities,
      images,
      imagePreviews,
      resetForm,
      fetchProperties,
    ]
  );

  const sortedProperties = useMemo(() => {
    const sorted = [...properties];
    sorted.sort((a, b) => {
      const key = sortConfig.key;
      const dir = sortConfig.direction === "asc" ? 1 : -1;
      if (key === "createdAt")
        return dir * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
      return dir * a[key].localeCompare(b[key]);
    });
    return sorted;
  }, [properties, sortConfig]);

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((c) => ({
      key,
      direction: c.key === key && c.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (key: SortConfig["key"]) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 py-10 lg:px-12">
          <motion.div
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <Home className="text-[#012a4a]" />
              Property Listings
            </h1>
            <button
              onClick={openListModal}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white rounded-xl shadow-md hover:shadow-lg transition-all font-medium"
            >
              <Plus className="h-5 w-5" />
              List Property
            </button>
          </motion.div>

          {error && (
            <motion.div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 shadow-sm">
              {error}
            </motion.div>
          )}
          {successMessage && (
            <motion.div className="bg-green-50 text-green-700 p-4 rounded-xl mb-6 shadow-sm flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {successMessage}
            </motion.div>
          )}

          {/* Responsive Table */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#012a4a]"></div>
            </div>
          ) : sortedProperties.length === 0 ? (
            <motion.div className="text-center py-20 text-slate-500">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">No listings yet. Start by listing a property!</p>
            </motion.div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block bg-white rounded-2xl shadow-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <tr>
                      {(["name", "address", "status", "createdAt"] as const).map((k) => (
                        <th
                          key={k}
                          className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition"
                          onClick={() => handleSort(k)}
                        >
                          {k === "name"
                            ? "Property"
                            : k === "address"
                            ? "Location"
                            : k === "status"
                            ? "Status"
                            : "Listed On"}{" "}
                          {getSortIcon(k)}
                        </th>
                      ))}
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">
                        Available Units
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedProperties.map((p, i) => (
                      <motion.tr
                        key={p._id}
                        className="hover:bg-slate-50 transition cursor-pointer"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => setSelectedProperty(p)}
                      >
                        <td className="px-6 py-4 font-medium text-slate-800">{p.name}</td>
                        <td className="px-6 py-4 text-slate-600 max-w-xs truncate">{p.address}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              p.status === "Active"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {p.unitTypes
                            .map((u) => `${u.type} (x${u.vacant ?? 0})`)
                            .join(", ")}
                        </td>
                        <td
                          className="px-6 py-4 flex gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEditModal(p)}
                            className="text-[#012a4a] hover:text-[#014a7a] transition p-2 rounded-lg hover:bg-blue-50"
                            title="Edit"
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p._id)}
                            className="text-red-600 hover:text-red-800 transition p-2 rounded-lg hover:bg-red-50"
                            title="Remove"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4">
                {sortedProperties.map((p, i) => (
                  <motion.div
                    key={p._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300"
                    onClick={() => setSelectedProperty(p)}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-lg font-bold text-slate-800">{p.name}</h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            p.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>

                      <div className="space-y-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-[#012a4a]" />
                          <span className="truncate">{p.address}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-[#012a4a]" />
                          <span>
                            From Ksh{" "}
                            {Math.min(...p.unitTypes.map((u) => u.price)).toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <p className="font-medium text-slate-700 mb-1">Available Units:</p>
                          <div className="flex flex-wrap gap-2">
                            {p.unitTypes.map((u, idx) => (
                              <span
                                key={idx}
                                className="bg-blue-50 text-[#012a4a] px-2.5 py-1 rounded-md text-xs font-medium"
                              >
                                {u.type} (x{u.vacant ?? 0})
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="text-xs text-slate-500">
                          Listed on {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div
                      className="bg-gradient-to-r from-slate-50 to-slate-100 px-5 py-3 flex justify-end gap-3 border-t border-slate-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openEditModal(p)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm font-medium"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p._id)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <Modal
            title={modalMode === "list" ? "List Property" : "Edit Listing"}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              resetForm();
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {modalMode === "list" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Property to List
                  </label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition"
                    required
                  >
                    <option value="">Choose a property...</option>
                    {originalProperties.map((prop) => (
                      <option key={prop._id} value={prop._id}>
                        {prop.name} – {prop.address} (
                        {prop.unitTypes
                          .map((u) => `${u.type}: x${u.vacant ?? u.quantity}`)
                          .join(", ")}
                        )
                      </option>
                    ))}
                  </select>
                  {formErrors.property && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.property}</p>
                  )}
                </div>
              )}

              {/* Rest of the form remains unchanged... */}
              {/* (Description, Facilities, Images, Advertise checkbox, buttons) */}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Highlight features..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">{description.length}/500</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Facilities (Up to 10)
                </label>
                <select
                  multiple
                  value={facilities}
                  onChange={(e) =>
                    setFacilities(
                      Array.from(e.target.selectedOptions).map((o) => o.value)
                    )
                  }
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#012a4a] h-40"
                >
                  {FACILITIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 mt-3">
                  {facilities.map((f) => (
                    <span
                      key={f}
                      className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm flex items-center gap-1"
                    >
                      {f}
                      <button
                        type="button"
                        onClick={() => setFacilities((p) => p.filter((x) => x !== f))}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Images (Max 10)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png"
                  onChange={handleImageChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-[#012a4a] file:text-white hover:file:bg-[#014a7a]"
                />
                {imagePreviews.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4">
                    {imagePreviews.map((url, i) => (
                      <div key={i} className="relative group">
                        <Image
                          src={url}
                          alt=""
                          width={120}
                          height={120}
                          className="rounded-lg object-cover w-full h-28 shadow"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {formErrors.images && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.images}</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isAdvertised}
                  onChange={(e) => setIsAdvertised(e.target.checked)}
                  className="h-5 w-5 text-[#012a4a] rounded focus:ring-[#012a4a]"
                />
                <label className="ml-3 text-sm font-medium text-slate-700">
                  Feature this listing (30-day ad)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || isUploading || Object.keys(formErrors).length > 0}
                  className="px-6 py-3 bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white rounded-xl shadow-md hover:shadow-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {(isLoading || isUploading) && (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                  )}
                  {modalMode === "list" ? "List Property" : "Update Listing"}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {isDeleteModalOpen && (
          <Modal title="Remove Listing" isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
            <p className="mb-6 text-slate-700">
              This will remove the public listing. The original property remains.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-5 py-2 bg-slate-200 rounded-lg hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </Modal>
        )}

        {selectedProperty && (
          <PropertyModal property={selectedProperty} onClose={() => setSelectedProperty(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}