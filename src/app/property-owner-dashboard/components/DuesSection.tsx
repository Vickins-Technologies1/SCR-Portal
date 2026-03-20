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
      <div className="surface-card rounded-2xl p-4 text-xs sm:text-sm text-amber-700 text-center">
        <p>Dues information not available</p>
      </div>
    );
  }

  const dues = tenant.dues;

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">Outstanding Dues</h3>
        <div className="relative group">
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded-lg py-2 px-3 whitespace-nowrap z-10 shadow-lg">
            Includes current month for accuracy
          </span>
        </div>
      </div>

      {isDuesLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="surface-card rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-300 rounded w-16 mb-2"></div>
              <div className="h-7 bg-slate-400 rounded w-20"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {/* Rent Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-amber-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700">Rent</p>
              <p className="text-base sm:text-lg font-semibold text-amber-700 mt-2">
                Ksh {dues.rentDues.toFixed(0)}
              </p>
            </div>

            {/* Utility Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-sky-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-sky-700">Utility</p>
              <p className="text-base sm:text-lg font-semibold text-sky-700 mt-2">
                Ksh {dues.utilityDues.toFixed(0)}
              </p>
            </div>

            {/* Deposit Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-indigo-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-700">Deposit</p>
              <p className="text-base sm:text-lg font-semibold text-indigo-700 mt-2">
                Ksh {dues.depositDues.toFixed(0)}
              </p>
            </div>

            {/* Total Remaining */}
            <div className="glass-panel rounded-2xl p-4 border border-red-200 col-span-2 lg:col-span-1">
              <p className="text-[11px] font-semibold text-red-700 uppercase tracking-[0.3em]">Total Due</p>
              <p className="text-lg sm:text-xl font-semibold text-red-700 mt-2">
                Ksh {dues.totalRemainingDues.toFixed(0)}
              </p>
            </div>
          </div>

          {((dues.walletApplied ?? 0) > 0 || (dues.walletRemaining ?? 0) > 0) && (
            <div className="surface-card rounded-2xl p-4 text-primary shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold">Wallet Auto-Apply</p>
                <span className="text-[11px] font-medium text-primary">
                  {dues.walletCoverageMonths ?? 0} month{(dues.walletCoverageMonths ?? 0) === 1 ? "" : "s"} runway
                </span>
              </div>
              <p className="mt-2 text-xs sm:text-sm">
                {(dues.walletApplied ?? 0) > 0
                  ? `Applied Ksh ${dues.walletApplied?.toFixed(0)} to rent this cycle.`
                  : "Credit is ready for upcoming rent."}
              </p>
              {(dues.walletRemaining ?? 0) > 0 && (
                <p className="text-[11px] text-primary mt-1">
                  Remaining credit: Ksh {dues.walletRemaining?.toFixed(0)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}




