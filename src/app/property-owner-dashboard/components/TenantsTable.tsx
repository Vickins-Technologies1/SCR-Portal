"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";
import { ArrowUpDown, Pencil, Trash2, ChevronDown, ChevronUp, Send } from "lucide-react";

import { ResponseTenant } from "../../../types/tenant";

interface ClientProperty {
  _id: string;
  name: string;
  address: string;
  unitTypes: {
    uniqueType: string;
    type: string;
    price: number;
    deposit: number;
    managementType: "RentCollection" | "FullManagement";
    quantity: number;
    available?: number;
  }[];
  managementFee: number;
  createdAt: string;
  updatedAt: string;
  rentPaymentDate: string;
  ownerId: string;
  status: string;
}

interface FilterConfig {
  tenantName: string;
  tenantEmail: string;
  propertyId: string;
  unitType: string;
}

interface SortConfig {
  key: keyof ResponseTenant | "propertyName";
  direction: "asc" | "desc";
}

interface TenantsTableProps {
  tenants: ResponseTenant[];
  properties: ClientProperty[];
  filters: FilterConfig;
  setFilters: React.Dispatch<React.SetStateAction<FilterConfig>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  limit: number;
  setLimit: React.Dispatch<React.SetStateAction<number>>;
  totalTenants: number;
  isLoading: boolean;
  userId: string | null;
  csrfToken: string | null | undefined;
  canManageTenants?: boolean;
  canSendNotifications?: boolean;
  pendingDeletionIds?: string[];
  onEdit: (tenant: ResponseTenant) => void;
  onDelete: (id: string) => void;
  onResendWelcome: (tenant: ResponseTenant) => void;   // ← NEW prop
}

export default function TenantsTable({
  tenants,
  properties,
  filters,
  setFilters,
  page,
  setPage,
  limit,
  setLimit,
  totalTenants,
  isLoading,
  userId,
  csrfToken,
  canManageTenants = true,
  canSendNotifications = true,
  pendingDeletionIds = [],
  onEdit,
  onDelete,
  onResendWelcome,   // ← NEW
}: TenantsTableProps) {
  const router = useRouter();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const pendingDeletionSet = useMemo(() => new Set(pendingDeletionIds), [pendingDeletionIds]);

  const getTenantLeaseUnits = (tenant: ResponseTenant) => {
    if (tenant.leasedUnits && tenant.leasedUnits.length > 0) {
      return tenant.leasedUnits;
    }
    return [{
      unitIdentifier: tenant.unitIdentifier,
      unitType: tenant.unitType,
      houseNumber: tenant.houseNumber,
      price: tenant.price,
      deposit: tenant.deposit,
    }];
  };

  const getUnitDisplayName = (tenant: ResponseTenant, unitIdentifier?: string, unitType?: string): string => {
    if (!unitIdentifier && !unitType) return "—";
    const property = properties.find((p) => p._id === tenant.propertyId);
    const unit = unitIdentifier
      ? property?.unitTypes.find((u) => u.uniqueType === unitIdentifier)
      : undefined;
    const baseType = unit?.type || unitType || unitIdentifier || "—";
    if (!unitIdentifier) return baseType;
    const configNumber = unitIdentifier.includes("-") ? unitIdentifier.split("-").pop() : unitIdentifier;
    return `${baseType} (Config ${configNumber})`;
  };

  const displayedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      const { key, direction } = sortConfig;

      if (key === "price" || key === "totalRentPaid" || key === "totalUtilityPaid" || key === "totalDepositPaid") {
        const aVal = (a[key] ?? 0) as number;
        const bVal = (b[key] ?? 0) as number;
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      if (key === "createdAt" || key === "leaseStartDate" || key === "leaseEndDate") {
        return direction === "asc"
          ? new Date(a[key] as string).getTime() - new Date(b[key] as string).getTime()
          : new Date(b[key] as string).getTime() - new Date(a[key] as string).getTime();
      }

      if (key === "propertyName") {
        const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
        const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
        return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
      }

      const aVal = (a[key] ?? "").toString().toLowerCase();
      const bVal = (b[key] ?? "").toString().toLowerCase();
      return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [tenants, sortConfig, properties]);

  const debouncedHandleSort = useMemo(
    () =>
      debounce((key: keyof ResponseTenant | "propertyName") => {
        setSortConfig((prev) => ({
          key,
          direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }));
      }, 300),
    []
  );

  const handleLimitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLimit = parseInt(e.target.value, 10);
      setLimit(newLimit);
      setPage(1);
    },
    [setLimit, setPage]
  );

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFilters((prev) => ({ ...prev, [name]: value }));
      setPage(1);
    },
    [setFilters, setPage]
  );

  const clearFilters = useCallback(() => {
    setFilters({ tenantName: "", tenantEmail: "", propertyId: "", unitType: "" });
    setPage(1);
  }, [setFilters, setPage]);

  const getSortIcon = (key: keyof ResponseTenant | "propertyName") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 text-gray-400" />;
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="ml-2 h-4 w-4 text-blue-600" />
    ) : (
      <ChevronDown className="ml-2 h-4 w-4 text-blue-600" />
    );
  };

  const handleTenantClick = (tenantId: string) => {
    if (!userId || !csrfToken) {
      router.replace("/");
      return;
    }
    router.push(`/property-owner-dashboard/tenants/${tenantId}`);
  };

  const totalPages = Math.ceil(totalTenants / limit);

  const uniqueUnitIdentifiers = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) =>
      p.unitTypes.forEach((u) => u.uniqueType && set.add(u.uniqueType))
    );
    return Array.from(set);
  }, [properties]);

  const getPaymentSnapshot = (tenant: ResponseTenant) => {
    const overdueBalance = Math.max(tenant.dues?.totalRemainingDues ?? 0, 0);
    const statusText = (tenant.paymentStatus || "").toLowerCase();
    const isOverdue = statusText === "overdue" || overdueBalance > 0;
    return {
      isOverdue,
      label: isOverdue ? "Overdue" : "Up to date",
      overdueBalance,
    };
  };

  const formatCurrency = (amount: number) => `Ksh ${amount.toLocaleString()}`;

  // Skeleton Row (Desktop)
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-gray-200 rounded"></div>
        </td>
      ))}
      <td className="px-6 py-4">
        <div className="flex gap-3">
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="surface-card rounded-2xl p-5 sm:p-6" data-tour="owner-tenant-filters">
        <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">Filter Tenants</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            name="tenantName"
            value={filters.tenantName}
            onChange={handleFilterChange}
            placeholder="Name"
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
          />
          <input
            name="tenantEmail"
            value={filters.tenantEmail}
            onChange={handleFilterChange}
            placeholder="Email"
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
          />
          <select
            name="propertyId"
            value={filters.propertyId}
            onChange={handleFilterChange}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            name="unitType"
            value={filters.unitType}
            onChange={handleFilterChange}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
          >
            <option value="">All Unit Types</option>
            {uniqueUnitIdentifiers.map((uniqueType) => {
              const unitConfig = properties
                .flatMap((p) => p.unitTypes)
                .find((u) => u.uniqueType === uniqueType);
              const displayName = unitConfig
                ? `${unitConfig.type} (${uniqueType})`
                : uniqueType;

              return (
                <option key={uniqueType} value={uniqueType}>
                  {displayName}
                </option>
              );
            })}
          </select>
        </div>
        <button
          onClick={clearFilters}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary-hover transition"
        >
          Clear Filters
        </button>
      </div>

      {/* Entries per page */}
      <div className="flex justify-end">
        <select
          value={limit}
          onChange={handleLimitChange}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm bg-white/80 focus:ring-4 focus:ring-primary/30 focus:border-primary outline-none"
        >
          {[10, 25, 50, 100].map((v) => (
            <option key={v} value={v}>
              {v} per page
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="table-shell table-compact">
          <div className="table-scroll">
            <table className="tenants-table">
              <thead>
              <tr>
                {[...Array(11)].map((_, i) => (
                  <th key={i}>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(6)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : displayedTenants.length === 0 ? (
        <div className="text-center py-12 surface-card rounded-2xl text-gray-600">
          <p className="text-base font-semibold">No tenants found.</p>
          <p className="text-xs sm:text-sm mt-2 text-muted-foreground">Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          {/* Tenants Table */}
          <div className="table-shell table-compact" data-tour="owner-tenant-table">
            <div className="table-scroll">
              <table className="tenants-table">
                <thead>
                <tr>
                  {[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "propertyName", label: "Property" },
                    { key: "unitIdentifier", label: "Unit Type" },
                    { key: "price", label: "Rent" },
                    { key: "houseNumber", label: "House No." },
                    { key: "paymentStatus", label: "Payment Status" },
                    { key: "overdueBalance", label: "Overdue Balance" },
                    { key: "status", label: "Status" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => { if (key !== "overdueBalance") debouncedHandleSort(key as any); }}
                      className="cursor-pointer hover:bg-gray-100/70 transition"
                    >
                      <span className="flex items-center">
                        {label} {key === "overdueBalance" ? (
                          <ArrowUpDown className="ml-2 h-4 w-4 text-gray-300" />
                        ) : (
                          getSortIcon(key as any)
                        )}
                      </span>
                    </th>
                  ))}
                  <th data-tour="owner-tenant-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedTenants.map((tenant) => {
                  const property = properties.find((p) => p._id === tenant.propertyId);
                  const leaseUnits = getTenantLeaseUnits(tenant);
                  const paymentSnapshot = getPaymentSnapshot(tenant);
                  const hasPendingDeletion = pendingDeletionSet.has(tenant._id);
                  return (
                    <tr
                      key={tenant._id}
                      className="hover:bg-primary/5 cursor-pointer transition"
                      onClick={() => handleTenantClick(tenant._id)}
                    >
                      <td className="font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{tenant.name}</span>
                          {hasPendingDeletion && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full font-semibold bg-yellow-100 text-yellow-800">
                              Pending deletion
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-gray-600">{tenant.email}</td>
                      <td className="text-gray-600">{property?.name || "—"}</td>
                      <td className="text-gray-600">
                        <div className="space-y-1">
                          {leaseUnits.map((unit, idx) => (
                            <div key={`${unit.unitIdentifier}-${idx}`} className="text-xs text-gray-600">
                              {getUnitDisplayName(tenant, unit.unitIdentifier, unit.unitType)}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-gray-600">Ksh {tenant.price.toLocaleString()}</td>
                      <td className="text-gray-600">
                        <div className="space-y-1">
                          {leaseUnits.map((unit, idx) => (
                            <div key={`${unit.houseNumber}-${idx}`} className="text-xs text-gray-600">
                              {unit.houseNumber || "—"}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${
                            paymentSnapshot.isOverdue
                              ? "bg-red-100 text-red-800"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {paymentSnapshot.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`font-medium ${
                            paymentSnapshot.isOverdue ? "text-red-700" : "text-primary"
                          }`}
                        >
                          {formatCurrency(paymentSnapshot.overdueBalance)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${
                            tenant.status === "active"
                              ? "bg-primary/10 text-primary"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </td>
                      <td>
                        {(canManageTenants || canSendNotifications) ? (
                          <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                            {canManageTenants && (
                              <button
                                onClick={() => onEdit(tenant)}
                                className="text-blue-600 hover:text-blue-800 transition"
                                title="Edit tenant"
                              >
                                <Pencil className="h-5 w-5" />
                              </button>
                            )}

                            {canSendNotifications && (
                              <button
                                onClick={() => onResendWelcome(tenant)}
                                className="text-primary hover:text-primary transition"
                                title="Resend welcome notification"
                              >
                                <Send className="h-5 w-5" />
                              </button>
                            )}

                            {canManageTenants && (
                              <button
                                onClick={() => onDelete(tenant._id)}
                                className="text-red-600 hover:text-red-800 transition"
                                title="Delete tenant"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalTenants)} of {totalTenants} tenants
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover transition"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}















