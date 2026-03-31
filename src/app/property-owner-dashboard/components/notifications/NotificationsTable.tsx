// components/notifications/NotificationsTable.tsx

"use client";

import {
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Smartphone,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { format } from "date-fns";

interface TableRow {
  _id?: string;
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
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function NotificationsTable({
  items,
  viewMode,
  onViewDetails,
  onRetry,
  onDelete,
}: NotificationsTableProps) {
  const getDeliveryMeta = (item: TableRow) => {
    const method = item.deliveryMethod || "app";
    const status = (item.deliveryStatus || "pending").toLowerCase();
    const error = item.errorDetails || "";
    const deviceError = error.includes("1007");

    const channels =
      method === "both" ? ["sms", "email", "whatsapp"] : [method];

    const statusConfig =
      status === "success"
        ? {
            label: "Delivered",
            classes: "bg-emerald-50 text-emerald-700 ring-emerald-200",
            Icon: CheckCircle2,
          }
        : status === "failed"
        ? {
            label: "Failed",
            classes: "bg-rose-50 text-rose-700 ring-rose-200",
            Icon: AlertTriangle,
          }
        : {
            label: "Pending",
            classes: "bg-amber-50 text-amber-700 ring-amber-200",
            Icon: Clock,
          };

    return { method, channels, statusConfig, deviceError };
  };

  const renderChannelPill = (channel: string) => {
    const base =
      "inline-flex items-center gap-1 rounded-full bg-slate-50 text-slate-700 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200";
    switch (channel) {
      case "sms":
        return (
          <span className={base}>
            <Phone className="h-3 w-3" />
            SMS
          </span>
        );
      case "email":
        return (
          <span className={base}>
            <Mail className="h-3 w-3" />
            Email
          </span>
        );
      case "whatsapp":
        return (
          <span className={base}>
            <MessageCircle className="h-3 w-3" />
            WhatsApp
          </span>
        );
      default:
        return (
          <span className={base}>
            <Smartphone className="h-3 w-3" />
            In-App
          </span>
        );
    }
  };

  const renderDeliveryStatus = (item: TableRow) => {
    if (viewMode === "upcoming") {
      return <span className="table-muted">—</span>;
    }

    const { channels, statusConfig, deviceError } = getDeliveryMeta(item);
    const StatusIcon = statusConfig.Icon;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {channels.map((channel) => (
            <span key={channel}>{renderChannelPill(channel)}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${statusConfig.classes}`}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {statusConfig.label}
          </span>
          {deviceError && (
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[10px] font-semibold ring-1 ring-amber-200">
              Verify Device ID
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="md:hidden space-y-3">
        {items.map((item, index) => {
          const rowId = item._id || item.id;
          const uniqueKey =
            rowId ||
            (viewMode === "upcoming" && item.tenantId
              ? item.tenantId
              : `card-${viewMode}-${index}`);

          return viewMode === "sent" ? (
            <div
              key={uniqueKey}
              onClick={() => onViewDetails(item)}
              className="surface-card rounded-2xl border border-slate-200/70 p-4 transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Message</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {item.message?.slice(0, 80) || "—"}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold ${
                    item.status === "read"
                      ? "bg-primary/10 text-primary"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {item.status
                    ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
                    : "—"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold capitalize ring-1 ring-slate-200">
                  {item.type || "—"}
                </span>
                <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold ring-1 ring-slate-200">
                  {item.tenantName}
                </span>
                <span className="rounded-full bg-slate-50 px-2 py-1 font-semibold ring-1 ring-slate-200">
                  {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy") : "—"}
                </span>
              </div>

              <div className="mt-4">{renderDeliveryStatus(item)}</div>

              <div
                className="mt-4 flex items-center gap-3 text-[11px] font-semibold"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => rowId && onRetry?.(rowId)}
                  className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700 hover:bg-amber-100 transition-colors"
                  title="Retry sending"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>

                <button
                  onClick={() => rowId && onDelete?.(rowId)}
                  className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-rose-700 hover:bg-rose-100 transition-colors"
                  title="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div
              key={uniqueKey}
              onClick={() => onViewDetails(item)}
              className="surface-card rounded-2xl border border-slate-200/70 p-4 transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Upcoming</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{item.tenantName}</p>
                  <p className="text-xs text-muted-foreground">{item.propertyName || "—"}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  Due {item.dueDate || "—"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Rent</p>
                  <p className="mt-1 font-semibold">Ksh. {item.rentDue?.toFixed(2) ?? "0.00"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Utilities</p>
                  <p className="mt-1 font-semibold">Ksh. {item.utilityDue?.toFixed(2) ?? "0.00"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Deposit</p>
                  <p className="mt-1 font-semibold">Ksh. {item.depositDue?.toFixed(2) ?? "0.00"}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-2 ring-1 ring-primary/20">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-primary">Total Due</p>
                  <p className="mt-1 font-semibold text-primary">Ksh. {item.totalDue?.toFixed(2) ?? "0.00"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block table-shell">
        <div className="table-scroll">
          <table className="w-full table-auto">
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
                const rowId = item._id || item.id;
                const uniqueKey =
                  rowId ||
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
                        <td className="align-top">{renderDeliveryStatus(item)}</td>
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
                              onClick={() => rowId && onRetry?.(rowId)}
                              className="flex items-center gap-1.5 text-yellow-600 hover:text-yellow-700 transition-colors"
                              title="Retry sending"
                            >
                              <RefreshCw className="w-4 h-4" />
                              <span className="hidden md:inline">Retry</span>
                            </button>

                            <button
                              onClick={() => rowId && onDelete?.(rowId)}
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
    </div>
  );
}




