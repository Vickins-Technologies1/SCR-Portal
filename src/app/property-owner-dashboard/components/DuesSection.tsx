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
  const otherDues = Number(dues.otherDues || 0);
  const walletAppliedAllocation = dues.walletAppliedAllocation || { rent: 0, utilities: 0, deposit: 0, other: 0 };
  const walletApplications = [
    ["rent", walletAppliedAllocation.rent],
    ["utilities", walletAppliedAllocation.utilities],
    ["deposit", walletAppliedAllocation.deposit],
    ["other charges", walletAppliedAllocation.other],
  ].filter(([, amount]) => Number(amount) > 0)
    .map(([category, amount]) => `Ksh ${Number(amount).toFixed(0)} to ${category}`);

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">Outstanding Dues</h3>
        <div className="relative group">
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded-lg py-2 px-3 whitespace-nowrap z-10 shadow-lg">
            Total balances include past-due and not-yet-due amounts. Each portion is listed below its total.
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
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${otherDues > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            {/* Rent Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-amber-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700">Total rent + penalties</p>
              <p className="text-base sm:text-lg font-semibold text-amber-700 mt-2">
                Ksh {dues.rentDues.toFixed(0)}
              </p>
              {dues.rentOverdueDues != null && dues.rentCurrentDues != null && (
                <p className="mt-1 text-[10px] text-amber-800">
                  Past-due rent Ksh {dues.rentOverdueDues.toLocaleString("en-KE")} · Not-yet-due rent Ksh {dues.rentCurrentDues.toLocaleString("en-KE")}
                </p>
              )}
              {(dues.penaltyDues ?? 0) > 0 && (
                <p className="mt-1 text-[10px] text-amber-800">
                  Penalties Ksh {Number(dues.penaltyDues).toLocaleString("en-KE")}
                </p>
              )}
            </div>

            {/* Utility Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-sky-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-sky-700">Total utility balance</p>
              <p className="text-base sm:text-lg font-semibold text-sky-700 mt-2">
                Ksh {dues.utilityDues.toFixed(0)}
              </p>
              {dues.utilityOverdueDues != null && dues.utilityCurrentDues != null && (
                <p className="mt-1 text-[10px] text-sky-800">
                  Past due Ksh {dues.utilityOverdueDues.toLocaleString("en-KE")} · Not yet due Ksh {dues.utilityCurrentDues.toLocaleString("en-KE")}
                </p>
              )}
            </div>

            {/* Deposit Dues */}
            <div className="surface-card rounded-2xl p-4 border-l-4 border-indigo-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-700">Deposit balance</p>
              <p className="text-base sm:text-lg font-semibold text-indigo-700 mt-2">
                Ksh {dues.depositDues.toFixed(0)}
              </p>
            </div>

            {otherDues > 0 && (
              <div className="surface-card rounded-2xl p-4 border-l-4 border-slate-400">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-700">Other charges</p>
                <p className="text-base sm:text-lg font-semibold text-slate-700 mt-2">
                  Ksh {otherDues.toFixed(0)}
                </p>
              </div>
            )}

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
                {(dues.walletRentEligibleBalance ?? 0) > 0 && (
                  <span className="text-[11px] font-medium text-primary">
                    {dues.walletCoverageMonths ?? 0} month{(dues.walletCoverageMonths ?? 0) === 1 ? "" : "s"} rent runway
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs sm:text-sm">
                {(dues.walletApplied ?? 0) > 0
                  ? `Applied ${walletApplications.join(", ") || `Ksh ${dues.walletApplied?.toFixed(0)} to obligations`}.`
                  : (dues.walletRentEligibleBalance ?? 0) > 0
                    ? "Rent-eligible credit is ready for upcoming rent."
                    : "Credit remains available for its eligible obligation categories."}
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




