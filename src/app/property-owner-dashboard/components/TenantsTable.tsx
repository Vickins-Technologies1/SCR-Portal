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
  onEdit,
  onDelete,
  onResendWelcome,   // ← NEW
}: TenantsTableProps) {
  const router = useRouter();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());

  const toggleTenant = useCallback((tenantId: string) => {
    setExpandedTenants((prev) => {
      const newSet = new Set(prev);
      newSet.has(tenantId) ? newSet.delete(tenantId) : newSet.add(tenantId);
      return newSet;
    });
  }, []);

  const getUnitDisplayName = (tenant: ResponseTenant): string => {
    if (!tenant.unitIdentifier) return "—";
    const property = properties.find((p) => p._id === tenant.propertyId);
    const unit = property?.unitTypes.find((u) => u.uniqueType === tenant.unitIdentifier);
    if (!unit) return tenant.unitIdentifier;
    const configNumber = unit.uniqueType.includes("-") ? unit.uniqueType.split("-").pop() : unit.uniqueType;
    return `${unit.type} (Config ${configNumber})`;
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

  // Skeleton Row (Desktop)
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      {[...Array(8)].map((_, i) => (
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

  // Skeleton Card (Mobile)
  const SkeletonCard = () => (
    <div className="bg-white border rounded-lg p-4 shadow-sm animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="h-5 w-5 bg-gray-200 rounded"></div>
      </div>
      <div className="mt-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 rounded"></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Filter Tenants</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            name="tenantName"
            value={filters.tenantName}
            onChange={handleFilterChange}
            placeholder="Name"
            className="p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <input
            name="tenantEmail"
            value={filters.tenantEmail}
            onChange={handleFilterChange}
            placeholder="Email"
            className="p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <select
            name="propertyId"
            value={filters.propertyId}
            onChange={handleFilterChange}
            className="p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
          className="mt-4 px-4 py-2 bg-[#012a4a] text-white rounded-lg text-sm hover:bg-[#013a63] transition"
        >
          Clear Filters
        </button>
      </div>

      {/* Entries per page */}
      <div className="flex justify-end">
        <select
          value={limit}
          onChange={handleLimitChange}
          className="p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
        <>
          {/* Desktop Skeleton */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[...Array(9)].map((_, i) => (
                    <th key={i} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[...Array(6)].map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Skeleton */}
          <div className="lg:hidden space-y-4">
            {[...Array(5)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      ) : displayedTenants.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          <p className="text-lg">No tenants found.</p>
          <p className="text-sm mt-2">Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "propertyName", label: "Property" },
                    { key: "unitIdentifier", label: "Unit Type" },
                    { key: "price", label: "Rent" },
                    { key: "houseNumber", label: "House No." },
                    { key: "leaseStartDate", label: "Lease Start" },
                    { key: "status", label: "Status" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => debouncedHandleSort(key as any)}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <span className="flex items-center">
                        {label} {getSortIcon(key as any)}
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedTenants.map((tenant) => {
                  const property = properties.find((p) => p._id === tenant.propertyId);
                  return (
                    <tr
                      key={tenant._id}
                      className="hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => handleTenantClick(tenant._id)}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{tenant.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{property?.name || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{getUnitDisplayName(tenant)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Ksh {tenant.price.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{tenant.houseNumber || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(tenant.leaseStartDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
                            tenant.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onEdit(tenant)}
                            className="text-blue-600 hover:text-blue-800 transition"
                            title="Edit tenant"
                          >
                            <Pencil className="h-5 w-5" />
                          </button>

                          <button
                            onClick={() => onResendWelcome(tenant)}
                            className="text-green-600 hover:text-green-800 transition"
                            title="Resend welcome notification"
                          >
                            <Send className="h-5 w-5" />
                          </button>

                          <button
                            onClick={() => onDelete(tenant._id)}
                            className="text-red-600 hover:text-red-800 transition"
                            title="Delete tenant"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {displayedTenants.map((tenant) => {
              const property = properties.find((p) => p._id === tenant.propertyId);
              const isExpanded = expandedTenants.has(tenant._id);

              return (
                <div
                  key={tenant._id}
                  className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition"
                  onClick={() => handleTenantClick(tenant._id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                      <p className="text-sm text-gray-600">{property?.name || "Unknown Property"}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTenant(tenant._id);
                      }}
                      className="ml-3"
                    >
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3 text-sm">
                      <p><strong>Email:</strong> {tenant.email}</p>
                      <p><strong>Unit:</strong> {getUnitDisplayName(tenant)}</p>
                      <p><strong>Rent:</strong> Ksh {tenant.price.toLocaleString()}/mo</p>
                      <p><strong>House No:</strong> {tenant.houseNumber || "—"}</p>
                      <p>
                        <strong>Lease:</strong> {new Date(tenant.leaseStartDate).toLocaleDateString()} →{" "}
                        {new Date(tenant.leaseEndDate).toLocaleDateString()}
                      </p>
                      <p><strong>Status:</strong>{" "}
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
                            tenant.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </p>

                      <div className="flex gap-8 pt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(tenant);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit tenant"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onResendWelcome(tenant);
                          }}
                          className="text-green-600 hover:text-green-800"
                          title="Resend welcome notification"
                        >
                          <Send className="h-5 w-5" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(tenant._id);
                          }}
                          className="text-red-600 hover:text-red-800"
                          title="Delete tenant"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4">
            <p className="text-sm text-gray-600">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalTenants)} of {totalTenants} tenants
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-5 py-2 bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-5 py-2 bg-[#012a4a] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#013a63] transition"
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