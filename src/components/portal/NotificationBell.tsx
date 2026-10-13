"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ArrowUpRight, LoaderCircle } from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

type NotificationItem = {
  _id: string;
  title?: string;
  message: string;
  type?: string;
  createdAt: string;
  status: "read" | "unread";
};

type NotificationBellProps = {
  endpoint: "/api/notifications" | "/api/tenant/notifications";
  pageHref: "/property-owner-dashboard/notifications" | "/tenant-dashboard/notifications";
  enabled?: boolean;
};

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let amount = seconds;
  for (const [threshold, unit] of units) {
    if (Math.abs(amount) < threshold) return formatter.format(Math.round(amount), unit);
    amount /= threshold;
  }
  return formatter.format(Math.round(amount), "year");
}

function notificationTitle(notification: NotificationItem) {
  if (notification.title?.trim()) return notification.title;
  const titles: Record<string, string> = {
    payment: "Payment update",
    maintenance: "Maintenance update",
    tenant: "Tenant update",
    other: "Account update",
  };
  return titles[notification.type || ""] || "Notification";
}

export default function NotificationBell({ endpoint, pageHref, enabled = true }: NotificationBellProps) {
  const router = useRouter();
  const { csrfToken, ensureCsrf } = useCsrfToken();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}?unreadCount=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok && data.success) setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // A count failure must not make the rest of the navbar unavailable.
    }
  }, [endpoint]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}?page=1&limit=6`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load notifications.");
      setItems(Array.isArray(data.data) ? data.data : []);
      setLoaded(true);
      setUnreadCount((current) => Number.isFinite(Number(data.unreadCount)) ? Number(data.unreadCount) : current);
      void refreshUnreadCount();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [endpoint, refreshUnreadCount]);

  useEffect(() => {
    if (!enabled) return;
    void refreshUnreadCount();
    const onFocus = () => void refreshUnreadCount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refreshUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!enabled) return null;

  const openPopover = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !loaded && !loading) void loadLatest();
  };

  const selectNotification = async (notification: NotificationItem) => {
    setOpen(false);
    if (notification.status === "unread") {
      setItems((current) => current.map((item) => item._id === notification._id ? { ...item, status: "read" } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      try {
        const token = csrfToken || await ensureCsrf();
        if (!token) throw new Error("Unable to verify this action. Please try again.");
        const response = await fetch(endpoint, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify({ notificationId: notification._id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to update notification.");
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Unable to update notification.");
        void refreshUnreadCount();
      }
    }
    router.push(pageHref);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={openPopover}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-[70] flex max-h-[min(30rem,calc(100dvh-5.5rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_70px_rgba(15,23,42,0.2)] ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Notifications</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
              </p>
            </div>
            <Bell size={16} className="text-primary" aria-hidden="true" />
          </div>

          <div className="overflow-y-auto overscroll-contain">
            {loading && !loaded ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground" aria-live="polite">
                <LoaderCircle size={15} className="animate-spin" /> Loading notifications
              </div>
            ) : error && items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted-foreground">{error}</p>
                <button type="button" onClick={() => void loadLatest()} className="mt-3 text-xs font-semibold text-primary hover:underline">Try again</button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul>
                {items.map((notification) => (
                  <li key={notification._id} className="border-b border-border/50 last:border-0">
                    <button
                      type="button"
                      onClick={() => void selectNotification(notification)}
                      className="group flex w-full gap-3 px-4 py-3 text-left transition hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="mt-1 flex w-2 shrink-0 justify-center">
                        {notification.status === "unread" && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">{notificationTitle(notification)}</span>
                          <time className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{relativeTime(notification.createdAt)}</time>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">{notification.message}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border/70 bg-muted/20 p-2.5">
            <Link
              href={pageHref}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              View all notifications <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
