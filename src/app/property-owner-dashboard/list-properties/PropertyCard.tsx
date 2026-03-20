// src/app/property-owner-dashboard/list-properties/PropertyCard.tsx
import React from "react";
import { motion } from "framer-motion";
import { MapPin, DollarSign, Pencil, Trash2 } from "lucide-react";
import { Listing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";

interface PropertyCardProps {
  property: Listing;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canManage?: boolean;
}

export default function PropertyCard({ property, onView, onEdit, onDelete, canManage }: PropertyCardProps) {
  const availability = ensureAvailability(property);
  const showActions = canManage ?? true;
  const vacancyLabel = `${availability.totalVacant} vacant unit${availability.totalVacant === 1 ? "" : "s"}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={onView}
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-foreground">{property.name}</h3>
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
              property.status === "Active" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-700"
            }`}
          >
            {property.status}
          </span>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="truncate">{property.address}</span>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <span>
              From Ksh {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()}
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-[11px] text-slate-500">
            <div className="flex items-center justify-between">
              <span>Vacant units</span>
              <span className="font-semibold text-slate-900">{vacancyLabel}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <span
                style={{ width: `${Math.min(100, availability.occupancyRate)}%` }}
                className="block h-full rounded-full bg-gradient-to-r from-primary via-emerald-400 to-teal-400"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Occupied {availability.totalOccupied} of {availability.totalUnits} units ({availability.occupancyRate}% occupancy)
            </p>
          </div>

          <div className="text-[11px] text-slate-500">
            Listed on {new Date(property.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {showActions && (
        <div
          className="bg-gradient-to-r from-slate-50 to-slate-100 px-5 py-3 flex justify-end gap-3 border-t border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition text-xs sm:text-sm font-semibold"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-xs sm:text-sm font-semibold"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}
    </motion.div>
  );
}







