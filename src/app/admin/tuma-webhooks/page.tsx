"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, Clock, RefreshCw, XCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

interface WebhookEvent {
  _id: string;
  receivedAt: string | null;
  merchantRequestId: string;
  checkoutRequestId: string;
  paymentGatewayId: string;
  status: string;
  resultCode: number | null;
  resultDesc: string;
  reference: string;
  amount: number | null;
  phoneNumber: string;
  timestamp: string;
  paymentId: string;
  paymentStatus: string;
  paymentMatched: boolean | null;
  rawBody: string;
}

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

const statusLabel = (value: string) => {
  if (!value) return "unknown";
  return value.replace(/_/g, " ");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TumaWebhooksPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Session invalid");
      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");
      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  const fetchWebhooks = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tuma/webhooks?limit=75", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.webhooks || []);
      } else {
        setError(data.message || "Failed to fetch webhook events.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to fetch webhook events.");
    } finally {
      setIsLoading(false);
    }
  }, [router, status]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchWebhooks();
    }
  }, [status, fetchWebhooks]);

  const summary = useMemo(() => {
    const counts = { completed: 0, failed: 0, cancelled: 0, pending: 0 };
    events.forEach((event) => {
      const normalized = (event.paymentStatus || event.status || "").toLowerCase();
      if (normalized.includes("complete") || normalized === "success" || normalized === "received") {
        counts.completed += 1;
      } else if (normalized.includes("cancel")) {
        counts.cancelled += 1;
      } else if (normalized.includes("fail")) {
        counts.failed += 1;
      } else {
        counts.pending += 1;
      }
    });
    return counts;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((event) => {
      const normalized = (event.paymentStatus || event.status || "").toLowerCase();
      if (filter === "completed") {
        return normalized.includes("complete") || normalized === "success" || normalized === "received";
      }
      if (filter === "failed") {
        return normalized.includes("fail");
      }
      if (filter === "cancelled") {
        return normalized.includes("cancel");
      }
      return true;
    });
  }, [events, filter]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Tuma Webhooks</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Recent webhook deliveries and payment status transitions.
                  </p>
                </div>
              </div>
              <button
                onClick={fetchWebhooks}
                className="inline-flex items-center gap-2 rounded-full bg-primary text-white px-4 py-2 text-xs font-semibold shadow hover:bg-primary-hover transition"
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </motion.section>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface-card rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Completed</p>
                <p className="text-lg font-semibold text-foreground">{summary.completed}</p>
              </div>
            </div>
            <div className="surface-card rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold text-foreground">{summary.failed}</p>
              </div>
            </div>
            <div className="surface-card rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Cancelled</p>
                <p className="text-lg font-semibold text-foreground">{summary.cancelled}</p>
              </div>
            </div>
            <div className="surface-card rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-700" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold text-foreground">{summary.pending}</p>
              </div>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Filters</p>
                <p className="text-sm text-foreground">Filter webhook status and inspect payloads.</p>
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-xl border border-border bg-white/80 px-3 py-2 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="surface-card rounded-2xl h-32 animate-pulse" />
          ) : filteredEvents.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
              No webhook events found.
            </div>
          ) : (
            <div className="table-shell">
              <div className="table-scroll">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Received</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reference</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((event) => {
                      const paymentStatus = event.paymentStatus || event.status || "pending";
                      const statusLower = paymentStatus.toLowerCase();
                      const badgeClass =
                        statusLower.includes("complete") || statusLower === "success" || statusLower === "received"
                          ? "bg-green-100 text-green-700"
                          : statusLower.includes("fail")
                          ? "bg-red-100 text-red-700"
                          : statusLower.includes("cancel")
                          ? "bg-amber-100 text-amber-700"
                          : "bg-yellow-100 text-yellow-700";

                      const requestId =
                        event.checkoutRequestId || event.merchantRequestId || event.paymentGatewayId || "—";

                      return (
                        <React.Fragment key={event._id}>
                          <tr className="hover:bg-primary/5 transition">
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {formatDateTime(event.receivedAt)}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
                                {statusLabel(paymentStatus)}
                              </span>
                              <div className="text-[10px] text-muted-foreground mt-1">
                                event: {statusLabel(event.status)} / code: {event.resultCode ?? "—"}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-foreground">
                              {event.reference || "—"}
                            </td>
                            <td className="py-3 px-4 text-xs text-foreground">
                              {event.amount != null ? `KES ${event.amount.toLocaleString()}` : "—"}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{event.phoneNumber || "—"}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {event.paymentId ? (
                                <div className="flex flex-col gap-1">
                                  <span className="font-mono text-[11px] text-foreground">{event.paymentId}</span>
                                  <span className="text-[10px] uppercase tracking-wide">{event.paymentStatus || "pending"}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] uppercase tracking-wide text-red-500">
                                  {event.paymentMatched === false ? "Not matched" : "Pending match"}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              <button
                                onClick={() => setExpandedId(expandedId === event._id ? null : event._id)}
                                className="inline-flex items-center gap-1 text-primary hover:text-primary-hover transition"
                              >
                                {expandedId === event._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {requestId}
                              </button>
                            </td>
                          </tr>
                          {expandedId === event._id && (
                            <tr>
                              <td colSpan={7} className="bg-white/80 px-4 py-4 text-xs text-muted-foreground">
                                <div className="flex flex-col gap-2">
                                  <div>
                                    <span className="font-semibold text-foreground">Transaction time:</span>{" "}
                                    {formatDateTime(event.timestamp)}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-foreground">Result:</span>{" "}
                                    {event.resultDesc || "—"}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-foreground">Raw payload:</span>
                                    <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-900 text-slate-100 p-3 text-[11px] leading-relaxed">
                                      {event.rawBody || "—"}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
