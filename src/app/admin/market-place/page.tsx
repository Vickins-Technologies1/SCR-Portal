"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Building2,
  Edit,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

type ListingStatus = "published" | "draft" | "sold";

interface SaleListing {
  _id: string;
  name: string;
  address: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  interiorSizeSqft?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  price: number;
  currency: string;
  amenities: string[];
  images: string[];
  status: ListingStatus;
  isFeatured: boolean;
  contactEmail?: string;
  contactPhone?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ApiListResponse {
  success: boolean;
  listings?: SaleListing[];
  message?: string;
}

const parseLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toTextarea = (values: string[]) => (values || []).join("\n");

const revokePreviewUrl = (url: string) => {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
};

export default function AdminMarketPlacePage() {
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [listings, setListings] = useState<SaleListing[]>([]);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SaleListing | null>(null);
  const [imageItems, setImageItems] = useState<Array<{ url: string; file?: File }>>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    description: "",
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
    interiorSizeSqft: "",
    lotSizeSqft: "",
    yearBuilt: "",
    price: "",
    currency: "Ksh",
    amenitiesText: "",
    status: "draft" as ListingStatus,
    isFeatured: false,
    contactEmail: "",
    contactPhone: "",
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [listingToDelete, setListingToDelete] = useState<SaleListing | null>(null);

  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success && data.csrfToken ? data.csrfToken : null;
    } catch {
      return null;
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");
      const data = await res.json();
      const sessionRole = (data.role || data.user?.role || "").toLowerCase();
      if (!data.authenticated || sessionRole !== "admin") throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchListings = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/market-place-sale-listings", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data: ApiListResponse = await res.json();
      if (data.success) setListings(data.listings || []);
      else setError(data.message || "Failed to load listings.");
    } catch {
      setError("Failed to load listings.");
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") fetchListings();
  }, [status, fetchListings]);

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => {
      const name = (l.name || "").toLowerCase();
      const address = (l.address || "").toLowerCase();
      const type = (l.propertyType || "").toLowerCase();
      return name.includes(q) || address.includes(q) || type.includes(q);
    });
  }, [listings, query]);

  const openCreateModal = () => {
    setEditing(null);
    imageItems.forEach((item) => revokePreviewUrl(item.url));
    setImageItems([]);
    setImageUploadError(null);
    setForm({
      name: "",
      address: "",
      description: "",
      propertyType: "",
      bedrooms: "",
      bathrooms: "",
      interiorSizeSqft: "",
      lotSizeSqft: "",
      yearBuilt: "",
      price: "",
      currency: "Ksh",
      amenitiesText: "",
      status: "draft",
      isFeatured: false,
      contactEmail: "",
      contactPhone: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (listing: SaleListing) => {
    setEditing(listing);
    imageItems.forEach((item) => revokePreviewUrl(item.url));
    setImageItems((listing.images || []).map((url) => ({ url })));
    setImageUploadError(null);
    setForm({
      name: listing.name || "",
      address: listing.address || "",
      description: listing.description || "",
      propertyType: listing.propertyType || "",
      bedrooms: listing.bedrooms !== undefined ? String(listing.bedrooms) : "",
      bathrooms: listing.bathrooms !== undefined ? String(listing.bathrooms) : "",
      interiorSizeSqft: listing.interiorSizeSqft !== undefined ? String(listing.interiorSizeSqft) : "",
      lotSizeSqft: listing.lotSizeSqft !== undefined ? String(listing.lotSizeSqft) : "",
      yearBuilt: listing.yearBuilt !== undefined ? String(listing.yearBuilt) : "",
      price: listing.price !== undefined ? String(listing.price) : "",
      currency: listing.currency || "Ksh",
      amenitiesText: toTextarea(listing.amenities || []),
      status: listing.status || "draft",
      isFeatured: !!listing.isFeatured,
      contactEmail: listing.contactEmail || "",
      contactPhone: listing.contactPhone || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setImageUploadError(null);
    setIsUploadingImages(false);
    setImageItems((prev) => {
      prev.forEach((item) => revokePreviewUrl(item.url));
      return [];
    });
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
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

    const maxImages = 10;
    const totalAfter = imageItems.length + valid.length;
    if (totalAfter > maxImages) {
      errors.push(`Only ${maxImages} images allowed.`);
      valid.splice(Math.max(0, maxImages - imageItems.length));
    }

    if (errors.length > 0) setImageUploadError(errors.join(" "));
    else setImageUploadError(null);

    if (valid.length > 0) {
      setImageItems((prev) => [
        ...prev,
        ...valid.map((file) => ({ url: URL.createObjectURL(file), file })),
      ]);
    }
  };

  const removeImageAt = (index: number) => {
    setImageItems((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.url) revokePreviewUrl(removed.url);
      return next;
    });
  };

  const uploadImages = async (csrfToken: string, files: File[]) => {
    if (files.length === 0) return [];
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

    return (data.urls || []) as string[];
  };

  const saveListing = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const csrfToken = await fetchCsrfToken();
    if (!csrfToken) {
      setError("Failed to get security token. Please refresh the page.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      description: form.description,
      propertyType: form.propertyType.trim(),
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      interiorSizeSqft: form.interiorSizeSqft ? Number(form.interiorSizeSqft) : undefined,
      lotSizeSqft: form.lotSizeSqft ? Number(form.lotSizeSqft) : undefined,
      yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
      price: form.price ? Number(form.price) : 0,
      currency: form.currency.trim() || "Ksh",
      amenities: parseLines(form.amenitiesText),
      status: form.status,
      isFeatured: !!form.isFeatured,
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
    };

    try {
      setIsLoading(true);

      const newFiles = imageItems.filter((item) => item.file).map((item) => item.file!) as File[];
      let finalImageUrls = imageItems.filter((item) => !item.file).map((item) => item.url);
      if (newFiles.length > 0) {
        setIsUploadingImages(true);
        const uploaded = await uploadImages(csrfToken, newFiles);
        setIsUploadingImages(false);
        finalImageUrls = [...finalImageUrls, ...uploaded];
      }

      const url = editing
        ? `/api/admin/market-place-sale-listings/${editing._id}`
        : "/api/admin/market-place-sale-listings";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ ...payload, images: finalImageUrls }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to save listing.");
        return;
      }

      closeModal();
      await fetchListings();
    } catch (err) {
      console.error("Save listing error:", err);
      setError(err instanceof Error ? err.message : "Failed to save listing.");
      setIsUploadingImages(false);
    } finally {
      setIsLoading(false);
    }
  };

  const openDelete = (listing: SaleListing) => {
    setListingToDelete(listing);
    setShowDeleteModal(true);
  };

  const closeDelete = () => {
    setShowDeleteModal(false);
    setListingToDelete(null);
  };

  const confirmDelete = async () => {
    if (!listingToDelete) return;

    const csrfToken = await fetchCsrfToken();
    if (!csrfToken) {
      setError("Failed to get security token. Please refresh the page.");
      closeDelete();
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch(`/api/admin/market-place-sale-listings/${listingToDelete._id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to delete listing.");
        return;
      }

      closeDelete();
      await fetchListings();
    } catch (err) {
      console.error("Delete listing error:", err);
      setError("Failed to delete listing.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-[70vh] grid place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Market Place</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Create and publish properties for sale on the public market place.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={fetchListings}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  disabled={isLoading}
                >
                  <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
                >
                  <Plus size={14} />
                  New listing
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "Fair marketing",
                  value: "Avoid discriminatory language in descriptions.",
                },
                {
                  label: "Strong media",
                  value: "Use clear, current photos; avoid watermarks and phone numbers on images.",
                },
                {
                  label: "Complete details",
                  value: "Price, address, property type, and key specs improve buyer confidence.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border bg-white/70 px-4 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.section>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-900">
              {error}
            </div>
          )}

          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">For sale</p>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Star size={14} />
                  {filteredListings.length} listing{filteredListings.length === 1 ? "" : "s"}
                </span>
              </div>

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, address, type…"
                className="w-full sm:max-w-sm rounded-2xl border border-border bg-white/70 px-4 py-2 text-sm outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>

            {isLoading && listings.length === 0 ? (
              <div className="mt-8 flex items-center gap-3 text-muted-foreground">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Loading listings…
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="mt-10 text-center text-muted-foreground">
                <AlertCircle className="mx-auto mb-3 h-10 w-10 opacity-60" />
                <p className="text-sm">No listings yet. Create your first for-sale listing.</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredListings.map((listing) => {
                  const badgeTone =
                    listing.status === "published"
                      ? "bg-emerald-100 text-emerald-700"
                      : listing.status === "sold"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600";
                  return (
                    <div
                      key={listing._id}
                      className="rounded-3xl border border-border bg-white/70 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{listing.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{listing.address}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${badgeTone}`}>
                          {listing.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {(listing.currency || "Ksh") + " " + Number(listing.price || 0).toLocaleString()}
                        </span>
                        {listing.propertyType ? <span>• {listing.propertyType}</span> : null}
                        {Number.isFinite(Number(listing.bedrooms)) ? <span>• {Number(listing.bedrooms)} bd</span> : null}
                        {Number.isFinite(Number(listing.bathrooms)) ? <span>• {Number(listing.bathrooms)} ba</span> : null}
                        {listing.isFeatured ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            <Star size={12} />
                            Featured
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5 flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(listing)}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                        >
                          <Edit size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => openDelete(listing)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-2 sm:px-4 py-3 sm:py-6">
          <div className="w-full max-w-3xl max-h-[92svh] sm:max-h-[86svh] rounded-t-3xl sm:rounded-3xl border border-border bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 sm:px-6 py-4 flex-none">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Market Place</p>
                <h2 className="text-lg font-semibold text-foreground">
                  {editing ? "Edit for-sale listing" : "New for-sale listing"}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-full p-2 hover:bg-slate-100 transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form
              id="__admin-market-place-form"
              onSubmit={saveListing}
              className="flex-1 overflow-y-auto px-5 sm:px-6 py-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 pb-24">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Title / Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Address / Location
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Price
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Currency
                  </label>
                  <input
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="Ksh"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Property Type
                  </label>
                  <input
                    value={form.propertyType}
                    onChange={(e) => setForm((p) => ({ ...p, propertyType: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="Apartment, House, Land…"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Beds
                    </label>
                    <input
                      type="number"
                      value={form.bedrooms}
                      onChange={(e) => setForm((p) => ({ ...p, bedrooms: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Baths
                    </label>
                    <input
                      type="number"
                      value={form.bathrooms}
                      onChange={(e) => setForm((p) => ({ ...p, bathrooms: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Year
                    </label>
                    <input
                      type="number"
                      value={form.yearBuilt}
                      onChange={(e) => setForm((p) => ({ ...p, yearBuilt: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                      min={0}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Interior (sqft)
                    </label>
                    <input
                      type="number"
                      value={form.interiorSizeSqft}
                      onChange={(e) => setForm((p) => ({ ...p, interiorSizeSqft: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Lot (sqft)
                    </label>
                    <input
                      type="number"
                      value={form.lotSizeSqft}
                      onChange={(e) => setForm((p) => ({ ...p, lotSizeSqft: e.target.value }))}
                      className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                      min={0}
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full min-h-28 rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="Avoid discriminatory language; focus on property features and availability."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Images
                  </label>
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Upload up to 10 images (JPEG/PNG, max 5MB each).
                      </div>
                      <label className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer">
                        <Upload size={14} />
                        Add images
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          multiple
                          className="hidden"
                          onChange={handleImageChange}
                        />
                      </label>
                    </div>

                    {imageUploadError && (
                      <p className="mt-3 text-xs text-rose-700">{imageUploadError}</p>
                    )}

                    {imageItems.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {imageItems.map((item, idx) => (
                          <div
                            key={`${item.url}-${idx}`}
                            className="relative overflow-hidden rounded-2xl border border-border bg-white"
                          >
                            <div className="relative h-28 w-full">
                              <Image
                                src={item.url}
                                alt={`Listing image ${idx + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, 33vw"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeImageAt(idx)}
                              className="absolute top-2 right-2 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
                              aria-label="Remove image"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Amenities (one per line)
                  </label>
                  <textarea
                    value={form.amenitiesText}
                    onChange={(e) => setForm((p) => ({ ...p, amenitiesText: e.target.value }))}
                    className="w-full min-h-20 rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="Parking"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ListingStatus }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>

                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isFeatured}
                      onChange={(e) => setForm((p) => ({ ...p, isFeatured: e.target.checked }))}
                    />
                    Feature listing
                  </label>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Contact Email
                  </label>
                  <input
                    value={form.contactEmail}
                    onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="sales@..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Contact Phone
                  </label>
                  <input
                    value={form.contactPhone}
                    onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                    className="w-full rounded-2xl border border-border bg-white/90 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/10"
                    placeholder="+254..."
                  />
                </div>
              </div>
            </form>

            <div className="flex-none border-t border-border bg-white/90 backdrop-blur px-5 sm:px-6 py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-border bg-white/80 px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="__admin-market-place-form"
                  className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:opacity-60"
                  disabled={isLoading || isUploadingImages}
                >
                  {isUploadingImages ? "Uploading…" : editing ? "Save changes" : "Create listing"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDeleteModal && listingToDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">Delete listing</h3>
              <button onClick={closeDelete} className="rounded-full p-2 hover:bg-slate-100 transition" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground">
                Delete <span className="font-semibold text-foreground">{listingToDelete.name}</span>? This cannot be undone.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={closeDelete}
                  className="rounded-full border border-border bg-white/80 px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition disabled:opacity-60"
                  disabled={isLoading}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
