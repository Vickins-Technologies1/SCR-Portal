// src/app/property-owner-dashboard/components/ActionButtons.tsx
import React from "react";
import { DollarSign, Edit, LogIn, Trash2 } from "lucide-react";

interface ActionButtonsProps {
  onRecordPayment: () => void;
  onEdit: () => void;
  onImpersonate: () => void;
  onDelete: () => void;
}

export default function ActionButtons({
  onRecordPayment,
  onEdit,
  onImpersonate,
  onDelete,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-4 pt-8 border-t border-slate-200 mt-10">
      <button
        onClick={onRecordPayment}
        className="flex items-center gap-3 px-7 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 transform hover:scale-105 transition-all shadow-lg"
      >
        <DollarSign className="h-6 w-6" />
        Record Payment
      </button>

      <button
        onClick={onImpersonate}
        className="flex items-center gap-3 px-7 py-4 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transform hover:scale-105 transition-all shadow-lg"
      >
        <LogIn className="h-6 w-6" />
        Impersonate
      </button>

      <button
        onClick={onDelete}
        className="flex items-center gap-3 px-7 py-4 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transform hover:scale-105 transition-all shadow-lg"
      >
        <Trash2 className="h-6 w-6" />
        Delete Tenant
      </button>
    </div>
  );
}