// src/app/property-owner-dashboard/components/TenantInfoGrid.tsx
import React from "react";
import { ResponseTenant } from "@/types/tenant";

interface Property {
  name: string;
}

interface TenantInfoGridProps {
  tenant: ResponseTenant;
  property?: Property | null;
}

export default function TenantInfoGrid({ tenant, property }: TenantInfoGridProps) {
  const formatCurrency = (amount: number) => {
    return `Ksh ${amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB");
  };
  const getWalletRunway = () => {
    const walletBalance = tenant.walletBalance || 0;
    const months = tenant.dues?.walletCoverageMonths ?? 0;
    const remainder = tenant.dues?.walletCoverageRemainder ?? 0;

    if (walletBalance <= 0) return "No credit";

    if (months > 0 && remainder > 0) {
      return `${months} month${months === 1 ? "" : "s"} + ${formatCurrency(remainder)}`;
    }
    if (months > 0) {
      return `${months} month${months === 1 ? "" : "s"} covered`;
    }
    if (remainder > 0) {
      return `${formatCurrency(remainder)} toward next month`;
    }
    return "Credit available";
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "text-primary font-semibold bg-primary/10 px-3 py-1 rounded-full text-[11px]";
      case "current":
        return "text-primary font-semibold";
      case "overdue":
        return "text-red-600 font-semibold bg-red-50 px-3 py-1 rounded-full text-[11px]";
      default:
        return "text-gray-600";
    }
  };

  const getTenantStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-primary font-semibold";
      case "inactive":
        return "text-muted-foreground font-medium";
      case "evicted":
        return "text-red-700 font-semibold bg-red-100 px-3 py-1 rounded-full text-[11px]";
      default:
        return "text-muted-foreground";
    }
  };

  const infoItems = [
    { label: "Full Name", value: tenant.name },
    { label: "Email", value: tenant.email },
    { label: "Phone", value: tenant.phone },
    { label: "Property", value: property?.name || "Loading..." },
    { label: "Unit Type", value: tenant.unitType },
    { label: "House Number", value: tenant.houseNumber },
    { label: "Monthly Rent", value: formatCurrency(tenant.price) },
    { label: "Security Deposit", value: formatCurrency(tenant.deposit) },

    { label: "Lease Start", value: formatDate(tenant.leaseStartDate) },
    { label: "Lease End", value: formatDate(tenant.leaseEndDate) },

    {
      label: "Tenant Status",
      value: tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1),
      className: getTenantStatusColor(tenant.status),
    },
    {
      label: "Payment Status",
      value: tenant.paymentStatus === "paid" ? "Fully Paid" :
             tenant.paymentStatus === "current" ? "Current" : "Overdue",
      className: getPaymentStatusColor(tenant.paymentStatus),
    },

    // Accurate real-time values from payments collection
    {
      label: "Total Rent Paid",
      value: formatCurrency(tenant.totalRentPaid),
      className: "text-primary font-semibold",
    },
    {
      label: "Total Deposit Paid",
      value: formatCurrency(tenant.totalDepositPaid),
      className: "text-amber-600 font-semibold",
      note: tenant.totalDepositPaid >= tenant.deposit
        ? "Deposit Fully Paid"
        : `${formatCurrency(tenant.deposit - tenant.totalDepositPaid)} remaining`,
    },
    {
      label: "Total Utility Paid",
      value: formatCurrency(tenant.totalUtilityPaid),
      className: "text-indigo-600 font-semibold",
    },
    {
      label: "Wallet Balance",
      value: formatCurrency(tenant.walletBalance),
      className: "text-primary font-semibold",
    },
    {
      label: "Wallet Runway",
      value: getWalletRunway(),
      className: tenant.walletBalance > 0 ? "text-primary font-semibold" : "text-muted-foreground",
      note: tenant.walletBalance > 0 ? "Auto-applies to upcoming rent" : undefined,
    },

    // Dues — now 100% accurate because backend syncs from payments
    ...(tenant.dues
      ? [
          {
            label: "Rent Arrears",
            value: formatCurrency(tenant.dues.rentDues),
            className: tenant.dues.rentDues > 0
              ? "text-red-600 font-semibold"
              : "text-primary font-semibold",
          },
          {
            label: "Deposit Due",
            value: formatCurrency(tenant.dues.depositDues),
            className: tenant.dues.depositDues > 0
              ? "text-red-600 font-semibold"
              : "text-primary font-semibold",
          },
          {
            label: "Total Outstanding",
            value: formatCurrency(tenant.dues.totalRemainingDues),
            className: tenant.dues.totalRemainingDues > 0
              ? "text-red-700 font-semibold text-base sm:text-lg bg-red-50/80 px-3 py-2 rounded-xl"
              : "text-primary font-semibold text-base sm:text-lg bg-primary/10 px-3 py-2 rounded-xl",
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {infoItems.map((item, index) => (
        <div
          key={index}
          className="surface-card rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
            {item.label}
          </p>
          <p className={`text-sm sm:text-base font-semibold break-words ${item.className || "text-foreground"}`}>
            {item.value}
          </p>
          {item.note && (
            <span className="text-[11px] text-primary font-semibold mt-2">
              {item.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}




