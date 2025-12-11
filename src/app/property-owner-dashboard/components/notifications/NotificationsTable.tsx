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
    <div className="overflow-x-auto bg-white rounded-2xl shadow-lg">
      <table className="w-full table-fixed md:table-auto">
        <thead className="bg-gradient-to-r from-[#03a678]/10 to-[#02956a]/10">
          <tr>
            {viewMode === "sent" ? (
              <>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-3/12">Message</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-1/12">Type</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-2/12">Tenant</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-1/12">Date</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-2/12">Delivery</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-1/12">Status</th>
                <th className="text-left p-4 font-semibold text-[#012a4a] w-2/12">Actions</th>
              </>
            ) : (
              <>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Tenant</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Property</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Rent Due</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Utilities</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Deposit</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Total Due</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Due Date</th>
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
                className="border-t border-gray-100 hover:bg-[#03a678]/5 transition-colors cursor-pointer"
                onClick={() => onViewDetails(item)}
              >
                {viewMode === "sent" ? (
                  <>
                    <td className="p-4 text-sm align-top">
                      <div className="truncate max-w-full" title={item.message}>
                        {item.message?.slice(0, 50)}...
                      </div>
                    </td>
                    <td className="p-4 text-sm capitalize align-top">{item.type || "—"}</td>
                    <td className="p-4 text-sm align-top">{item.tenantName}</td>
                    <td className="p-4 text-sm align-top">
                      {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="p-4 text-sm align-top">{getDeliveryText(item)}</td>
                    <td className="p-4 align-top">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.status === "read"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.status
                          ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
                          : "—"}
                      </span>
                    </td>
                    <td
                      className="p-4 text-sm align-top"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => item.id && onMarkAsRead?.(item.id)}
                          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          title="Mark as read"
                        >
                          <Eye className="w-5 h-5" />
                          <span className="hidden md:inline">Mark Read</span>
                        </button>

                        <button
                          onClick={() => item.id && onRetry?.(item.id)}
                          className="flex items-center gap-1.5 text-yellow-600 hover:text-yellow-700 font-medium transition-colors"
                          title="Retry sending"
                        >
                          <RefreshCw className="w-5 h-5" />
                          <span className="hidden md:inline">Retry</span>
                        </button>

                        <button
                          onClick={() => item.id && onDelete?.(item.id)}
                          className="flex items-center gap-1.5 text-red-600 hover:text-red-800 font-medium transition-colors"
                          title="Delete notification"
                        >
                          <Trash2 className="w-5 h-5" />
                          <span className="hidden md:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4 text-sm">{item.tenantName}</td>
                    <td className="p-4 text-sm">{item.propertyName || "—"}</td>
                    <td className="p-4 text-sm font-medium">
                      Ksh. {item.rentDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="p-4 text-sm font-medium">
                      Ksh. {item.utilityDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="p-4 text-sm font-medium">
                      Ksh. {item.depositDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="p-4 text-sm font-bold text-[#03a678]">
                      Ksh. {item.totalDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="p-4 text-sm">{item.dueDate || "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}