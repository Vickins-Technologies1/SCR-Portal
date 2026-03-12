// src/app/property-owner-dashboard/components/ActionButtons.tsx
"use client"; // ← add this (needed because we're using hooks if you ever add them, but mainly for clarity)

import React from "react";
import { DollarSign, FileText, LogIn, Trash2 } from "lucide-react";

interface ActionButtonsProps {
  onRecordPayment: () => void;
  onEdit: () => void;
  onImpersonate: () => void;
  onDelete: () => void;
  onGenerateReport: () => void;
  // Add the permission props we need for conditional rendering
  canRecordPayment: boolean;
  canGenerateReport: boolean;
  canImpersonate: boolean;
  canDelete: boolean;
}

export default function ActionButtons({
  onRecordPayment,
  onEdit,           // currently unused – you may want to add Edit button later
  onImpersonate,
  onDelete,
  onGenerateReport,
  canRecordPayment,
  canGenerateReport,
  canImpersonate,
  canDelete,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-4 pt-8 border-t border-slate-200 mt-10">
      {canRecordPayment && (
        <button
          onClick={onRecordPayment}
          className="flex items-center gap-3 px-7 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 transform hover:scale-105 transition-all shadow-lg"
        >
          <DollarSign className="h-6 w-6" />
          Record Payment
        </button>
      )}

      {canGenerateReport && (
        <button
          onClick={onGenerateReport}
          className="flex items-center gap-3 px-7 py-4 bg-gradient-to-r from-indigo-500 to-slate-900 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-slate-950 transform hover:scale-105 transition-all shadow-lg"
        >
          <FileText className="h-6 w-6" />
          Generate Report
        </button>
      )}

      {canImpersonate && (
        <button
          onClick={onImpersonate}
          className="flex items-center gap-3 px-7 py-4 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transform hover:scale-105 transition-all shadow-lg"
        >
          <LogIn className="h-6 w-6" />
          Impersonate
        </button>
      )}

      {canDelete && (
        <button
          onClick={onDelete}
          className="flex items-center gap-3 px-7 py-4 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transform hover:scale-105 transition-all shadow-lg"
        >
          <Trash2 className="h-6 w-6" />
          Delete Tenant
        </button>
      )}

      {/* Optional: Edit button – currently not conditional, add when ready */}
      {/* 
      <button
        onClick={onEdit}
        className="flex items-center gap-3 px-7 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transform hover:scale-105 transition-all shadow-lg"
      >
        <Edit className="h-6 w-6" />
        Edit Tenant
      </button>
      */}
    </div>
  );
}