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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-5 border-t border-border/70 mt-6">
      {canRecordPayment && (
        <button
          onClick={onRecordPayment}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-primary to-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg shadow-primary/30 hover:from-primary-hover hover:to-emerald-500/90 transition-all"
        >
          <DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
          Record Payment
        </button>
      )}

      {canGenerateReport && (
        <button
          onClick={onGenerateReport}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 bg-white/80 text-foreground border border-border rounded-xl text-xs sm:text-sm font-semibold shadow-sm hover:bg-white transition"
        >
          <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Generate Report
        </button>
      )}

      {canImpersonate && (
        <button
          onClick={onImpersonate}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 bg-amber-500/90 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm hover:bg-amber-600 transition"
        >
          <LogIn className="h-4 w-4 sm:h-5 sm:w-5" />
          Impersonate
        </button>
      )}

      {canDelete && (
        <button
          onClick={onDelete}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 bg-red-600/90 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm hover:bg-red-700 transition"
        >
          <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
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



