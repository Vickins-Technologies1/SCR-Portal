// src/app/property-owner-dashboard/list-properties/ListingFormModal.tsx
import React, { useState, useEffect, useCallback } from "react";
import Modal from "../components/Modal";
import { Property } from "./page";

const FACILITIES = [
  "Wi-Fi", "Parking", "Gym", "Swimming Pool", "Security",
  "Elevator", "Air Conditioning", "Heating", "Balcony", "Garden",
];

interface ListingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "list" | "edit";
  editingPropertyId?: string | null;
  csrfToken: string | null;
  onSuccess: () => void;
  originalProperties: Property[];
}

export default function ListingFormModal({
  isOpen,
  onClose,
  mode,
  editingPropertyId,
  csrfToken,
  onSuccess,
  originalProperties,
}: ListingFormModalProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [isAdvertised, setIsAdvertised] = useState(false);
  const [description, setDescription] = useState("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === "edit" && editingPropertyId) {
      // Load existing data (you can expand this)
      const prop = originalProperties.find(p => p._id === editingPropertyId);
      if (prop) {
        setSelectedPropertyId(prop._id);
        setIsAdvertised(prop.isAdvertised);
        setDescription(prop.description || "");
        setFacilities(prop.facilities || []);
        setImagePreviews(prop.images || []);
      }
    } else {
      // Reset for "list" mode
      setSelectedPropertyId("");
      setIsAdvertised(false);
      setDescription("");
      setFacilities([]);
      setImages([]);
      setImagePreviews([]);
      setImageUploadError(null);
      setFormErrors({});
    }
  }, [mode, editingPropertyId, originalProperties]);

  // Validation effect
  useEffect(() => {
    const errors: Record<string, string> = {};
    if (mode === "list" && !selectedPropertyId) errors.property = "Please select a property";
    if (description.length > 500) errors.description = "Description cannot exceed 500 characters";
    if (facilities.length > 10) errors.facilities = "Maximum 10 facilities allowed";
    if (mode === "list" && imagePreviews.length === 0) errors.images = "At least one image is required";
    if (imagePreviews.length > 10) errors.images = "Maximum 10 images allowed";

    setFormErrors(errors);
  }, [mode, selectedPropertyId, description, facilities, imagePreviews]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const removeImage = (idx: number) => {
    setImages((p) => p.filter((_, i) => i !== idx - (imagePreviews.length - p.length)));
    setImagePreviews((p) => p.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(formErrors).length > 0) return;

    // Submit logic here (same as before)
    // Use csrfToken, mode, etc.
    // Call onSuccess() on success
  };

  return (
    <Modal
      title={mode === "list" ? "List Property" : "Edit Listing"}
      isOpen={isOpen}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === "list" && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Property to List
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#012a4a]"
              required
            >
              <option value="">Choose a property...</option>
              {originalProperties.map((prop) => (
                <option key={prop._id} value={prop._id}>
                  {prop.name} – {prop.address}
                </option>
              ))}
            </select>
            {formErrors.property && (
              <p className="text-red-500 text-xs mt-1">{formErrors.property}</p>
            )}
          </div>
        )}

        {/* Description, Facilities, Images, Checkbox, Buttons */}
        {/* ... paste your form content here ... */}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isUploading || Object.keys(formErrors).length > 0}
            className="px-6 py-3 bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white rounded-xl disabled:opacity-50"
          >
            {mode === "list" ? "List Property" : "Update Listing"}
          </button>
        </div>
      </form>
    </Modal>
  );
}