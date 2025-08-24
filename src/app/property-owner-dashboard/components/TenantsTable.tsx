"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";
import { ArrowUpDown, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

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

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string; // This corresponds to unitTypes.uniqueType
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  status: string;
  paymentStatus: string;
}

interface FilterConfig {
  tenantName: string;
  tenantEmail: string;
  propertyId: string;
  unitType: string;
}

interface SortConfig {
  key: keyof Tenant | "propertyName";
  direction: "asc" | "desc";
}

interface LogMeta {
  [key: string]: unknown;
}

interface TenantsTableProps {
  tenants: Tenant[];
  properties: ClientProperty[];
  filters: FilterConfig;
  setFilters: React.Dispatch<React.SetStateAction<FilterConfig>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  limit: number;
  totalTenants: number;
  isLoading: boolean;
  userId: string | null;
  csrfToken: string | null | undefined;
  onEdit: (tenant: Tenant) => void;
  onDelete: (id: string) => void;
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[WARN] ${message}`, meta || "");
    }
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
  info: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[INFO] ${message}`, meta || "");
    }
  },
};

export default function TenantsTable({
  tenants,
  properties,
  filters,
  setFilters,
  page,
  setPage,
  limit,
  totalTenants,
  isLoading,
  userId,
  csrfToken,
  onEdit,
  onDelete,
}: TenantsTableProps) {
  const router = useRouter();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());

  // Toggle collapse/expand for a tenant
  const toggleTenant = useCallback((tenantId: string) => {
    setExpandedTenants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tenantId)) {
        newSet.delete(tenantId);
      } else {
        newSet.add(tenantId);
      }
      return newSet;
    });
  }, []);

  // Remove client-side filtering since API handles it
  const displayedTenants = useMemo(() => {
    logger.debug("Sorting tenants", { tenantCount: tenants.length, sortConfig });
    const sortedTenants = [...tenants].sort((a, b) => {
      const { key, direction } = sortConfig;
      if (key === "price" || key === "totalRentPaid" || key === "totalUtilityPaid" || key === "totalDepositPaid") {
        const aVal = (a[key] ?? 0) as number;
        const bVal = (b[key] ?? 0) as number;
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (key === "createdAt" || key === "leaseStartDate" || key === "leaseEndDate") {
        return direction === "asc"
          ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
          : new Date(b[key]).getTime() - new Date(a[key]).getTime();
      }
      if (key === "propertyName") {
        const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
        const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
        return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
      }
      const aVal = (a[key] ?? "").toString();
      const bVal = (b[key] ?? "").toString();
      return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return sortedTenants;
  }, [tenants, sortConfig, properties]);

  const debouncedHandleSort = useMemo(
    () =>
      debounce((key: keyof Tenant | "propertyName") => {
        logger.debug("Sorting tenants", { sortKey: key, sortDirection: sortConfig.direction });
        setSortConfig((prev) => ({
          key,
          direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }));
      }, 300),
    [sortConfig.direction]
  );

  const debouncedSetPage = useMemo(
    () => debounce((newPage: number) => {
      if (newPage >= 1) {
        setPage(newPage);
      }
    }, 300),
    [setPage]
  );

  useEffect(() => {
    logger.debug("TenantsTable received tenants", { tenantCount: tenants.length });
    return () => {
      debouncedHandleSort.cancel();
      debouncedSetPage.cancel();
    };
  }, [tenants, debouncedHandleSort, debouncedSetPage]);

  useEffect(() => {
    const totalPages = Math.ceil(totalTenants / limit);
    if (page > totalPages && totalPages > 0) {
      logger.debug("Adjusting page due to totalTenants change", { page, totalPages });
      setPage(totalPages);
    }
  }, [page, totalTenants, limit, setPage]);

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      logger.debug("Filter changed", { name, value });
      setFilters((prev) => ({ ...prev, [name]: value }));
      setPage(1);
    },
    [setFilters, setPage]
  );

  const clearFilters = useCallback(() => {
    logger.debug("Clearing filters");
    setFilters({ tenantName: "", tenantEmail: "", propertyId: "", unitType: "" });
    setPage(1);
  }, [setFilters, setPage]);

  const getSortIcon = useCallback(
    (key: keyof Tenant | "propertyName") => {
      if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-2 h-4 w-4 text-gray-500" />;
      return sortConfig.direction === "asc" ? (
        <span className="inline ml-2 text-dark-blue-600">↑</span>
      ) : (
        <span className="inline ml-2 text-dark-blue-600">↓</span>
      );
    },
    [sortConfig]
  );

  const handleTenantClick = useCallback(
    (tenantId: string) => {
      if (!userId || csrfToken === undefined || csrfToken === null) {
        logger.error("Session expired during tenant click", { userId, csrfToken });
        router.replace("/");
        return;
      }
      logger.debug("Navigating to tenant details", { tenantId });
      router.push(`/property-owner-dashboard/tenants/${tenantId}`);
    },
    [userId, csrfToken, router]
  );

  const totalPages = Math.ceil(totalTenants / limit);

  return (
    <div className="space-y-6">
      {/* Filter Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Filter Tenants</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
            <input
              name="tenantName"
              value={filters.tenantName}
              onChange={handleFilterChange}
              placeholder="Enter tenant name"
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dark-blue-600 focus:border-dark-blue-600 transition text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Email</label>
            <input
              name="tenantEmail"
              value={filters.tenantEmail}
              onChange={handleFilterChange}
              placeholder="Enter tenant email"
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dark-blue-600 focus:border-dark-blue-600 transition text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select
              name="propertyId"
              value={filters.propertyId}
              onChange={handleFilterChange}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dark-blue-600 focus:border-dark-blue-600 transition text-sm"
            >
              <option value="">All Properties</option>
              {properties.map((property) => (
                <option key={property._id} value={property._id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
            <select
              name="unitType"
              value={filters.unitType}
              onChange={handleFilterChange}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dark-blue-600 focus:border-dark-blue-600 transition text-sm"
            >
              <option value="">All Unit Types</option>
              {[...new Set(properties.flatMap((p) => p.unitTypes.map((u) => u.uniqueType)))].map((uniqueType) => (
                <option key={uniqueType} value={uniqueType}>
                  {properties
                    .flatMap((p) => p.unitTypes)
                    .find((u) => u.uniqueType === uniqueType)?.type || uniqueType}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={clearFilters}
          className="mt-4 px-4 py-2 bg-dark-blue-600 text-white rounded-lg hover:bg-dark-blue-700 transition text-sm font-medium"
        >
          Clear Filters
        </button>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="text-center text-gray-600 py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-dark-blue-600"></div>
          <span className="ml-3 text-sm font-medium">Loading tenants...</span>
        </div>
      ) : displayedTenants.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600 text-center text-sm">
          No tenants found. Adjust filters or add a tenant to get started.
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  {[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "propertyName", label: "Property" },
                    { key: "unitType", label: "Unit Type" },
                    { key: "price", label: "Rent (Ksh)" },
                    { key: "deposit", label: "Deposit (Ksh)" },
                    { key: "houseNumber", label: "House Number" },
                    { key: "leaseStartDate", label: "Lease Start" },
                    { key: "leaseEndDate", label: "Lease End" },
                    { key: "totalRentPaid", label: "Total Rent Paid (Ksh)" },
                    { key: "totalUtilityPaid", label: "Total Utility Paid (Ksh)" },
                    { key: "totalDepositPaid", label: "Total Deposit Paid (Ksh)" },
                    { key: "status", label: "Status" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                      onClick={() => debouncedHandleSort(key as keyof Tenant | "propertyName")}
                    >
                      {label} {getSortIcon(key as keyof Tenant | "propertyName")}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedTenants.map((tenant) => {
                  const property = properties.find((p) => p._id === tenant.propertyId);
                  return (
                    <tr
                      key={tenant._id}
                      className="hover:bg-gray-50 transition duration-200 ease-in-out cursor-pointer"
                      onClick={() => handleTenantClick(tenant._id)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{property?.name || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {property?.unitTypes.find((u) => u.uniqueType === tenant.unitType)?.type || tenant.unitType}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.price.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.deposit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.houseNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{new Date(tenant.leaseStartDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{new Date(tenant.leaseEndDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.totalRentPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.totalUtilityPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{tenant.totalDepositPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tenant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(tenant);
                            }}
                            className="text-dark-blue-600 hover:text-dark-blue-800 transition focus:outline-none"
                            aria-label={`Edit tenant ${tenant.name}`}
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(tenant._id);
                            }}
                            className="text-red-600 hover:text-red-800 transition focus:outline-none"
                            aria-label={`Delete tenant ${tenant.name}`}
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

          {/* Mobile Card Layout */}
          <div className="lg:hidden space-y-4 p-4">
            {displayedTenants.map((tenant) => {
              const property = properties.find((p) => p._id === tenant.propertyId);
              const isExpanded = expandedTenants.has(tenant._id);
              return (
                <div
                  key={tenant._id}
                  className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition duration-200"
                >
                  <div
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleTenant(tenant._id)}
                    aria-label={isExpanded ? `Collapse tenant ${tenant.name} details` : `Expand tenant ${tenant.name} details`}
                  >
                    <div className="font-semibold text-gray-700 text-sm">{tenant.name}</div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-semibold">Property:</span> {property?.name || "Unknown"}
                  </div>
                  {isExpanded && (
                    <div className="grid grid-cols-1 gap-2 text-sm mt-2">
                      <div>
                        <span className="font-semibold text-gray-700">Email:</span> {tenant.email}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Unit Type:</span>{" "}
                        {property?.unitTypes.find((u) => u.uniqueType === tenant.unitType)?.type || tenant.unitType}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Rent:</span> {tenant.price.toLocaleString()} Ksh
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Deposit:</span> {tenant.deposit.toLocaleString()} Ksh
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">House Number:</span> {tenant.houseNumber}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Lease Start:</span>{" "}
                        {new Date(tenant.leaseStartDate).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Lease End:</span>{" "}
                        {new Date(tenant.leaseEndDate).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Total Rent Paid:</span>{" "}
                        {tenant.totalRentPaid.toLocaleString()} Ksh
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Total Utility Paid:</span>{" "}
                        {tenant.totalUtilityPaid.toLocaleString()} Ksh
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Total Deposit Paid:</span>{" "}
                        {tenant.totalDepositPaid.toLocaleString()} Ksh
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Status:</span>{" "}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tenant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(tenant);
                          }}
                          className="text-dark-blue-600 hover:text-dark-blue-800 transition focus:outline-none"
                          aria-label={`Edit tenant ${tenant.name}`}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(tenant._id);
                          }}
                          className="text-red-600 hover:text-red-800 transition focus:outline-none"
                          aria-label={`Delete tenant ${tenant.name}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                  {!isExpanded && (
                    <div className="mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTenantClick(tenant._id);
                        }}
                        className="text-dark-blue-600 hover:text-dark-blue-800 transition text-sm font-medium"
                        aria-label={`View details for tenant ${tenant.name}`}
                      >
                        View Details
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-4 sm:mb-0">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalTenants)} of {totalTenants} tenants
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => debouncedSetPage(page - 1)}
                disabled={page === 1 || isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  page === 1 || isLoading
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-dark-blue-600 text-white hover:bg-dark-blue-700"
                }`}
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                onClick={() => debouncedSetPage(page + 1)}
                disabled={page >= totalPages || isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  page >= totalPages || isLoading
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-dark-blue-600 text-white hover:bg-dark-blue-700"
                }`}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
        body {
          font-family: "Inter", sans-serif;
        }
        :root {
          --dark-blue-600: #1e3a8a;
          --dark-blue-700: #1e40af;
          --dark-blue-800: #1e40af;
        }
        .bg-dark-blue-600 {
          background-color: var(--dark-blue-600);
        }
        .bg-dark-blue-700 {
          background-color: var(--dark-blue-700);
        }
        .text-dark-blue-600 {
          color: var(--dark-blue-600);
        }
        .text-dark-blue-800 {
          color: var(--dark-blue-800);
        }
        .focus\\:ring-dark-blue-600 {
          --tw-ring-color: var(--dark-blue-600);
        }
        .focus\\:border-dark-blue-600 {
          border-color: var(--dark-blue-600);
        }
        .border-dark-blue-600 {
          border-color: var(--dark-blue-600);
        }
        th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #f3f4f6;
        }
        tr {
          transition: background-color 0.2s ease-in-out;
        }
        @media (max-width: 1024px) {
          .lg\\:block {
            display: none;
          }
          .lg\\:hidden {
            display: block;
          }
        }
      `}</style>
    </div>
  );
}