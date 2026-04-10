"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

type ReviewStatus = "pending" | "approved" | "rejected";

interface ReviewItem {
  _id: string;
  listingId: string;
  listingType: "rentals" | "airbnb";
  propertyName: string;
  reviewerName: string;
  reviewerEmail?: string;
  rating: number;
  review: string;
  status: ReviewStatus;
  createdAt: string;
  moderatedAt?: string;
  moderatedByName?: string;
  moderationNote?: string;
}

interface ReviewsResponse {
  success: boolean;
  reviews?: ReviewItem[];
  message?: string;
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<ReviewStatus>("pending");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});

  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.success && data.csrfToken ? data.csrfToken : null;
    } catch {
      return null;
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");
      const data = await res.json();
      if (!data.authenticated || data.role !== "admin") throw new Error("Not authenticated");
      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchReviews = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/reviews?status=${filter}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data: ReviewsResponse = await res.json();
      if (data.success) {
        setReviews(data.reviews || []);
      } else {
        setError(data.message || "Failed to load reviews.");
      }
    } catch {
      setError("Failed to load reviews.");
    } finally {
      setIsLoading(false);
    }
  }, [status, filter, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchReviews();
    }
  }, [status, fetchReviews]);

  const handleModerate = async (
    reviewId: string,
    nextStatus: ReviewStatus,
    note?: string
  ) => {
    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) {
        setError("Failed to get security token. Please refresh the page.");
        return;
      }

      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus, note }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update review status.");
      }

      if (filter === "pending") {
        setReviews((prev) => prev.filter((review) => review._id !== reviewId));
      } else {
        setReviews((prev) =>
          prev.map((review) =>
            review._id === reviewId
              ? {
                  ...review,
                  status: nextStatus,
                  moderatedAt: data.review?.moderatedAt,
                  moderationNote: data.review?.moderationNote ?? note,
                }
              : review
          )
        );
      }
      setModerationNotes((prev) => {
        const next = { ...prev };
        delete next[reviewId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update review status.");
    }
  };

  const statusMeta: Record<ReviewStatus, { label: string; icon: React.ReactNode }> = {
    pending: { label: "Pending", icon: <Clock size={14} /> },
    approved: { label: "Approved", icon: <CheckCircle2 size={14} /> },
    rejected: { label: "Rejected", icon: <XCircle size={14} /> },
  };

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
                  <Star className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Reviews</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Approve or reject public property reviews before they go live.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(statusMeta) as ReviewStatus[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] transition ${
                      filter === key
                        ? "bg-primary text-white shadow-sm"
                        : "border border-border bg-white/70 text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {statusMeta[key].icon}
                    {statusMeta[key].label}
                  </button>
                ))}
              </div>
            </div>
          </motion.section>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchReviews();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="surface-card rounded-2xl h-24 animate-pulse" />
              <div className="surface-card rounded-2xl h-24 animate-pulse" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="table-shell"
            >
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Property
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Reviewer
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Rating
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Review
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Note
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Submitted
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Status
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                          No {filter} reviews found.
                        </td>
                      </tr>
                    ) : (
                      reviews.map((review) => (
                        <tr key={review._id} className="hover:bg-primary/5 transition-colors">
                          <td className="py-3 px-4 text-xs font-medium text-foreground">
                            <div className="flex flex-col">
                              <span>{review.propertyName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {review.listingType === "airbnb" ? "Short-term" : "Long-term"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            <div className="flex flex-col">
                              <span className="text-foreground">{review.reviewerName}</span>
                              {review.reviewerEmail && (
                                <span className="text-[10px]">{review.reviewerEmail}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-amber-600 font-semibold">
                            {review.rating.toFixed(1)} ★
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground max-w-[280px]">
                            <p className="line-clamp-2">{review.review}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground max-w-[240px]">
                            {review.moderationNote ? (
                              <p className="line-clamp-2">{review.moderationNote}</p>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {review.createdAt
                              ? new Date(review.createdAt).toLocaleDateString("en-KE", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                review.status === "approved"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : review.status === "rejected"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {statusMeta[review.status].icon}
                              {statusMeta[review.status].label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {review.status === "pending" ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="text"
                                  value={moderationNotes[review._id] ?? ""}
                                  onChange={(event) =>
                                    setModerationNotes((prev) => ({
                                      ...prev,
                                      [review._id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Add moderation note (optional)"
                                  className="w-full rounded-full border border-border bg-white/70 px-3 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleModerate(
                                        review._id,
                                        "approved",
                                        moderationNotes[review._id]?.trim() || undefined
                                      )
                                    }
                                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-emerald-700 transition"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleModerate(
                                        review._id,
                                        "rejected",
                                        moderationNotes[review._id]?.trim() || undefined
                                      )
                                    }
                                    className="rounded-full border border-rose-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600 hover:bg-rose-50 transition"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
