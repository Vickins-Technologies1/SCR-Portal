// src/app/property-owner-dashboard/list-properties/PropertyTableRow.tsx
import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Listing } from "@/types/property";   // ← Updated to Listing

interface PropertyTableRowProps {
  property: Listing; // ← Updated
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function PropertyTableRow({
  property,
  onView,
  onEdit,
  onDelete,
}: PropertyTableRowProps) {
  return (
    <tr
      className="hover:bg-slate-50 transition cursor-pointer"
      onClick={onView}
    >
      <td className="px-6 py-4 font-medium text-slate-800">{property.name}</td>
      <td className="px-6 py-4 text-slate-600 max-w-xs truncate">{property.address}</td>
      <td className="px-6 py-4">
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            property.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
          }`}
        >
          {property.status}
        </span>
      </td>
      <td className="px-6 py-4 text-slate-600">
        {new Date(property.createdAt).toLocaleDateString()}
      </td>
      <td className="px-6 py-4 text-sm text-slate-700">
        {property.unitTypes.map((u) => `${u.type} (x${u.vacant ?? 0})`).join(", ")}
      </td>
      <td className="px-6 py-4 flex gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onEdit}
          className="text-[#012a4a] hover:text-[#014a7a] transition p-2 rounded-lg hover:bg-blue-50"
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
      </td>
    </tr>
  );
}