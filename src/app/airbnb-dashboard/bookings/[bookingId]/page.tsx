"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, ClipboardList, CreditCard, Link as LinkIcon, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import Navbar from "../../components/Navbar";
import SectionHeader from "../../components/SectionHeader";
import { useAirbnbAccess } from "../../components/useAirbnbAccess";
import type { AirbnbBooking } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

type BookingDetails = AirbnbBooking & { createdAt?: string; updatedAt?: string };

export default function AirbnbBookingDetailsPage() {
  const router = useRouter();
  const params = useParams<{ bookingId: string }>();
  const bookingId = useMemo(() => String(params.bookingId || ""), [params.bookingId]);

  const { hasAccess, ownerId, csrfToken, role } = useAirbnbAccess("tenants:view");
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!bookingId || !ownerId) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/airbnb/bookings/${encodeURIComponent(bookingId)}?ownerId=${ownerId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load booking");
      }
      setBooking(data.booking);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load booking");
      setBooking(null);
    } finally {
      setIsLoading(false);
    }
  }, [bookingId, ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchBooking();
    }
  }, [hasAccess, fetchBooking]);

  const withAction = async (action: () => Promise<void>) => {
    if (!csrfToken) {
      setMessage("Missing session token. Refresh the page and try again.");
      return;
    }

    setIsActing(true);
    setMessage(null);
    try {
      await action();
      await fetchBooking();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsActing(false);
    }
  };

  const requestStk = async () => {
    if (!booking) return;
    if (!booking.guestPhone) throw new Error("Missing guest phone number.");
    const res = await fetch("/api/airbnb/payments/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, amount: booking.total, phone: booking.guestPhone }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Failed to initiate M-Pesa payment");
    setMessage("M-Pesa request sent.");
  };

  const sendPaymentLink = async () => {
    if (!booking) return;
    const res = await fetch("/api/airbnb/tenants/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, deliveryMethod: "both" }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Failed to send payment link");
    setMessage("Payment link and login details sent.");
  };

  const recordCash = async () => {
    if (!booking) return;
    const res = await fetch("/api/airbnb/payments/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, amount: booking.total, method: "cash" }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Failed to record cash payment");
    setMessage("Cash payment recorded.");
  };

  const impersonateTenant = async () => {
    if (!booking?.tenantId) {
      throw new Error("Payment portal account not created yet. Click “Payment link” first.");
    }
    if (role !== "propertyOwner") {
      throw new Error("Only the property owner can impersonate tenant accounts.");
    }

    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ tenantId: booking.tenantId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to impersonate tenant");
    }
    window.location.href = json.redirect || "/airbnb-tenant-dashboard";
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-5xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Booking details"
            subtitle={booking ? `${booking.guestName} • ${booking.listingName}` : "Review reservation and payments."}
            icon={ClipboardList}
            actions={
              <button
                onClick={() => router.push("/airbnb-dashboard/bookings")}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={14} />
                Back to bookings
              </button>
            }
          />

          {message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-800">
              {message}
            </div>
          )}

          {isLoading ? (
            <section className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">Loading...</section>
          ) : !booking ? (
            <section className="surface-card rounded-3xl p-6 text-sm text-muted-foreground">
              Booking not found.
            </section>
          ) : (
            <>
              <section className="surface-card rounded-3xl p-6 sm:p-7">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-2xl border border-border bg-white/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Guest</p>
                    <p className="mt-2 font-semibold text-foreground inline-flex items-center gap-2">
                      <UserRound size={14} />
                      {booking.guestName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{booking.guestEmail || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{booking.guestPhone || "—"}</p>
                    {booking.guestIdNumber ? (
                      <p className="mt-1 text-xs text-muted-foreground">ID: {booking.guestIdNumber}</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-border bg-white/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Reservation</p>
                    <p className="mt-2 font-semibold text-foreground">{booking.listingName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(booking.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
                      →{" "}
                      {new Date(booking.checkOut).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" • "}
                      {booking.nights} night{booking.nights === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Booking ID: {booking.id}</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-white/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Payment</p>
                    <p className="mt-2 font-semibold text-foreground inline-flex items-center gap-2">
                      <CreditCard size={14} />
                      {formatKes(booking.total)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Status: {booking.payoutStatus}</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-white/70 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Guest verification</p>
                    <p className="mt-2 font-semibold text-foreground inline-flex items-center gap-2">
                      <BadgeCheck size={14} />
                      {booking.verificationStatus === "documents_uploaded"
                        ? "Documents uploaded"
                        : "Documents missing"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Source: {booking.source}</p>
                  </div>
                </div>

                {booking.specialRequests ? (
                  <div className="mt-5 rounded-2xl border border-border bg-white/70 px-4 py-4 text-sm">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Special requests</p>
                    <p className="mt-2 text-foreground">{booking.specialRequests}</p>
                  </div>
                ) : null}
              </section>

              <section className="surface-card rounded-3xl p-6 sm:p-7">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Actions</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.payoutStatus !== "paid" ? (
                    <>
                      <button
                        onClick={() => withAction(requestStk)}
                        disabled={isActing}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
                      >
                        {isActing ? "Working..." : "STK push"}
                      </button>
                      <button
                        onClick={() => withAction(sendPaymentLink)}
                        disabled={isActing}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                      >
                        <LinkIcon size={14} />
                        {isActing ? "Working..." : "Payment link"}
                      </button>
                      <button
                        onClick={() => withAction(recordCash)}
                        disabled={isActing}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {isActing ? "Working..." : "Cash"}
                      </button>
                    </>
                  ) : null}

                  <button
                    onClick={() => withAction(impersonateTenant)}
                    disabled={isActing || !booking.tenantId || role !== "propertyOwner"}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-4 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    title={
                      role !== "propertyOwner"
                        ? "Only the property owner can impersonate tenant accounts."
                        : booking.tenantId
                          ? "Impersonate the guest payment account"
                          : "Create the payment portal account first."
                    }
                  >
                    Impersonate guest
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
