"use client";

import Link from "next/link";
import { CreditCard, FileText, CalendarPlus, MessageCircle, ArrowRight } from "lucide-react";
import { useAirbnbTenantBooking } from "@/hooks/useAirbnbTenantBooking";
import AirbnbBookingStatusCard from "@/components/airbnb/AirbnbBookingStatusCard";

export default function AirbnbGuestDashboardOverviewPage() {
  const { booking, isLoading, error } = useAirbnbTenantBooking();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">
            Dashboard
          </p>
          <h1 className="text-2xl font-bold text-foreground mt-2">
            {booking?.listingName || "Your stay"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {booking?.guestName ? `Guest: ${booking.guestName}` : null}
          </p>
        </div>
        <Link href="/airbnb-tenant-dashboard/payments" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover">
          Make a payment <ArrowRight size={14} />
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">Loading booking…</div>
          ) : booking ? (
            <AirbnbBookingStatusCard booking={booking} />
          ) : (
            <div className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">No booking found.</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="surface-card rounded-3xl p-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Next steps</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3 hover:bg-white" href="/airbnb-tenant-dashboard/payments">
                  <span className="flex items-center gap-2"><CreditCard size={16} /> Payments</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </Link>
              </li>
              <li>
                <Link className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3 hover:bg-white" href="/airbnb-tenant-dashboard/documents">
                  <span className="flex items-center gap-2"><FileText size={16} /> Upload ID / Passport</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </Link>
              </li>
              <li>
                <Link className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3 hover:bg-white" href="/airbnb-tenant-dashboard/extend-stay">
                  <span className="flex items-center gap-2"><CalendarPlus size={16} /> Extend stay</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </Link>
              </li>
              <li>
                <Link className="flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3 hover:bg-white" href="/airbnb-tenant-dashboard/messages">
                  <span className="flex items-center gap-2"><MessageCircle size={16} /> Message owner</span>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </Link>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-border bg-white/70 p-6 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Security note</p>
            <p className="mt-2">
              For Airbnb security, please upload a valid ID document (ID card, Driver’s License, or Passport) and
              use this portal for payments and stay extensions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
