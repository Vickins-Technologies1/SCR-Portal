"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cookies from "js-cookie";
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, Lock, RefreshCw, Trash2 } from "lucide-react";

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "unread" | "read";
  deliveryMethod?: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  total?: number;
  page?: number;
  limit?: number;
  unreadCount?: number;
}

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TenantNotificationsPage() {
  const [canNotifications, setCanNotifications] = useState<boolean | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const limit = 12;
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / limit)), [total, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant/features", { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.success) {
          setCanNotifications(Boolean(data.features?.canNotifications));
        } else {
          setCanNotifications(null);
        }
      } catch {
        if (!cancelled) setCanNotifications(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCsrfToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data: ApiResponse = await res.json();
      if (data.success && (data as any).csrfToken) {
        const token = (data as any).csrfToken as string;
        setCsrfToken(token);
        const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
        Cookies.set("csrf-token", token, { path: "/", secure: isSecure, sameSite: "strict" });
        return token;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/notifications?unreadCount=1", {
        credentials: "include",
        cache: "no-store",
      });
      const data: ApiResponse = await res.json();
      if (data.success) {
        setUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filter === "unread") params.set("status", "unread");

      const res = await fetch(`/api/tenant/notifications?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data: ApiResponse<Notification[]> = await res.json();
      if (current !== requestId.current) return;

      if (!res.ok || !data.success) {
        throw new Error(data.message || `Request failed (${res.status})`);
      }

      setNotifications(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
    } catch (e) {
      if (current !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [filter, limit, page]);

  useEffect(() => {
    if (canNotifications === false) {
      setIsLoading(false);
      return;
    }
    if (canNotifications === null) return;

    fetchCsrfToken().then(() => {
      fetchUnreadCount();
      fetchNotifications();
    });
  }, [canNotifications, fetchCsrfToken, fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [filter, page, fetchNotifications, fetchUnreadCount]);

  const markRead = useCallback(
    async (notificationId: string) => {
      const token = csrfToken || (await fetchCsrfToken());
      if (!token) {
        setError("Failed to get security token");
        return;
      }

      const res = await fetch("/api/tenant/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ notificationId }),
      });

      const data: ApiResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        setError(data.message || "Failed to mark as read");
        return;
      }

      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, status: "read" } : n))
      );
      fetchUnreadCount();
    },
    [csrfToken, fetchCsrfToken, fetchUnreadCount]
  );

  const markAllRead = useCallback(async () => {
    const token = csrfToken || (await fetchCsrfToken());
    if (!token) {
      setError("Failed to get security token");
      return;
    }

    const res = await fetch("/api/tenant/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify({ markAllRead: true }),
    });

    const data: ApiResponse = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !data.success) {
      setError(data.message || "Failed to mark all as read");
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" })));
    fetchUnreadCount();
  }, [csrfToken, fetchCsrfToken, fetchUnreadCount]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      const token = csrfToken || (await fetchCsrfToken());
      if (!token) {
        setError("Failed to get security token");
        return;
      }

      const res = await fetch(`/api/tenant/notifications?notificationId=${encodeURIComponent(notificationId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRF-Token": token,
        },
      });

      const data: ApiResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        setError(data.message || "Failed to delete notification");
        return;
      }

      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      setTotal((t) => Math.max(0, t - 1));
      fetchUnreadCount();
    },
    [csrfToken, fetchCsrfToken, fetchUnreadCount]
  );

  const refresh = useCallback(async () => {
    await fetchUnreadCount();
    await fetchNotifications();
  }, [fetchNotifications, fetchUnreadCount]);

  if (canNotifications === false) {
    return (
      <div className="relative min-h-screen pb-10 text-[13px] sm:text-sm">
        <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />

        <div className="pt-10 sm:pt-14 relative z-10">
          <div className="mx-4 sm:mx-6 lg:mx-8 max-w-4xl">
            <section className="glass-panel rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
              <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
              <div className="relative space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Premium feature</p>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Notifications locked</h1>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 text-sm text-amber-900">
                  <p className="font-semibold">View-only account</p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    Your property owner is on the Free tier. Ask them to upgrade to Premium to enable notifications.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-10 text-[13px] sm:text-sm">
      <div className="pointer-events-none absolute -top-24 right-[-12%] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-80 w-80 rounded-full bg-[#1e3a8a]/10 blur-3xl" />

      <div className="pt-10 sm:pt-14 relative z-10">
        <div className="mx-4 sm:mx-6 lg:mx-8">
          <section className="glass-panel rounded-3xl p-6 sm:p-8 md:p-9 relative overflow-hidden">
            <div className="absolute -top-24 right-6 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
            <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">In-app Inbox</p>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Notifications</h1>
                  </div>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                  You have{" "}
                  <span className="font-semibold text-foreground">
                    {unreadCount} unread
                  </span>{" "}
                  notification{unreadCount === 1 ? "" : "s"}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFilter((f) => (f === "unread" ? "all" : "unread"))}
                  className="px-3 py-2 rounded-xl border border-border bg-white/70 hover:bg-white text-xs sm:text-sm font-semibold"
                >
                  {filter === "unread" ? "Showing: Unread" : "Showing: All"}
                </button>
                <button
                  onClick={markAllRead}
                  className="px-3 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 text-xs sm:text-sm font-semibold"
                >
                  Mark all read
                </button>
                <button
                  onClick={refresh}
                  className="px-3 py-2 rounded-xl border border-border bg-white/70 hover:bg-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="mx-4 sm:mx-6 lg:mx-8 mt-6">
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 surface-card rounded-3xl p-4 sm:p-6">
            {isLoading ? (
              <div className="text-muted-foreground text-sm">Loading notifications…</div>
            ) : notifications.length === 0 ? (
              <div className="text-muted-foreground text-sm">No notifications yet.</div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n._id}
                    className={`rounded-2xl border p-4 sm:p-5 bg-white/70 ${
                      n.status === "unread" ? "border-primary/30 ring-1 ring-primary/15" : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-semibold uppercase tracking-wide">
                            {n.type}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{formatWhen(n.createdAt)}</span>
                          {n.status === "unread" && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                              Unread
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm sm:text-base text-foreground whitespace-pre-line break-words">
                          {n.message}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {n.status === "unread" && (
                          <button
                            onClick={() => markRead(n._id)}
                            className="px-3 py-2 rounded-xl border border-border bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-2"
                            aria-label="Mark as read"
                          >
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            Read
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(n._id)}
                          className="px-3 py-2 rounded-xl border border-border bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-2"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <button
                className="px-3 py-2 rounded-xl border border-border bg-white/70 hover:bg-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <div className="text-xs sm:text-sm text-muted-foreground">
                Page <span className="font-semibold text-foreground">{page}</span> of{" "}
                <span className="font-semibold text-foreground">{totalPages}</span>
              </div>

              <button
                className="px-3 py-2 rounded-xl border border-border bg-white/70 hover:bg-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
