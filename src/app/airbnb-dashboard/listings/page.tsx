"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Home,
  Sparkles,
  AlertTriangle,
  GripVertical,
  ImagePlus,
  Trash2,
  X,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbListing } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

export default function AirbnbListingsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("properties:view");
  const [listings, setListings] = useState<AirbnbListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageItems, setImageItems] = useState<
    Array<{ id: string; url: string; file?: File }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    location: "",
    status: "draft",
    units: 1,
    baseRate: 0,
    weekendRate: 0,
    amenities: "",
    houseRules: "",
    licenseStatus: "missing",
    description: "",
  });

  const maxImages = 10;

  const imageCountLabel = useMemo(
    () => `${imageItems.length}/${maxImages} images`,
    [imageItems.length]
  );

  const fetchListings = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/listings?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setListings(data.listings || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchListings();
    }
  }, [hasAccess, fetchListings]);

  const createImageId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `img-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const revokeImageUrl = (url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const resetImageItems = useCallback((next: Array<{ id: string; url: string; file?: File }> = []) => {
    imageItems.forEach((item) => revokeImageUrl(item.url));
    setImageItems(next);
    setImageError(null);
  }, [imageItems]);

  const appendFiles = (files: File[]) => {
    if (!files.length) return;
    const valid: File[] = [];
    const errors: string[] = [];

    files.forEach((file) => {
      if (!["image/jpeg", "image/png"].includes(file.type)) {
        errors.push(`${file.name}: JPEG or PNG only`);
      } else if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: Max 5MB`);
      } else {
        valid.push(file);
      }
    });

    const remainingSlots = maxImages - imageItems.length;
    const allowedFiles = valid.slice(0, Math.max(0, remainingSlots));

    if (valid.length > remainingSlots) {
      errors.push(`Only ${maxImages} images allowed.`);
    }

    if (errors.length > 0) {
      setImageError(errors.join(" "));
    } else {
      setImageError(null);
    }

    if (allowedFiles.length > 0) {
      setImageItems((prev) => [
        ...prev,
        ...allowedFiles.map((file) => ({
          id: createImageId(),
          url: URL.createObjectURL(file),
          file,
        })),
      ]);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    appendFiles(files);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files || []);
    appendFiles(files);
  };

  const handleRemoveImage = (index: number) => {
    setImageItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) revokeImageUrl(removed.url);
      return next;
    });
  };

  const reorderImages = (from: number, to: number) => {
    if (from === to) return;
    setImageItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const uploadListingImages = async (files: File[]) => {
    if (!csrfToken || files.length === 0) return [];
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      headers: { "X-CSRF-Token": csrfToken },
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to upload images");
    }
    return data.urls || [];
  };

  const openCreateModal = () => {
    setForm({
      id: "",
      name: "",
      location: "",
      status: "draft",
      units: 1,
      baseRate: 0,
      weekendRate: 0,
      amenities: "",
      houseRules: "",
      licenseStatus: "missing",
      description: "",
    });
    resetImageItems([]);
    setFormMessage(null);
    setShowModal(true);
  };

  const openEditModal = (listing: AirbnbListing) => {
    setForm({
      id: listing.id,
      name: listing.name,
      location: listing.location,
      status: listing.status,
      units: listing.units,
      baseRate: listing.baseRate,
      weekendRate: listing.weekendRate,
      amenities: listing.amenities.join(", "),
      houseRules: listing.houseRules.join(", "),
      licenseStatus: listing.licenseStatus,
      description: listing.description || "",
    });
    resetImageItems(
      (listing.images || []).map((url) => ({
        id: createImageId(),
        url,
      }))
    );
    setFormMessage(null);
    setShowModal(true);
  };

  const handleSaveListing = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh the page and try again.");
      return;
    }

    if (!form.name.trim() || !form.location.trim()) {
      setFormMessage("Listing name and location are required.");
      return;
    }

    if (imageItems.length > maxImages) {
      setFormMessage(`Only ${maxImages} images are allowed.`);
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const newFiles = imageItems.filter((item) => item.file).map((item) => item.file!) as File[];
      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) {
        setIsUploadingImages(true);
        uploadedUrls = await uploadListingImages(newFiles);
        setIsUploadingImages(false);
      }

      let uploadIndex = 0;
      const finalImages = imageItems.map((item) => {
        if (item.file) {
          const nextUrl = uploadedUrls[uploadIndex];
          uploadIndex += 1;
          return nextUrl || item.url;
        }
        return item.url;
      });

      const payload = {
        id: form.id || undefined,
        name: form.name.trim(),
        location: form.location.trim(),
        status: form.status,
        units: Number(form.units || 1),
        baseRate: Number(form.baseRate || 0),
        weekendRate: Number(form.weekendRate || 0),
        amenities: form.amenities
          ? form.amenities.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        houseRules: form.houseRules
          ? form.houseRules.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        licenseStatus: form.licenseStatus,
        description: form.description?.trim() || "",
        images: finalImages,
      };

      const res = await fetch("/api/airbnb/listings", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save listing");
      }

      setFormMessage("Listing saved successfully.");
      resetImageItems([]);
      setShowModal(false);
      await fetchListings();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to save listing");
    } finally {
      setIsSaving(false);
      setIsUploadingImages(false);
    }
  };

  if (hasAccess === false) {
    return (
      <div className="min-h-[100svh] bg-background text-foreground">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="surface-card rounded-3xl p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-foreground">Access restricted</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your account does not have permission to view listings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Listings Management"
            subtitle="Publish, optimize, and manage Airbnb-ready listings with Kenya-ready details built-in."
            icon={Home}
            actions={
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <Sparkles size={16} />
                Add listing
              </button>
            }
          />

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded-lg w-36 mb-4" />
                  <div className="h-8 bg-gray-300 rounded-xl w-2/3" />
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="surface-card rounded-3xl p-6 text-xs text-muted-foreground">
              No listings yet. Add a listing to start managing availability.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {listings.map((listing) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="surface-card rounded-3xl p-6 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground line-clamp-1">
                        {listing.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{listing.location}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        listing.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : listing.status === "paused"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {listing.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl bg-primary/10 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Base rate</p>
                      <p className="font-semibold text-foreground">{formatKes(listing.baseRate)}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Weekend</p>
                      <p className="font-semibold text-foreground">{formatKes(listing.weekendRate)}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Occupancy</p>
                      <p className="font-semibold text-foreground">{listing.occupancyRate}%</p>
                    </div>
                    <div className="rounded-2xl bg-purple-100/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rating</p>
                      <p className="font-semibold text-foreground">{listing.rating} ★</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Amenities
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {listing.amenities.length === 0 ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                          No amenities set
                        </span>
                      ) : (
                        listing.amenities.slice(0, 3).map((amenity) => (
                          <span
                            key={amenity}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"
                          >
                            {amenity}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {listing.lastSyncedAt
                        ? `Last updated ${new Date(listing.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : "No recent updates"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        listing.licenseStatus === "valid"
                          ? "bg-emerald-100 text-emerald-700"
                          : listing.licenseStatus === "due"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {listing.licenseStatus} license
                    </span>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => openEditModal(listing)}
                      className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
                    >
                      Edit listing
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel flex w-full max-w-2xl flex-col overflow-hidden max-h-[92vh] sm:max-h-[88vh]">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {form.id ? "Edit listing" : "Add listing"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Update Airbnb-ready details and pricing.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      resetImageItems([]);
                      setShowModal(false);
                    }}
                    className="modal-close rounded-full p-1"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body modal-stagger flex-1 min-h-0 space-y-4 overflow-y-auto px-5 pb-5">
                  {formMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {formMessage}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Listing name</label>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Location</label>
                      <input
                        value={form.location}
                        onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
                      <select
                        value={form.status}
                        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Units</label>
                      <input
                        type="number"
                        min={1}
                        value={form.units}
                        onChange={(event) => setForm((prev) => ({ ...prev, units: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Base rate (KES)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.baseRate}
                        onChange={(event) => setForm((prev) => ({ ...prev, baseRate: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Weekend rate (KES)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.weekendRate}
                        onChange={(event) => setForm((prev) => ({ ...prev, weekendRate: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Amenities (comma separated)
                      </label>
                      <input
                        value={form.amenities}
                        onChange={(event) => setForm((prev) => ({ ...prev, amenities: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        House rules (comma separated)
                      </label>
                      <input
                        value={form.houseRules}
                        onChange={(event) => setForm((prev) => ({ ...prev, houseRules: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Description
                      </label>
                      <textarea
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        rows={4}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Describe the stay, highlights, nearby landmarks..."
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">License status</label>
                      <select
                        value={form.licenseStatus}
                        onChange={(event) => setForm((prev) => ({ ...prev, licenseStatus: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                      >
                        <option value="valid">Valid</option>
                        <option value="due">Due</option>
                        <option value="missing">Missing</option>
                      </select>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-border bg-white/70 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Listing photos</p>
                        <p className="text-[11px] text-muted-foreground">
                          Drag & drop, reorder, or upload up to {maxImages} high-res images.
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                        {imageCountLabel}
                      </span>
                    </div>
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDraggingFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingFiles(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                        isDraggingFiles ? "border-primary/60 bg-primary/5" : "border-border bg-white/80"
                      }`}
                    >
                      <ImagePlus className="h-8 w-8 text-primary mb-2" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Click to upload</span> or drag images here
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        JPEG/PNG • Max 5MB each • Reorder by dragging
                      </p>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        onChange={handleFileInput}
                        ref={fileInputRef}
                      />
                    </div>
                    {imageError && (
                      <p className="mt-3 text-[11px] text-amber-700">{imageError}</p>
                    )}
                    {imageItems.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {imageItems.map((item, index) => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={() => setDragIndex(index)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragOverIndex(index);
                            }}
                            onDrop={() => {
                              if (dragIndex !== null) {
                                reorderImages(dragIndex, index);
                                setDragIndex(null);
                                setDragOverIndex(null);
                              }
                            }}
                            onDragEnd={() => {
                              setDragIndex(null);
                              setDragOverIndex(null);
                            }}
                            className={`group relative overflow-hidden rounded-2xl border ${
                              dragOverIndex === index ? "border-primary/60" : "border-border"
                            } bg-white`}
                          >
                            <Image
                              src={item.url}
                              alt={`Listing image ${index + 1}`}
                              width={220}
                              height={160}
                              className="h-32 w-full object-cover"
                              unoptimized
                            />
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/40 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                              <span className="flex items-center gap-1">
                                <GripVertical size={12} />
                                Drag
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(index)}
                                className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold"
                              >
                                <Trash2 size={12} />
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        resetImageItems([]);
                        setShowModal(false);
                      }}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveListing}
                      disabled={isSaving || isUploadingImages}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSaving || isUploadingImages ? "Saving..." : "Save listing"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
