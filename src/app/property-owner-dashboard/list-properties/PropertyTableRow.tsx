// src/app/property-owner-dashboard/list-properties/PropertyTableRow.tsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Listing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";

interface PropertyTableRowProps {
  property: Listing;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canManage?: boolean;
}

export default function PropertyTableRow({
  property,
  onView,
  onEdit,
  onDelete,
  canManage,
}: PropertyTableRowProps) {
  const availability = ensureAvailability(property);
  const showActions = canManage ?? true;
  const prices = (property.unitTypes || []).map((u) => Number(u.price || 0)).filter((v) => Number.isFinite(v) && v > 0);
  const deposits = (property.unitTypes || []).map((u) => Number(u.deposit || 0)).filter((v) => Number.isFinite(v) && v > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const minDeposit = deposits.length ? Math.min(...deposits) : 0;
  const maxDeposit = deposits.length ? Math.max(...deposits) : 0;
  return (
    <tr
      className="hover:bg-primary/5 transition cursor-pointer"
      onClick={onView}
    >
      <td className="px-6 py-4 font-medium text-gray-900">{property.name}</td>
      <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{property.address}</td>
      <td className="px-6 py-4">
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
            property.status === "Active" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-700"
          }`}
        >
          {property.status}
        </span>
      </td>
      <td className="px-6 py-4 text-gray-600">{new Date(property.createdAt).toLocaleDateString()}</td>
      <td className="px-6 py-4 text-xs sm:text-sm text-gray-700">
        <div className="space-y-1">
          <div className="font-semibold text-gray-900">
            {minPrice > 0
              ? maxPrice > minPrice
                ? `Ksh ${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()} /mo`
                : `Ksh ${minPrice.toLocaleString()} /mo`
              : "—"}
          </div>
          <div className="text-[11px] text-slate-500">
            {minDeposit > 0
              ? maxDeposit > minDeposit
                ? `Deposit: Ksh ${minDeposit.toLocaleString()} – ${maxDeposit.toLocaleString()}`
                : `Deposit: Ksh ${minDeposit.toLocaleString()}`
              : "Deposit: —"}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-xs sm:text-sm text-gray-700 space-y-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Vacant units: {availability.totalVacant}</span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <span
              style={{ width: `${Math.min(100, availability.occupancyRate)}%` }}
              className="block h-full rounded-full bg-gradient-to-r from-primary via-emerald-400 to-teal-400"
            />
          </div>
          <span className="text-[10px] text-slate-500">
            Occupancy {availability.occupancyRate}% • {property.unitTypes.map((u) => u.type).join(", ")}
          </span>
        </div>
      </td>
      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
        {showActions ? (
          <div className="flex gap-3">
            <button
              onClick={onEdit}
              className="text-primary hover:text-primary-hover transition p-2 rounded-lg hover:bg-blue-50"
              title="Edit"
            >
              <Pencil className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="text-red-600 hover:text-red-800 transition p-2 rounded-lg hover:bg-red-50"
              title="Remove"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">View only</span>
        )}
      </td>
    </tr>
  );
}




