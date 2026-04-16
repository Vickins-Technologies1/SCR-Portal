"use client";

import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import PayForAirbnbBookingButton from "@/components/PayForAirbnbBookingButton";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

type BookingResponse = {
  success: boolean;
  message?: string;
  booking?: {
    id: string;
    listingName: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    total: number;
    payoutStatus?: string;
    reference?: string;
  };
  paymentRail?: {
    paymentType?: string;
    shortcode?: string;
    paybillAccountNumber?: string;
    hasPasskey?: boolean;
  };
};

export default function AirbnbTenantDashboardPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [data, setData] = useState<BookingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const role = Cookies.get("role");
    const userId = Cookies.get("userId");
    if (!role || role !== "tenant" || !userId) {
      router.replace("/tenant-login");
    }
  }, [router]);

  const ensureCsrf = useCallback(async () => {
    let token = Cookies.get("csrf-token");
    if (!token) {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const json = await res.json();
        if (json.csrfToken) {
          Cookies.set("csrf-token", json.csrfToken, { sameSite: "strict", path: "/" });
          token = json.csrfToken;
        }
      } catch {
        // ignore
      }
    }
    setCsrfToken(token || null);
    return token || null;
  }, []);

  const fetchBooking = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/booking", { credentials: "include" });
      const json: BookingResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load booking.");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load booking.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureCsrf().finally(fetchBooking);
  }, [ensureCsrf, fetchBooking]);

  const handleLogout = () => {
    Cookies.remove("userId");
    Cookies.remove("role");
    Cookies.remove("permissions");
    Cookies.remove("ownerId");
    Cookies.remove("csrf-token");
    window.location.href = "/tenant-login";
  };

  const booking = data?.booking;
  const rail = data?.paymentRail;
  const isPaid = String(booking?.payoutStatus || "").toLowerCase() === "paid";

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] bg-background text-foreground px-4 py-10">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">
                Booking Payments
              </p>
              <h1 className="text-2xl font-bold text-foreground mt-2">
                {booking?.listingName || "Your stay"}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {booking?.guestName ? `Guest: ${booking.guestName}` : null}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-border bg-white/70 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Logout
            </button>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="surface-card rounded-3xl p-6 space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading booking…</div>
            ) : booking ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount due</p>
                    <p className="text-2xl font-bold">KES {Number(booking.total || 0).toLocaleString("en-KE")}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                      isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {isPaid ? "Paid" : "Pending"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-2xl border border-border bg-white/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.3em]">Check-in</p>
                    <p className="mt-1 text-foreground font-semibold">
                      {new Date(booking.checkIn).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-white/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.3em]">Check-out</p>
                    <p className="mt-1 text-foreground font-semibold">
                      {new Date(booking.checkOut).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-muted-foreground">M-Pesa phone (optional)</label>
                  <input
                    className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm"
                    placeholder="e.g. 07xx xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPaid}
                  />
                </div>

                {csrfToken ? (
                  <PayForAirbnbBookingButton
                    amount={Number(booking.total || 0)}
                    phone={phone}
                    csrfToken={csrfToken}
                    disabled={isPaid}
                    shortcode={rail?.shortcode || null}
                    reference={booking.reference || null}
                    paybillAccountNumber={rail?.paybillAccountNumber || null}
                    onSuccess={fetchBooking}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">Preparing secure payment session…</div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No booking found.</div>
            )}
          </div>
        </div>
      </div>
    </PublicThemeWrapper>
  );
}

