// src/app/property-owner-dashboard/list-properties/components/ListingFormModal.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import Modal from "../components/Modal"; // Adjust path if needed

import { Property, Listing } from "@/types/property";
import { readJsonResponse } from "@/lib/api-client";
import { upload as uploadBlob } from "@vercel/blob/client";
import { uploadMarketplaceFiles } from "@/lib/marketplace-upload";

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

interface ListingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "list" | "edit";
  editingPropertyId?: string | null;
  csrfToken: string | null;
  effectiveOwnerId: string | null;
  onSuccess: () => void;
  originalProperties: Property[]; // Core properties for selection in "list" mode
  existingListings: Listing[]; // For filtering already-listed properties
}

export default function ListingFormModal({
  isOpen,
  onClose,
  mode,
  editingPropertyId,
  csrfToken,
  effectiveOwnerId,
  onSuccess,
  originalProperties,
  existingListings,
}: ListingFormModalProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [isAdvertised, setIsAdvertised] = useState<boolean>(false);
  const [description, setDescription] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<Record<string, string>>({});
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const preserveUploadsOnClose = useRef(false);

  // Compute available properties (exclude already listed ones)
  const availableProperties = useMemo(() => {
    return originalProperties.filter(
      (prop) =>
        !existingListings.some(
          (listing) => listing.originalPropertyId === prop._id
        )
    );
  }, [originalProperties, existingListings]);

  const resetForm = useCallback(() => {
    setSelectedPropertyId("");
    setIsAdvertised(false);
    setDescription("");
    setContactPhone("");
    setFacilities([]);
    setImages([]);
    setUploadedImageUrls({});
    setImagePreviews([]);
    setImageUploadError(null);
    setUploadProgress(null);
    setFormErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
    setIsUploading(false);
    preserveUploadsOnClose.current = false;
  }, []);

  // Reset / populate form when modal opens or mode changes
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    if (mode === "edit" && editingPropertyId) {
      const prop = existingListings.find(
        (p) => p._id === editingPropertyId
      ) as Listing | undefined;
      if (prop) {
        setSelectedPropertyId(prop._id);
        setIsAdvertised(prop.isAdvertised ?? false);
        setDescription(prop.description || "");
        setContactPhone(prop.contactPhone || "");
        setFacilities(prop.facilities || []);
        setImagePreviews(prop.images || []);
      }
    } else {
      resetForm();
    }
  }, [isOpen, mode, editingPropertyId, existingListings, resetForm]);

  // Real-time form validation
  useEffect(() => {
    const errors: Record<string, string> = {};

    if (mode === "list" && !selectedPropertyId.trim()) {
      errors.property = "Please select a property to list";
    }

    if (description.length > 500) {
      errors.description = "Description cannot exceed 500 characters";
    }

    const contactPhoneValue = contactPhone.trim();
    if (contactPhoneValue && !/^\+\d{8,15}$/.test(contactPhoneValue)) {
      errors.contactPhone = "Phone number must start with + and contain 8–15 digits total";
    }

    if (facilities.length > 10) {
      errors.facilities = "Maximum 10 facilities allowed";
    }

    if (mode === "list" && imagePreviews.length === 0) {
      errors.images = "At least one image is required for new listings";
    }

    if (imagePreviews.length > 10) {
      errors.images = "Maximum 10 images allowed";
    }

    setFormErrors(errors);
  }, [mode, selectedPropertyId, description, contactPhone, facilities, imagePreviews]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    const errors: string[] = [];
    const existingKeys = new Set(
      images.map((file) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`)
    );

    files.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      if (existingKeys.has(key)) {
        errors.push(`${file.name}: duplicate image ignored`);
        return;
      }

      const extension = file.name.split(".").pop()?.toLowerCase();
      const inferredType = file.type || ({
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
        gif: "image/gif", heic: "image/heic", heif: "image/heif",
      } as Record<string, string>)[extension || ""] || "";
      if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"].includes(inferredType)) {
        errors.push(`${file.name}: unsupported image type`);
      } else if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: Maximum 5MB per image`);
      } else {
        valid.push(file);
        existingKeys.add(key);
      }
    });

    const totalAfter = valid.length + imagePreviews.length;
    if (totalAfter > 10) {
      errors.push(`Maximum 10 images allowed (${totalAfter - 10} too many)`);
      valid.splice(10 - imagePreviews.length);
    }

    if (errors.length > 0) {
      setImageUploadError(errors.join("; "));
    } else {
      setImageUploadError(null);
    }

    setImages((prev) => [...prev, ...valid]);
    setImagePreviews((prev) => [
      ...prev,
      ...valid.map((file) => URL.createObjectURL(file)),
    ]);

    e.target.value = "";
  };

  const removeImage = (index: number) => {
    const preview = imagePreviews[index];
    if (preview?.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
      const fileIndex = imagePreviews.slice(0, index).filter((url) => url.startsWith("blob:")).length;
      const file = images[fileIndex];
      if (file && csrfToken) {
        const fileKey = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
        const uploadedUrl = uploadedImageUrls[fileKey];
        if (uploadedUrl) {
          void deleteUploadedImage(uploadedUrl).then(() => {
            setUploadedImageUrls((prev) => {
              const next = { ...prev };
              delete next[fileKey];
              return next;
            });
          }).catch((error) => {
            setImageUploadError(error instanceof Error ? error.message : "Could not remove uploaded image.");
          });
        }
      }
      setImages((prev) => prev.filter((_, i) => i !== fileIndex));
    }
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const deleteUploadedImage = async (url: string) => {
    if (!csrfToken) return;
    const pathname = new URL(url).pathname.replace(/^\/+/, "");
    const response = await fetch("/api/upload", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ pathname }),
    });
    const data = await readJsonResponse<{ success?: boolean; message?: string }>(response, "Could not remove uploaded image.");
    if (!response.ok || !data.success) throw new Error(data.message || "Could not remove uploaded image.");
  };

  const handleClose = () => {
    if (!preserveUploadsOnClose.current) {
      void Promise.allSettled(Object.values(uploadedImageUrls).map(deleteUploadedImage));
    }
    onClose();
  };

  const uploadImages = async (files: File[]): Promise<string[]> => {
    if (!csrfToken || !effectiveOwnerId || files.length === 0) return [];
    setImageUploadError(null);
    try {
      return await uploadMarketplaceFiles(
        files,
        uploadedImageUrls,
        async (file, reportProgress) => {
          const extension = file.name.split(".").pop()?.toLowerCase();
          const safeExtension = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(extension || "")
            ? extension
            : file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
          const contentType = file.type || ({
            jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
            gif: "image/gif", heic: "image/heic", heif: "image/heif",
          } as Record<string, string>)[extension || ""];
          if (!safeExtension || !contentType) throw new Error(`${file.name}: unsupported image format.`);
          const result = await uploadBlob(
          `uploads/${effectiveOwnerId}/${crypto.randomUUID()}.${safeExtension}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType,
            multipart: false,
            headers: { "X-CSRF-Token": csrfToken },
            onUploadProgress: ({ percentage }) => {
                reportProgress(percentage);
            },
          }
        );
          return result.url;
        },
        (file, index, total, percentage) => {
          setUploadProgress(`Uploading image ${index} of ${total}: ${file.name}${percentage === undefined ? "" : ` (${Math.floor(percentage)}%)`}`);
        },
        (key, url) => setUploadedImageUrls((prev) => ({ ...prev, [key]: url })),
      );
    } catch (error) {
      setUploadProgress(null);
      throw error;
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (Object.keys(formErrors).length > 0) {
      setSubmitError("Please correct the errors in the form.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // NEW: Always compute final URLs from current state
      // - Kept existing URLs (non-blob) + new uploads
      let finalImageUrls: string[] = imagePreviews.filter(
        (url) => !url.startsWith("blob:")
      );

      if (images.length > 0) {
        setIsUploading(true);
        const uploadedUrls = await uploadImages(images);
        finalImageUrls = [...finalImageUrls, ...uploadedUrls];
      }

      const payload: Partial<Listing> = {
        isAdvertised,
        description: description.trim() || undefined,
        contactPhone: contactPhone.trim(),
        facilities: facilities.length > 0 ? facilities : undefined,
        images: finalImageUrls, // Always send the full current set (can be [] in edit mode)
      };

      const url = "/api/list-properties";
      let method: "POST" | "PUT" = "POST";

      if (mode === "edit" && editingPropertyId) {
        method = "PUT";
        payload._id = editingPropertyId;
      } else {
        payload.originalPropertyId = selectedPropertyId;
      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await readJsonResponse<{ success?: boolean; message?: string }>(res, "Failed to save listing.");

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save listing");
      }

      onSuccess();
      preserveUploadsOnClose.current = true;
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || "An error occurred while saving the listing.");
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Modal
      title={mode === "list" ? "List Property for Rent" : "Edit Property Listing"}
      isOpen={isOpen}
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Global submit error */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Property Selection - only shown in "list" mode */}
        {mode === "list" && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Property to List *
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white disabled:opacity-60"
              required
              disabled={isSubmitting || isUploading}
            >
              <option value="">-- Choose a property --</option>
              {availableProperties.map((prop) => (
                <option key={prop._id.toString()} value={prop._id.toString()}>
                  {prop.name} – {prop.address}
                </option>
              ))}
            </select>
            {formErrors.property && (
              <p className="text-red-500 text-xs mt-1">{formErrors.property}</p>
            )}
            {availableProperties.length === 0 && (
              <p className="text-amber-600 text-xs mt-1">
                All your properties are already listed.
              </p>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Description (optional - max 500 characters)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Highlight key features, location benefits, nearby amenities..."
            maxLength={500}
            rows={5}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none disabled:opacity-60"
            disabled={isSubmitting || isUploading}
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            {description.length}/500
          </p>
          {formErrors.description && (
            <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>
          )}
        </div>

        {/* Contact phone */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Listing contact phone (optional)
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+254712345678"
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition bg-white disabled:opacity-60"
            disabled={isSubmitting || isUploading}
          />
          {formErrors.contactPhone && (
            <p className="text-red-500 text-xs mt-1">{formErrors.contactPhone}</p>
          )}
        </div>

        {/* Facilities */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Facilities (select multiple, max 10)
          </label>
          <select
            multiple
            value={facilities}
            onChange={(e) =>
              setFacilities(
                Array.from(e.target.selectedOptions, (option) => option.value)
              )
            }
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary/30 h-40 bg-white disabled:opacity-60"
            disabled={isSubmitting || isUploading}
          >
            {FACILITIES.map((facility) => (
              <option key={facility} value={facility}>
                {facility}
              </option>
            ))}
          </select>

          {facilities.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {facilities.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-sm"
                >
                  {f}
                  <button
                    type="button"
                    onClick={() => setFacilities((prev) => prev.filter((x) => x !== f))}
                    className="text-red-600 hover:text-red-800 focus:outline-none"
                    disabled={isSubmitting || isUploading}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {formErrors.facilities && (
            <p className="text-red-500 text-xs mt-1">{formErrors.facilities}</p>
          )}
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {mode === "list" ? "Images (required)" : "Images (optional - can be empty)"}
          </label>

          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-2 text-slate-500" />
                <p className="text-sm text-slate-600">
                  <span className="font-semibold">Click to upload</span> or drag & drop
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  JPEG, PNG, WebP, GIF or HEIC • Max 5MB per image • Max 10 total
                </p>
              </div>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                className="hidden"
                onChange={handleImageChange}
                disabled={isSubmitting || isUploading}
              />
            </label>
          </div>

          {imageUploadError && (
            <p className="text-red-500 text-xs mt-2">{imageUploadError}</p>
          )}
          {uploadProgress && (
            <p className="text-xs text-slate-500 mt-2">{uploadProgress}</p>
          )}

          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
              {imagePreviews.map((preview, index) => (
                <div
                  key={index}
                  className="relative group rounded-lg overflow-hidden shadow-sm border border-slate-200"
                >
                  <Image
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    width={120}
                    height={120}
                    className="object-cover w-full h-24 sm:h-28"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md disabled:opacity-50"
                    disabled={isSubmitting || isUploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {formErrors.images && (
            <p className="text-red-500 text-xs mt-2">{formErrors.images}</p>
          )}
        </div>

        {/* Advertise Checkbox */}
        <div className="flex items-start">
          <input
            id="advertise"
            type="checkbox"
            checked={isAdvertised}
            onChange={(e) => setIsAdvertised(e.target.checked)}
            className="h-5 w-5 mt-0.5 text-primary border-slate-300 rounded focus:ring-primary/30 disabled:opacity-50"
            disabled={isSubmitting || isUploading}
          />
          <label htmlFor="advertise" className="ml-3 text-sm font-medium text-slate-700">
            Feature this listing (30-day advertisement on public marketplace)
          </label>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition font-medium disabled:opacity-50"
            disabled={isSubmitting || isUploading}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting || isUploading || Object.keys(formErrors).length > 0}
            className={`min-w-[140px] flex items-center justify-center gap-2 px-6 py-3 text-white rounded-xl shadow-md transition-all font-medium ${
              isSubmitting || isUploading || Object.keys(formErrors).length > 0
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-primary to-emerald-500 hover:shadow-lg active:scale-95"
            }`}
          >
            {isSubmitting || isUploading ? (
              <>{isUploading ? "Uploading images…" : "Saving…"}</>
            ) : mode === "list" ? (
              "List Property"
            ) : (
              "Update Listing"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}



