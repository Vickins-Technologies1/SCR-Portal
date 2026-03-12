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
}

export default function PropertyCard({ property, onView, onEdit, onDelete, canManage }: PropertyCardProps) {
  const availability = ensureAvailability(property);
  const showActions = canManage ?? true;
  const vacancyLabel = `${availability.totalVacant} vacant unit${availability.totalVacant === 1 ? "" : "s"}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={onView}
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-bold text-slate-800">{property.name}</h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              property.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
            }`}
          >
            {property.status}
          </span>
        </div>

        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#012a4a]" />
            <span className="truncate">{property.address}</span>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[#012a4a]" />
            <span>
              From Ksh {Math.min(...property.unitTypes.map((u) => u.price)).toLocaleString()}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200/20 bg-slate-50/40 px-3 py-2 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Vacant units</span>
              <span className="font-semibold text-slate-900">{vacancyLabel}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <span
                style={{ width: `${Math.min(100, availability.occupancyRate)}%` }}
                className="block h-full rounded-full bg-gradient-to-r from-[#0ea5e9] via-[#22d3ee] to-[#6366f1]"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Occupied {availability.totalOccupied} of {availability.totalUnits} units ({availability.occupancyRate}% occupancy)
            </p>
          </div>

          <div className="text-xs text-slate-500">
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
            className="flex items-center gap-2 px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm font-medium"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}
    </motion.div>
  );
}


