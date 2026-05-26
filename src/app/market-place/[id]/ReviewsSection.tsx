"use client";

import { useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

interface ReviewItem {
  _id: string;
  reviewerName: string;
  rating: number;
  review: string;
  createdAt: string;
}

interface ReviewsSectionProps {
  listingId: string;
  listingType: "airbnb" | "rentals" | "sale";
  initialReviews: ReviewItem[];
  initialRating: number;
  initialReviewCount: number;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function ReviewsSection({
  listingId,
  listingType,
  initialReviews,
  initialRating,
  initialReviewCount,
}: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
  const [rating, setRating] = useState(initialRating);
  const [reviewCount, setReviewCount] = useState(initialReviewCount);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [selectedRating, setSelectedRating] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const formStartedAt = useRef<number | null>(null);

  const ratingLabel = reviewCount
    ? `${rating.toFixed(1)} out of 5`
    : "No reviews yet";
  const sectionTitle =
    listingType === "airbnb" ? "Guest reviews" : listingType === "sale" ? "Buyer reviews" : "Resident reviews";

  const canSubmit = useMemo(() => {
    if (!name.trim() || !message.trim()) return false;
    return message.trim().length >= 10 && selectedRating >= 1;
  }, [name, message, selectedRating]);

  const markFormStarted = () => {
    if (formStartedAt.current === null) {
      formStartedAt.current = Date.now();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setFormMessage(null);
    try {
      markFormStarted();
      const res = await fetch(`/api/public-properties/${listingId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: name.trim(),
          reviewerEmail: email.trim(),
          rating: selectedRating,
          review: message.trim(),
          company,
          formStartedAt: formStartedAt.current,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to submit your review.");
      }

      if (!data.pending && data.review) {
        setReviews((prev) => [data.review, ...prev]);
      }
      if (typeof data.rating === "number") setRating(data.rating);
      if (typeof data.reviewCount === "number") setReviewCount(data.reviewCount);

      toast.success(
        data.pending
          ? "Thanks! Your review will appear after admin approval."
          : "Thanks for sharing your review."
      );
      setFormMessage(
        data.pending
          ? "Your review is pending admin approval and will appear once approved."
          : "Review submitted successfully."
      );
      setName("");
      setEmail("");
      setMessage("");
      setCompany("");
      setSelectedRating(5);
      formStartedAt.current = null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit your review.";
      toast.error(message);
      setFormMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur space-y-6">
      <Toaster position="top-right" toastOptions={{ duration: 2500 }} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Reviews</p>
          <h2 className="mt-2 text-lg sm:text-xl font-semibold text-slate-900">{sectionTitle}</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{ratingLabel}</span>
          {reviewCount ? ` · ${reviewCount} review${reviewCount === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 min-w-0">
          {reviews.length ? (
            reviews.map((review) => (
              <div
                key={review._id}
                className="rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={`${review._id}-star-${idx}`}
                        size={14}
                        fill={idx < Math.round(review.rating) ? "#f59e0b" : "none"}
                        className={idx < Math.round(review.rating) ? "text-amber-500" : "text-slate-300"}
                      />
                    ))}
                  </div>
                  <span className="font-semibold text-slate-800">{review.reviewerName}</span>
                  <span>{formatDate(review.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm text-slate-700 whitespace-pre-line break-words">{review.review}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
              No reviews yet. Be the first to share your experience.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Leave a review</h3>
          <p className="mt-1 text-xs text-slate-500">
            Share helpful details for future guests or tenants.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div
              className="absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
              aria-hidden="true"
            >
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="border border-transparent bg-transparent text-transparent"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => {
                  markFormStarted();
                  setName(event.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  markFormStarted();
                  setEmail(event.target.value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Rating
              </label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1;
                  const active = value <= selectedRating;
                  return (
                <button
                  key={`rating-${value}`}
                  type="button"
                  onClick={() => {
                    markFormStarted();
                    setSelectedRating(value);
                  }}
                  className={`rounded-full p-1 transition ${
                    active ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                  }`}
                  aria-label={`Set rating to ${value}`}
                >
                  <Star size={18} fill={active ? "#f59e0b" : "none"} />
                </button>
                  );
                })}
                <span className="ml-2 text-xs text-slate-500">{selectedRating} / 5</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                Review
              </label>
              <textarea
                value={message}
                onChange={(event) => {
                  markFormStarted();
                  setMessage(event.target.value);
                }}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
                placeholder="Tell us about the stay, cleanliness, or communication."
                required
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="mt-2 w-full rounded-full bg-primary px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit review"}
            </button>

            {formMessage ? (
              <p className="text-[11px] text-slate-500">{formMessage}</p>
            ) : (
              <p className="text-[11px] text-slate-500">
                Reviews are visible after admin approval.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
