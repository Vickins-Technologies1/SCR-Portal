// src/app/property-owner-dashboard/list-properties/PropertyCard.tsx
import React from "react";
import { motion } from "framer-motion";
import { MapPin, DollarSign, Pencil, Trash2 } from "lucide-react";
import { Property } from "./page";

interface PropertyCardProps {
  property: Property;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function PropertyCard({ property, onView, onEdit, onDelete }: PropertyCardProps) {
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

          <div>
            <p className="font-medium text-slate-700 mb-1">Available Units:</p>
            <div className="flex flex-wrap gap-2">
              {property.unitTypes.map((u, idx) => (
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
            Listed on {new Date(property.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

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
    </motion.div>
  );
}