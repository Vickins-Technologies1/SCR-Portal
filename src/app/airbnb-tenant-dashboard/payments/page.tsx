"use client";

import { useState } from "react";
import PayForAirbnbBookingButton from "@/components/PayForAirbnbBookingButton";
import { useAirbnbTenantBooking } from "@/hooks/useAirbnbTenantBooking";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import AirbnbBookingStatusCard from "@/components/airbnb/AirbnbBookingStatusCard";

export default function AirbnbGuestPaymentsPage() {
  const { csrfToken } = useCsrfToken();
  const { booking, paymentRail, canPay, isLoading, error, refetch } = useAirbnbTenantBooking();
  const [phone, setPhone] = useState("");

  const isPaid = ["paid", "completed"].includes(String(booking?.payoutStatus || "").toLowerCase());
  const amountDue = Number(booking?.amountDue ?? booking?.total ?? 0);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">
          Booking Payments
        </p>
        <h1 className="text-2xl font-bold text-foreground mt-2">{booking?.listingName || "Your stay"}</h1>
        <p className="text-xs text-muted-foreground mt-1">{booking?.guestName ? `Guest: ${booking.guestName}` : null}</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">Loading booking…</div>
      ) : booking ? (
        <div className="space-y-4">
          <AirbnbBookingStatusCard booking={booking} />

          <div className="surface-card rounded-3xl p-6 space-y-4">
            {!canPay ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                <p className="font-semibold">Payments locked</p>
                <p className="mt-1 text-[11px] text-amber-800">
                  Your property owner is on the Free tier. Payments are view-only until they upgrade to Premium.
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Amount due</p>
                <p className="text-2xl font-bold">KES {amountDue.toLocaleString("en-KE")}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                  isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPaid ? "Paid" : "Pending verification"}
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">M-Pesa phone (optional)</label>
              <input
                className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm"
                placeholder="e.g. 07xx xxx xxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPaid || !canPay}
              />
            </div>

            {csrfToken ? (
              <PayForAirbnbBookingButton
                amount={amountDue}
                phone={phone}
                csrfToken={csrfToken}
                disabled={isPaid || amountDue <= 0 || !canPay}
                shortcode={canPay ? paymentRail?.shortcode || null : null}
                reference={booking.reference || null}
                paybillAccountNumber={canPay ? paymentRail?.paybillAccountNumber || null : null}
                onSuccess={refetch}
              />
            ) : (
              <div className="text-xs text-muted-foreground">Preparing secure payment session…</div>
            )}
          </div>
        </div>
      ) : (
        <div className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">No booking found.</div>
      )}
    </div>
  );
}
