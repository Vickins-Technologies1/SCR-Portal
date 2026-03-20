// components/notifications/NotificationsTable.tsx

"use client";

import { Trash2, RefreshCw, Eye } from "lucide-react";
import { format } from "date-fns";

interface TableRow {
  id?: string;
  message?: string;
  type?: string;
  tenantName: string;
  createdAt?: string;
  deliveryMethod?: string;
  deliveryStatus?: string;
  errorDetails?: string;
  status?: string;
  propertyName?: string;
  houseNumber?: string;
  rentDue?: number;
  utilityDue?: number;
  depositDue?: number;
  totalDue?: number;
  dueDate?: string;
  tenantId?: string;
}

interface NotificationsTableProps {
  items: TableRow[];
  viewMode: "sent" | "upcoming";
  onViewDetails: (item: TableRow) => void;
  onMarkAsRead?: (id: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function NotificationsTable({
  items,
  viewMode,
  onViewDetails,
  onMarkAsRead,
  onRetry,
  onDelete,
}: NotificationsTableProps) {
  const getDeliveryText = (item: TableRow) => {
    if (viewMode === "upcoming") return "—";
    const method = item.deliveryMethod || "app";
    const status = item.deliveryStatus || "pending";
    const error = item.errorDetails || "";
    const base =
      method === "both"
        ? "SMS, Email & WhatsApp"
        : method.charAt(0).toUpperCase() + method.slice(1);
    return error.includes("1007")
      ? `${base} - Verify Device ID`
      : `${base} (${status})`;
  };

  return (
    <div className="table-shell">
      <div className="table-scroll">
        <table className="w-full table-fixed md:table-auto">
        <thead>
          <tr>
            {viewMode === "sent" ? (
              <>
                <th className="w-3/12">Message</th>
                <th className="w-1/12">Type</th>
                <th className="w-2/12">Tenant</th>
                <th className="w-1/12">Date</th>
                <th className="w-2/12">Delivery</th>
                <th className="w-1/12">Status</th>
                <th className="w-2/12">Actions</th>
              </>
            ) : (
              <>
                <th>Tenant</th>
                <th>Property</th>
                <th>Rent Due</th>
                <th>Utilities</th>
                <th>Deposit</th>
                <th>Total Due</th>
                <th>Due Date</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const uniqueKey =
              item.id ||
              (viewMode === "upcoming" && item.tenantId
                ? item.tenantId
                : `row-${viewMode}-${index}`);

            return (
              <tr
                key={uniqueKey}
                className="hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => onViewDetails(item)}
              >
                {viewMode === "sent" ? (
                  <>
                    <td className="align-top text-xs sm:text-sm">
                      <div className="truncate max-w-full" title={item.message}>
                        {item.message?.slice(0, 50)}...
                      </div>
                    </td>
                    <td className="capitalize align-top text-xs sm:text-sm">{item.type || "—"}</td>
                    <td className="align-top text-xs sm:text-sm">{item.tenantName}</td>
                    <td className="align-top text-xs sm:text-sm">
                      {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="align-top text-xs sm:text-sm">{getDeliveryText(item)}</td>
                    <td className="align-top">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                          item.status === "read"
                            ? "bg-primary/10 text-primary"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.status
                          ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
                          : "—"}
                      </span>
                    </td>
                    <td className="align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3 text-[11px] sm:text-xs font-semibold">
                        <button
                          onClick={() => item.id && onMarkAsRead?.(item.id)}
                          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors"
                          title="Mark as read"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden md:inline">Mark Read</span>
                        </button>

                        <button
                          onClick={() => item.id && onRetry?.(item.id)}
                          className="flex items-center gap-1.5 text-yellow-600 hover:text-yellow-700 transition-colors"
                          title="Retry sending"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span className="hidden md:inline">Retry</span>
                        </button>

                        <button
                          onClick={() => item.id && onDelete?.(item.id)}
                          className="flex items-center gap-1.5 text-red-600 hover:text-red-800 transition-colors"
                          title="Delete notification"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden md:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="text-xs sm:text-sm">{item.tenantName}</td>
                    <td className="text-xs sm:text-sm">{item.propertyName || "—"}</td>
                    <td className="text-xs sm:text-sm font-semibold">
                      Ksh. {item.rentDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="text-xs sm:text-sm font-semibold">
                      Ksh. {item.utilityDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="text-xs sm:text-sm font-semibold">
                      Ksh. {item.depositDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="text-xs sm:text-sm font-bold text-primary">
                      Ksh. {item.totalDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="text-xs sm:text-sm">{item.dueDate || "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}




