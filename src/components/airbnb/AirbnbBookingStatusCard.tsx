"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { AlertCircle, BadgeCheck, CalendarDays, Clock3, CreditCard, Download, MessageCircle, ReceiptText } from "lucide-react";

type BookingStatus = {
  id: string;
  listingName: string;
  guestName: string;
  guestCount?: number | null;
  checkIn: string;
  checkOut: string;
  total: number;
  amountPaid?: number;
  amountDue?: number;
  payoutStatus?: string;
  status?: string;
  reference?: string;
  paymentMethod?: string | null;
  mpesaCode?: string | null;
  paymentDate?: string | null;
  verifiedBy?: string | null;
  verificationTimestamp?: string | null;
  confirmedAt?: string | null;
  hostName?: string | null;
  hostPhone?: string | null;
  hostEmail?: string | null;
};

export default function AirbnbBookingStatusCard({
  booking,
  showReceiptLink,
  showPayNow,
}: {
  booking: BookingStatus;
  showReceiptLink?: boolean;
  showPayNow?: boolean;
}) {
  return <AirbnbBookingStatusCardInner booking={booking} showReceiptLink={showReceiptLink} showPayNow={showPayNow} />;
}

function AirbnbBookingStatusCardInner({
  booking,
  showReceiptLink = true,
  showPayNow = true,
}: {
  booking: BookingStatus;
  showReceiptLink?: boolean;
  showPayNow?: boolean;
}) {
  const isConfirmed = String(booking.status || "").toLowerCase() === "confirmed";
  const amountPaid = Number(booking.amountPaid ?? (isConfirmed ? booking.total : 0));
  const amountDue = Number(booking.amountDue ?? Math.max(0, booking.total - amountPaid));
  const bookingReference = String(booking.reference || booking.id || "").trim();
  const guestCount = Number.isFinite(Number(booking.guestCount)) && Number(booking.guestCount) > 0 ? Number(booking.guestCount) : 1;
  const paymentMethod = String(booking.paymentMethod || "M-Pesa");
  const mpesaCode = String(booking.mpesaCode || "").trim();
  const hostName = String(booking.hostName || "Host");
  const hostPhone = String(booking.hostPhone || "").trim();

  const whatsappHref = useMemo(() => {
    if (!hostPhone) return null;
    const cleanPhone = hostPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    const message = encodeURIComponent(
      `Hello ${hostName}, I have a question about my booking at ${booking.listingName}. Reference: ${bookingReference}.`
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  }, [booking.listingName, bookingReference, hostName, hostPhone]);

  const calendarHref = useMemo(() => {
    const start = new Date(booking.checkIn);
    const end = new Date(booking.checkOut);
    const fmt = (date: Date) =>
      date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sorana Property Managers//Airbnb Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${bookingReference}@sorana`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${booking.listingName} booking`,
      `DESCRIPTION:Booking reference ${bookingReference}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
  }, [booking.checkIn, booking.checkOut, booking.listingName, bookingReference]);

  return (
    <section className="surface-card rounded-[2rem] border border-border/80 overflow-hidden shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
      <div
        className={`px-6 py-6 sm:px-8 sm:py-8 ${
          isConfirmed
            ? "bg-gradient-to-br from-emerald-50 via-white to-cyan-50"
            : "bg-gradient-to-br from-amber-50 via-white to-orange-50"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                isConfirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isConfirmed ? <BadgeCheck size={13} /> : <AlertCircle size={13} />}
              {isConfirmed ? "Booking Confirmed" : "Payment Verification Pending"}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{booking.listingName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isConfirmed
                  ? "Your reservation is secure and ready for arrival."
                  : "We have your booking, and it will be confirmed after payment verification."}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white/80 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Reference</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{bookingReference}</p>
          </div>
        </div>

        {!isConfirmed ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
            <p className="font-semibold">Payment verification pending</p>
            <p className="mt-1 text-[13px] leading-6 text-amber-900/85">
              Your booking will move to confirmed once the payment is verified by the system or by an authorized Admin/Owner.
              Until then, we won&apos;t display the confirmed booking state.
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <InfoPill label="Check-in" value={new Date(booking.checkIn).toLocaleString("en-KE", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })} icon={<CalendarDays size={14} />} />
          <InfoPill label="Check-out" value={new Date(booking.checkOut).toLocaleString("en-KE", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })} icon={<Clock3 size={14} />} />
          <InfoPill label="Stay" value={`${guestCount} guest${guestCount === 1 ? "" : "s"} · ${Math.max(1, Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000))} night${Math.max(1, Math.round((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000)) === 1 ? "" : "s"}`} icon={<BadgeCheck size={14} />} />
          <InfoPill label="Amount paid" value={`KES ${amountPaid.toLocaleString("en-KE")}`} icon={<CreditCard size={14} />} />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <InfoPill label="Payment method" value={paymentMethod} icon={<CreditCard size={14} />} />
          <InfoPill label="M-Pesa ref" value={mpesaCode || "—"} icon={<ReceiptText size={14} />} />
          <InfoPill label="Host" value={hostName} icon={<MessageCircle size={14} />} />
          <InfoPill label="Due" value={`KES ${amountDue.toLocaleString("en-KE")}`} icon={<Clock3 size={14} />} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              <MessageCircle size={16} />
              Contact Host
            </a>
          ) : null}
          {showReceiptLink ? (
            <a
              href="/api/airbnb-tenant/booking/receipt"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-slate-50"
            >
              <Download size={16} />
              View Receipt
            </a>
          ) : null}
          <a
            href={calendarHref}
            download={`airbnb-booking-${bookingReference}.ics`}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
          >
            <CalendarDays size={16} />
            Add to Calendar
          </a>
          {!isConfirmed && showPayNow ? (
            <Link
              href="/airbnb-tenant-dashboard/payments"
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              Pay now
            </Link>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-white/70 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Host details</p>
          <p className="mt-1">
            {hostName}
            {hostPhone ? ` • ${hostPhone}` : ""}
          </p>
          {booking.verifiedBy || booking.verificationTimestamp ? (
            <p className="mt-1">
              Verified by {booking.verifiedBy || "System"}
              {booking.verificationTimestamp ? ` on ${new Date(booking.verificationTimestamp).toLocaleString("en-KE")}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function InfoPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground leading-6">{value}</p>
    </div>
  );
}
