"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { useAirbnbTenantBooking } from "@/hooks/useAirbnbTenantBooking";
import { useCsrfToken } from "@/hooks/useCsrfToken";

type ExtendStayResponse = {
  success: boolean;
  message?: string;
  quote?: {
    currentCheckOut: string;
    requestedCheckOut: string;
    additionalNights: number;
    additionalAmount: number;
    newTotal: number;
  };
  extension?: {
    status: string;
    requestedCheckOut: string;
    additionalAmount: number;
    createdAt: string;
  } | null;
};

export default function AirbnbGuestExtendStayPage() {
  const { csrfToken } = useCsrfToken();
  const { booking, refetch } = useAirbnbTenantBooking();
  const [newCheckOut, setNewCheckOut] = useState("");
  const [quote, setQuote] = useState<ExtendStayResponse["quote"] | null>(null);
  const [status, setStatus] = useState<ExtendStayResponse["extension"] | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/airbnb-tenant/extend-stay", { credentials: "include" });
      const json: ExtendStayResponse = await res.json();
      if (res.ok && json.success) setStatus(json.extension || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const canQuote = useMemo(() => Boolean(newCheckOut), [newCheckOut]);

  const handleQuote = async () => {
    if (!canQuote) return;
    setIsQuoting(true);
    setError(null);
    setQuote(null);
    try {
      const res = await fetch(`/api/airbnb-tenant/extend-stay?newCheckOut=${encodeURIComponent(newCheckOut)}`, {
        credentials: "include",
      });
      const json: ExtendStayResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to calculate extension quote.");
      setQuote(json.quote || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate extension quote.");
    } finally {
      setIsQuoting(false);
    }
  };

  const handleSubmit = async () => {
    if (!csrfToken) {
      setError("Missing CSRF token. Refresh and try again.");
      return;
    }
    if (!newCheckOut) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/extend-stay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ newCheckOut }),
      });
      const json: ExtendStayResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to request extension.");
      setStatus(json.extension || null);
      setQuote(null);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request extension.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentCheckOutDate = booking?.checkOut ? new Date(booking.checkOut) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Extend Stay</p>
          <h1 className="text-2xl font-bold text-foreground mt-2">Extend your booking</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Choose a new check-out date, confirm, then pay the additional amount through your portal.
          </p>
        </div>

        <Link
          href="/airbnb-tenant-dashboard/payments"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover"
        >
          Go to payments <ArrowRight size={14} />
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      {status ? (
        <div className="rounded-3xl border border-border bg-white/70 p-6 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Latest request</p>
          <p className="mt-3 font-semibold text-foreground">
            Status: <span className="capitalize">{status.status}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Requested check-out:{" "}
            <span className="font-semibold text-foreground">
              {new Date(status.requestedCheckOut).toLocaleDateString("en-KE", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Additional amount:{" "}
            <span className="font-semibold text-foreground">KES {Number(status.additionalAmount || 0).toLocaleString("en-KE")}</span>
          </p>
        </div>
      ) : null}

      <div className="surface-card rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-white/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Current check-out</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {currentCheckOutDate
                ? currentCheckOutDate.toLocaleDateString("en-KE", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">New check-out date</label>
            <input
              type="date"
              value={newCheckOut}
              onChange={(e) => setNewCheckOut(e.target.value)}
              className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleQuote}
            disabled={!newCheckOut || isQuoting || isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white/80 px-5 py-3 text-sm font-semibold text-foreground hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CalendarPlus size={18} />
            {isQuoting ? "Calculating…" : "Calculate cost"}
          </button>

          <button
            onClick={handleSubmit}
            disabled={!newCheckOut || isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Submitting…" : "Confirm extension"}
          </button>
        </div>

        {quote ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-semibold text-primary">Quote</p>
            <p className="mt-2 text-muted-foreground">
              Additional nights: <span className="font-semibold text-foreground">{quote.additionalNights}</span>
            </p>
            <p className="mt-1 text-muted-foreground">
              Additional amount:{" "}
              <span className="font-semibold text-foreground">KES {quote.additionalAmount.toLocaleString("en-KE")}</span>
            </p>
            <p className="mt-1 text-muted-foreground">
              New total: <span className="font-semibold text-foreground">KES {quote.newTotal.toLocaleString("en-KE")}</span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">After confirming, go to Payments and pay the updated amount due.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

