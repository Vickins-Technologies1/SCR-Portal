"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";
import { Clock, Filter, RefreshCw, Search, Shield, ArrowLeft, Eye } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import toast, { Toaster } from "react-hot-toast";

import Sidebar from "../../components/Sidebar";
import Navbar from "../../components/Navbar";
import Modal from "../../components/Modal";
import { usePermissions } from "@/hooks/usePermissions";

type OwnerActivity = {
  id: string;
  occurredAt: string | null;
  action: string;
  summary: string;
  actor: {
    userId: string;
    role: string;
    ownerId: string;
    impersonator?: { userId: string; role: string } | null;
  };
  entity?: { type: string; id?: string | null; label?: string | null } | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

type FetchResponse = {
  success: boolean;
  activities?: OwnerActivity[];
  nextCursor?: string | null;
  message?: string;
};

const actionFilters = [
  { label: "All", value: "" },
  { label: "Auth", value: "auth." },
  { label: "Settings", value: "settings." },
  { label: "Properties", value: "properties." },
  { label: "Tenants", value: "tenants." },
  { label: "Payments", value: "payments." },
];

function formatWhen(iso: string | null) {
  if (!iso) return { absolute: "Unknown", relative: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { absolute: "Unknown", relative: "" };
  return {
    absolute: format(date, "MMM d, yyyy • HH:mm"),
    relative: formatDistanceToNowStrict(date, { addSuffix: true }),
  };
}

export default function OwnerActivitiesPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewSettings = perm.hasPermission("settings:view");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<OwnerActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionPrefix, setActionPrefix] = useState("");
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<OwnerActivity | null>(null);

  const session = useMemo(() => {
    if (typeof window === "undefined") return { userId: null, role: null, ownerId: null };
    return {
      userId: Cookies.get("userId") ?? null,
      role: Cookies.get("role") ?? null,
      ownerId: Cookies.get("ownerId") ?? null,
    };
  }, []);

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      if (actionPrefix) params.set("actionPrefix", actionPrefix);
      if (queryText.trim()) params.set("q", queryText.trim());
      return `/api/owner/activities?${params.toString()}`;
    },
    [actionPrefix, queryText]
  );

  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(null), { credentials: "include" });
      const data = (await res.json()) as FetchResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load activities");
      }
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load activities";
      toast.error(message);
      setActivities([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const fetchMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor), { credentials: "include" });
      const data = (await res.json()) as FetchResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load more activities");
      }
      const next = Array.isArray(data.activities) ? data.activities : [];
      setActivities((prev) => [...prev, ...next]);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load more activities";
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [fetchFirstPage]);

  useEffect(() => {
    const { userId, role } = session;
    if (!userId || !["propertyOwner", "teamMember"].includes(role || "")) {
      toast.error("Unauthorized access. Please log in as a property owner or team member.");
      router.replace("/");
      return;
    }
    if (role === "teamMember" && !canViewSettings) {
      toast.error("Access restricted. You do not have permission to view activities.");
      router.replace("/property-owner-dashboard");
      return;
    }
    fetchFirstPage();
  }, [router, session, canViewSettings, fetchFirstPage]);

  useEffect(() => {
    if (!loading) fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionPrefix]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6 overflow-y-auto transition-all duration-300">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Settings</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Activity Log</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Append-only account audit trail for owners and team members.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/property-owner-dashboard/settings"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/80 px-3 py-2 text-xs font-semibold text-foreground hover:bg-white"
                >
                  <ArrowLeft size={14} />
                  Back to Settings
                </Link>
                <button
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>
          </section>

          <section className="surface-card rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <input
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") fetchFirstPage();
                    }}
                    placeholder="Search (summary, action, entity...)"
                    className="w-full rounded-xl border border-border bg-white/80 pl-9 pr-3 py-2 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <button
                  onClick={fetchFirstPage}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white/80 px-3 py-2 text-xs font-semibold text-foreground hover:bg-white"
                >
                  <Eye size={14} />
                  Apply
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Filter size={16} className="text-muted-foreground" />
                <select
                  value={actionPrefix}
                  onChange={(e) => setActionPrefix(e.target.value)}
                  className="rounded-xl border border-border bg-white/80 px-3 py-2 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  {actionFilters.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-white/70 overflow-hidden">
              <div className="hidden md:grid grid-cols-[170px_190px_1fr_220px_110px] gap-0 px-4 py-3 text-[11px] font-semibold text-muted-foreground bg-white/80 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock size={14} />
                  Time
                </div>
                <div>Action</div>
                <div>What happened</div>
                <div>Who</div>
                <div className="text-right">Details</div>
              </div>

              {loading ? (
                <div className="p-5 sm:p-6 text-sm text-muted-foreground">Loading activity log…</div>
              ) : activities.length === 0 ? (
                <div className="p-5 sm:p-6 text-sm text-muted-foreground">
                  No activities found for the selected filters.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activities.map((item) => {
                    const when = formatWhen(item.occurredAt);
                    const who = item.actor.role === "propertyOwner" ? "Owner" : item.actor.role === "teamMember" ? "Team" : item.actor.role;
                    return (
                      <div key={item.id} className="px-4 py-4 md:py-3">
                        <div className="md:grid md:grid-cols-[170px_190px_1fr_220px_110px] md:items-center gap-3">
                          <div className="text-xs text-foreground">
                            <div className="font-semibold">{when.absolute}</div>
                            <div className="text-[11px] text-muted-foreground">{when.relative}</div>
                          </div>

                          <div className="mt-2 md:mt-0 text-xs">
                            <div className="font-semibold text-foreground break-words">{item.action}</div>
                            {item.entity?.type ? (
                              <div className="mt-1 text-[11px] text-muted-foreground break-words">
                                {item.entity.type}
                                {item.entity.label ? ` • ${item.entity.label}` : ""}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-2 md:mt-0 text-xs text-foreground">
                            <div className="break-words">{item.summary}</div>
                          </div>

                          <div className="mt-2 md:mt-0 text-xs text-foreground">
                            <div className="font-semibold">{who}</div>
                            <div className="text-[11px] text-muted-foreground break-words">{item.actor.userId}</div>
                          </div>

                          <div className="mt-3 md:mt-0 flex md:justify-end">
                            <button
                              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-white/80"
                              onClick={() => setSelected(item)}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {nextCursor ? (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={fetchMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-white disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loadingMore ? "animate-spin" : ""} />
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </section>
        </main>
      </div>

      <Modal
        title="Activity Details"
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        className="max-w-3xl"
      >
        {selected ? (
          <div className="p-4 sm:p-6 space-y-4 text-sm">
            <div className="rounded-2xl border border-border bg-white/80 p-4">
              <div className="text-xs text-muted-foreground">Summary</div>
              <div className="mt-1 font-semibold text-foreground break-words">{selected.summary}</div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Action</div>
                  <div className="font-semibold break-words">{selected.action}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">When</div>
                  <div className="font-semibold break-words">{formatWhen(selected.occurredAt).absolute}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Actor</div>
                  <div className="font-semibold break-words">
                    {selected.actor.role} • {selected.actor.userId}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Entity</div>
                  <div className="font-semibold break-words">
                    {selected.entity?.type || "—"}
                    {selected.entity?.id ? ` • ${selected.entity.id}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-border bg-white/80 p-4">
                <div className="text-xs text-muted-foreground mb-2">Security context</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">IP</div>
                    <div className="font-semibold break-words">{selected.ip || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">User agent</div>
                    <div className="font-semibold break-words">{selected.userAgent || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white/80 p-4">
                <div className="text-xs text-muted-foreground mb-2">Metadata</div>
                <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 text-slate-50 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(selected.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

