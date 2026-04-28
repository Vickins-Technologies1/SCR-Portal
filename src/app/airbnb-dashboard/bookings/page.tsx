"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, PlusCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbBooking } from "@/types/airbnb";
import { formatKes } from "@/lib/airbnb-metrics";

type AirbnbListingOption = { id: string; name: string; baseRate: number };
type PaymentMode = "mpesa" | "cash" | "link";

function parseLocalDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(year, month - 1, day);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function diffNights(checkIn: Date, checkOut: Date): number {
  const start = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()).getTime();
  const end = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()).getTime();
  const delta = end - start;
  if (!Number.isFinite(delta) || delta <= 0) return 1;
  return Math.max(1, Math.round(delta / 86400000));
}

export default function AirbnbBookingsPage() {
  const router = useRouter();
  const { hasAccess, ownerId, csrfToken, role } = useAirbnbAccess("tenants:view");
  const [bookings, setBookings] = useState<AirbnbBooking[]>([]);
  const [listings, setListings] = useState<AirbnbListingOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label?: string } | null>(null);
  const [isActing, setIsActing] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    listingId: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    checkIn: "",
    checkOut: "",
    amount: "",
    paymentMode: "mpesa" as PaymentMode,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [tableMessage, setTableMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const listingSelectRef = useRef<HTMLSelectElement | null>(null);
  const lastAutoAmountRef = useRef<string>("");

  const fetchBookings = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/bookings?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setBookings(data.bookings || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchBookings();
    }
  }, [hasAccess, fetchBookings]);

  const fetchListings = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/airbnb/listings?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setListings(
        (data.listings || []).map((listing: any) => ({
          id: listing.id,
          name: listing.name,
          baseRate: listing.baseRate || 0,
        }))
      );
    }
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchListings();
    }
  }, [hasAccess, fetchListings]);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === form.listingId),
    [listings, form.listingId]
  );

  useEffect(() => {
    const baseRate = Number(selectedListing?.baseRate || 0);
    if (!form.listingId || !Number.isFinite(baseRate) || baseRate <= 0) return;

    const checkInDate = parseLocalDate(form.checkIn);
    const checkOutDate = parseLocalDate(form.checkOut);
    const nights =
      checkInDate && checkOutDate && checkOutDate.getTime() > checkInDate.getTime()
        ? diffNights(checkInDate, checkOutDate)
        : 1;

    const computed = String(Math.round(baseRate * nights));
    const current = String(form.amount || "").trim();
    const shouldAutoFill = !current || current === lastAutoAmountRef.current;
    if (!shouldAutoFill) return;
    if (current === computed) {
      lastAutoAmountRef.current = computed;
      return;
    }

    lastAutoAmountRef.current = computed;
    setForm((prev) => ({ ...prev, amount: computed }));
  }, [form.amount, form.checkIn, form.checkOut, form.listingId, selectedListing?.baseRate]);

  const handleDirectBooking = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh the page and try again.");
      return;
    }
    if (!form.listingId || !form.guestName || !form.checkIn || !form.checkOut) {
      setFormMessage("Please fill in all required fields.");
      return;
    }
    if ((form.paymentMode === "mpesa" || form.paymentMode === "link") && !form.guestPhone) {
      setFormMessage("Phone number is required for M-Pesa payments.");
      return;
    }
    if (form.paymentMode === "link" && !form.guestEmail) {
      setFormMessage("Guest email is required to send a payment link.");
      return;
    }
    setIsSubmitting(true);
    setFormMessage(null);
    try {
      const bookingRes = await fetch("/api/airbnb/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          listingId: form.listingId,
          guestName: form.guestName,
          guestEmail: form.guestEmail || undefined,
          guestPhone: form.guestPhone,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          total: Number(form.amount || selectedListing?.baseRate || 0),
        }),
      });
      const bookingData = await bookingRes.json();
      if (!bookingRes.ok || !bookingData.success) {
        throw new Error(bookingData.message || "Failed to create booking");
      }

      const bookingId = bookingData.booking.id as string;
      const amount = Number(form.amount || bookingData.booking.total || 0);

      if (form.paymentMode === "mpesa") {
        const paymentRes = await fetch("/api/airbnb/payments/collect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            bookingId,
            amount,
            phone: form.guestPhone,
          }),
        });
        const paymentData = await paymentRes.json();
        if (!paymentRes.ok || !paymentData.success) {
          throw new Error(paymentData.message || "Failed to initiate M-Pesa payment");
        }
        setFormMessage("Booking created and M-Pesa request sent.");
      } else if (form.paymentMode === "cash") {
        const res = await fetch("/api/airbnb/payments/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
          body: JSON.stringify({ bookingId, amount, method: "cash" }),
        });
        const cashData = await res.json();
        if (!res.ok || !cashData.success) {
          throw new Error(cashData.message || "Failed to record cash payment");
        }
        setFormMessage("Booking created and cash payment recorded.");
      } else {
        const res = await fetch("/api/airbnb/tenants/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          credentials: "include",
          body: JSON.stringify({ bookingId, deliveryMethod: "both" }),
        });
        const inviteData = await res.json();
        if (!res.ok || !inviteData.success) {
          throw new Error(inviteData.message || "Failed to create payment account");
        }
        setFormMessage("Booking created. Payment link and login details sent to the guest.");
      }

      setForm({
        listingId: "",
        guestName: "",
        guestEmail: "",
        guestPhone: "",
        checkIn: "",
        checkOut: "",
        amount: "",
        paymentMode: "mpesa",
      });
      await fetchBookings();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  const withAction = async (bookingId: string, action: () => Promise<void>) => {
    if (!csrfToken) {
      setTableMessage("Missing session token. Refresh the page and try again.");
      return;
    }

    setIsActing((prev) => ({ ...prev, [bookingId]: true }));
    setTableMessage(null);
    try {
      await action();
      await fetchBookings();
    } catch (err) {
      setTableMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsActing((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const requestStkForBooking = async (booking: AirbnbBooking) => {
    if (!booking.guestPhone) {
      throw new Error("Missing guest phone number.");
    }
    const res = await fetch("/api/airbnb/payments/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, amount: booking.total, phone: booking.guestPhone }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to initiate M-Pesa payment");
    }
    setTableMessage("M-Pesa request sent.");
  };

  const sendPaymentLink = async (booking: AirbnbBooking) => {
    const res = await fetch("/api/airbnb/tenants/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, deliveryMethod: "both" }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to send payment link");
    }
    setTableMessage("Payment link and login details sent.");
  };

  const recordCash = async (booking: AirbnbBooking) => {
    const res = await fetch("/api/airbnb/payments/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
      credentials: "include",
      body: JSON.stringify({ bookingId: booking.id, amount: booking.total, method: "cash" }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to record cash payment");
    }
    setTableMessage("Cash payment recorded.");
  };

  const impersonateBookingGuest = async (booking: AirbnbBooking) => {
    if (role !== "propertyOwner") {
      throw new Error("Only the property owner can impersonate tenant accounts.");
    }
    if (!booking.tenantId) {
      throw new Error("Payment portal account not created yet. Click “Payment link” first.");
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

  const handleDeleteBooking = async (bookingId: string) => {
    if (!csrfToken) {
      setTableMessage("Missing session token. Refresh the page and try again.");
      return;
    }
    setIsDeleting(bookingId);
    setTableMessage(null);
    try {
      const res = await fetch(`/api/airbnb/bookings?bookingId=${encodeURIComponent(bookingId)}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete booking");
      }
      setBookings((prev) => prev.filter((booking) => booking.id !== bookingId));
      setTableMessage("Booking deleted.");
      setDeleteTarget(null);
    } catch (err) {
      setTableMessage(err instanceof Error ? err.message : "Failed to delete booking");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Bookings & Reservations"
            subtitle="Auto-import Airbnb reservations, manage status updates, and handle direct bookings."
            icon={ClipboardList}
            actions={
              <button
                onClick={() => {
                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setTimeout(() => listingSelectRef.current?.focus(), 300);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <PlusCircle size={16} />
                New direct booking
              </button>
            }
          />

          <section ref={formRef} className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Manual booking</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    ref={listingSelectRef}
                    value={form.listingId}
                    onChange={(event) => setForm((prev) => ({ ...prev, listingId: event.target.value }))}
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  >
                    <option value="">{listings.length ? "Select listing" : "No listings available"}</option>
                    {listings.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Guest name"
                    value={form.guestName}
                    onChange={(event) => setForm((prev) => ({ ...prev, guestName: event.target.value }))}
                  />
                  <input
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Guest email (for payment link)"
                    value={form.guestEmail}
                    onChange={(event) => setForm((prev) => ({ ...prev, guestEmail: event.target.value }))}
                  />
                  <input
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Phone (M-Pesa)"
                    value={form.guestPhone}
                    onChange={(event) => setForm((prev) => ({ ...prev, guestPhone: event.target.value }))}
                  />
                  <input
                    type="date"
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={form.checkIn}
                    onChange={(event) => setForm((prev) => ({ ...prev, checkIn: event.target.value }))}
                  />
                  <input
                    type="date"
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={form.checkOut}
                    onChange={(event) => setForm((prev) => ({ ...prev, checkOut: event.target.value }))}
                  />
                  <input
                    type="number"
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Total (KES)"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={form.paymentMode}
                    onChange={(event) => setForm((prev) => ({ ...prev, paymentMode: event.target.value as PaymentMode }))}
                    className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  >
                    <option value="mpesa">Request M-Pesa now</option>
                    <option value="link">Send payment link (guest pays)</option>
                    <option value="cash">Cash payment (mark as paid)</option>
                  </select>
                  <div className="rounded-xl border border-border bg-white/60 px-3 py-2 text-[11px] text-muted-foreground">
                    {form.paymentMode === "mpesa"
                      ? "Sends an STK Push to the guest phone."
                      : form.paymentMode === "link"
                        ? "Creates a temporary guest account and sends a payment link."
                        : "Records a completed cash payment (no STK Push)."}
                  </div>
                </div>
                <button
                  onClick={handleDirectBooking}
                  disabled={isSubmitting}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Saving..."
                    : form.paymentMode === "mpesa"
                      ? "Create booking + request payment"
                      : form.paymentMode === "link"
                        ? "Create booking + send payment link"
                        : "Create booking + record cash"}
                </button>
                {formMessage && (
                  <p className="mt-3 text-xs text-muted-foreground">{formMessage}</p>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Automation tips</p>
                <p>• Auto-send check-in instructions 24 hours before arrival.</p>
                <p>• Trigger cleaner tasks immediately after checkout.</p>
                <p>• Capture guest ID verification on arrival.</p>
              </div>
            </div>
          </section>

          <section className="table-shell">
            {tableMessage && (
              <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-800">
                {tableMessage}
              </div>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Listing</th>
                    <th>Dates</th>
                    <th>Nights</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Payout</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-6">
                        Loading bookings...
                      </td>
                    </tr>
                  ) : bookings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-6">
                        No bookings yet.
                      </td>
                    </tr>
                  ) : (
                    bookings.map((booking) => (
                      <tr
                        key={booking.id}
                        onClick={() => router.push(`/airbnb-dashboard/bookings/${encodeURIComponent(booking.id)}`)}
                        className="cursor-pointer"
                      >
                        <td className="font-semibold">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/airbnb-dashboard/bookings/${encodeURIComponent(booking.id)}`);
                            }}
                            className="text-left hover:underline"
                          >
                            {booking.guestName}
                          </button>
                        </td>
                        <td>{booking.listingName}</td>
                        <td className="table-muted">
                          {new Date(booking.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })} →
                          {new Date(booking.checkOut).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        <td>{booking.nights}</td>
                        <td>{formatKes(booking.total)}</td>
                        <td>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                              booking.status === "confirmed"
                                ? "bg-emerald-100 text-emerald-700"
                                : booking.status === "pending"
                                  ? "bg-amber-100 text-amber-700"
                                  : booking.status === "modified"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-red-100 text-red-700"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                              booking.payoutStatus === "paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : booking.payoutStatus === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {booking.payoutStatus}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                            {booking.payoutStatus !== "paid" ? (
                              <button
                                onClick={() => withAction(booking.id, () => requestStkForBooking(booking))}
                                disabled={Boolean(isActing[booking.id])}
                                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
                              >
                                {isActing[booking.id] ? "Working..." : "STK push"}
                              </button>
                            ) : null}
                            {booking.payoutStatus !== "paid" ? (
                              <button
                                onClick={() => withAction(booking.id, () => sendPaymentLink(booking))}
                                disabled={Boolean(isActing[booking.id])}
                                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                              >
                                {isActing[booking.id] ? "Working..." : "Payment link"}
                              </button>
                            ) : null}
                            {booking.payoutStatus !== "paid" ? (
                              <button
                                onClick={() => withAction(booking.id, () => recordCash(booking))}
                                disabled={Boolean(isActing[booking.id])}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {isActing[booking.id] ? "Working..." : "Cash"}
                              </button>
                            ) : null}
                            <button
                              onClick={() => withAction(booking.id, () => impersonateBookingGuest(booking))}
                              disabled={Boolean(isActing[booking.id]) || !booking.tenantId || role !== "propertyOwner"}
                              className="rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                              title={
                                role !== "propertyOwner"
                                  ? "Only the property owner can impersonate tenant accounts."
                                  : booking.tenantId
                                    ? "Impersonate the guest payment account"
                                    : "Create the payment portal account first."
                              }
                            >
                              {isActing[booking.id] ? "Working..." : "Impersonate"}
                            </button>
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  id: booking.id,
                                  label: `${booking.guestName} • ${booking.listingName}`,
                                })
                              }
                              disabled={isDeleting === booking.id}
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60"
                            >
                              {isDeleting === booking.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-sm overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Delete booking</h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      This also deletes any recorded payments for the booking.
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="modal-close rounded-full p-1"
                    aria-label="Close"
                    disabled={isDeleting === deleteTarget.id}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="px-5 pb-5 space-y-4 text-xs">
                  <p className="text-muted-foreground">
                    Confirm delete{deleteTarget.label ? ` (${deleteTarget.label})` : ""}? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(null)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                      disabled={isDeleting === deleteTarget.id}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBooking(deleteTarget.id)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                      disabled={!csrfToken || isDeleting === deleteTarget.id}
                    >
                      {isDeleting === deleteTarget.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
