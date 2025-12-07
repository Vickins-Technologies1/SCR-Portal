// src/app/property-owner-dashboard/components/DuesSection.tsx
import React from "react";
import { Info } from "lucide-react";

interface DuesSectionProps {
  tenant: any;
  isDuesLoading: boolean;
}

export default function DuesSection({ tenant, isDuesLoading }: DuesSectionProps) {
  if (!tenant.dues) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm text-center">
        <p>Dues information not available</p>
      </div>
    );
  }

  const dues = tenant.dues;

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-lg sm:text-xl font-bold text-slate-800">Outstanding Dues</h3>
        <div className="relative group">
          <Info className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500 cursor-help" />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap z-10 shadow-lg">
            Includes current month for accuracy
          </span>
        </div>
      </div>

      {isDuesLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-100 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-slate-300 rounded w-16 mb-2"></div>
              <div className="h-7 bg-slate-400 rounded w-20"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {/* Rent Dues */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-300 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-orange-700 uppercase tracking-wider">Rent</p>
            <p className="text-xl sm:text-2xl font-extrabold text-orange-600 mt-1">
              Ksh {dues.rentDues.toFixed(0)}
            </p>
          </div>

          {/* Utility Dues */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">Utility</p>
            <p className="text-xl sm:text-2xl font-extrabold text-blue-600 mt-1">
              Ksh {dues.utilityDues.toFixed(0)}
            </p>
          </div>

          {/* Deposit Dues */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-300 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-purple-700 uppercase tracking-wider">Deposit</p>
            <p className="text-xl sm:text-2xl font-extrabold text-purple-600 mt-1">
              Ksh {dues.depositDues.toFixed(0)}
            </p>
          </div>

          {/* Total Remaining */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-400 rounded-lg p-4 shadow-lg ring-2 ring-red-100 col-span-2 lg:col-span-1">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Total Due</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-red-600 mt-1">
              Ksh {dues.totalRemainingDues.toFixed(0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}