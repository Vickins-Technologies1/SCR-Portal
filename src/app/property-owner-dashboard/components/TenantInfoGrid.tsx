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

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full";
      case "current":
        return "text-emerald-600 font-bold";
      case "overdue":
        return "text-red-600 font-bold bg-red-50 px-3 py-1 rounded-full";
      default:
        return "text-gray-600";
    }
  };

  const getTenantStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-600 font-bold";
      case "inactive":
        return "text-gray-600 font-medium";
      case "evicted":
        return "text-red-700 font-bold bg-red-100 px-3 py-1 rounded-full";
      default:
        return "text-gray-600";
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
      className: "text-blue-600 font-bold",
    },
    {
      label: "Total Deposit Paid",
      value: formatCurrency(tenant.totalDepositPaid),
      className: "text-orange-600 font-bold",
      note: tenant.totalDepositPaid >= tenant.deposit
        ? "Deposit Fully Paid"
        : `${formatCurrency(tenant.deposit - tenant.totalDepositPaid)} remaining`,
    },
    {
      label: "Total Utility Paid",
      value: formatCurrency(tenant.totalUtilityPaid),
      className: "text-purple-600 font-bold",
    },
    {
      label: "Wallet Balance",
      value: formatCurrency(tenant.walletBalance),
      className: "text-emerald-600 font-bold",
    },

    // Dues — now 100% accurate because backend syncs from payments
    ...(tenant.dues
      ? [
          {
            label: "Rent Arrears",
            value: formatCurrency(tenant.dues.rentDues),
            className: tenant.dues.rentDues > 0
              ? "text-red-600 font-bold"
              : "text-green-600",
          },
          {
            label: "Deposit Due",
            value: formatCurrency(tenant.dues.depositDues),
            className: tenant.dues.depositDues > 0
              ? "text-red-600 font-bold"
              : "text-green-600",
          },
          {
            label: "Total Outstanding",
            value: formatCurrency(tenant.dues.totalRemainingDues),
            className: tenant.dues.totalRemainingDues > 0
              ? "text-red-700 font-bold text-xl bg-red-50 px-4 py-2 rounded-xl"
              : "text-green-700 font-bold text-xl bg-green-50 px-4 py-2 rounded-xl",
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {infoItems.map((item, index) => (
        <div
          key={index}
          className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
        >
          <p className="text-sm font-medium text-slate-600 mb-2">{item.label}</p>
          <p className={`text-lg font-semibold break-words ${item.className || "text-slate-900"}`}>
            {item.value}
          </p>
          {item.note && (
            <span className="text-xs text-green-600 font-semibold mt-2 italic">
              {item.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}