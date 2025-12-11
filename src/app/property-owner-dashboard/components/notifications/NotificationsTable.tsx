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
  tenantId?: string; // Added for unique key in upcoming reminders
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
    const base = method === "both" ? "SMS, Email & WhatsApp" : method.charAt(0).toUpperCase() + method.slice(1);
    return error.includes("1007") ? `${base} - Verify Device ID` : `${base} (${status})`;
  };

  return (
    <div className="overflow-x-auto bg-white rounded-2xl shadow-lg">
      <table className="w-full">
        <thead className="bg-gradient-to-r from-[#03a678]/10 to-[#02956a]/10">
          <tr>
            {viewMode === "sent" ? (
              <>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Message</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Type</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Tenant</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Date</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Delivery</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Status</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Actions</th>
              </>
            ) : (
              <>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Tenant</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Property</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Rent Due</th>
                <th className="text0-left p-4 font-semibold text-[#012a4a]">Utilities</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Deposit</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Total Due</th>
                <th className="text-left p-4 font-semibold text-[#012a4a]">Due Date</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            // Generate a truly unique key
            const uniqueKey =
              item.id ||
              (viewMode === "upcoming" && item.tenantId
                ? item.tenantId
                : `row-${viewMode}-${index}`);

            return (
              <tr
                key={uniqueKey}
                onClick={() => onViewDetails(item)}
                className="border-t border-gray-100 hover:bg-[#03a678]/5 cursor-pointer transition-colors"
              >
                {viewMode === "sent" ? (
                  <>
                    <td className="p-4 text-sm">{item.message?.slice(0, 50)}...</td>
                    <td className="p-4 text-sm capitalize">{item.type || "—"}</td>
                    <td className="p-4 text-sm">{item.tenantName}</td>
                    <td className="p-4 text-sm">
                      {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="p-4 text-sm">{getDeliveryText(item)}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.status === "read"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "—"}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                        {onMarkAsRead && item.status !== "read" && item.id && (
                          <button
                            onClick={() => onMarkAsRead(item.id!)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" /> Mark Read
                          </button>
                        )}
                        {onRetry && item.deliveryStatus === "failed" && item.id && (
                          <button
                            onClick={() => onRetry(item.id!)}
                            disabled={item.errorDetails?.includes("1007")}
                            className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1 disabled:opacity-50"
                            title={item.errorDetails?.includes("1007") ? "Verify WhatsApp device ID" : ""}
                          >
                            <RefreshCw className="w-4 h-4" /> Retry
                          </button>
                        )}
                        {onDelete && item.id && (
                          <button
                            onClick={() => onDelete(item.id!)}
                            className="text-red-600 hover:text-red-800 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4 text-sm">{item.tenantName}</td>
                    <td className="p-4 text-sm">{item.propertyName || "—"}</td>
                    <td className="p-4 text-sm font-medium">Ksh. {item.rentDue?.toFixed(2) ?? "0.00"}</td>
                    <td className="p-4 text-sm font-medium">Ksh. {item.utilityDue?.toFixed(2) ?? "0.00"}</td>
                    <td className="p-4 text-sm font-medium">Ksh. {item.depositDue?.toFixed(2) ?? "0.00"}</td>
                    <td className="p-4 text-sm font-bold text-[#03a678]">
                      Ksh. {item.totalDue?.toFixed(2) ?? "0.00"}
                    </td>
                    <td className="p-4 text-sm">{item.dueDate || "—"}</td>
  {/* Fixed typo: was missing closing > */}
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