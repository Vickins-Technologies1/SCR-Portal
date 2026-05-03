"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

interface BookingRequestProps {
  listingId: string;
  propertyName: string;
  nightlyRate: number;
}

const diffNights = (checkIn: string, checkOut: string) => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.max(0, endDay.getTime() - startDay.getTime());
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
};

export default function BookingRequest({ listingId, propertyName, nightlyRate }: BookingRequestProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("1");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return diffNights(checkIn, checkOut);
  }, [checkIn, checkOut]);
  const totalEstimate = useMemo(() => {
    if (!nightlyRate || !nights) return 0;
    return nightlyRate * nights;
  }, [nightlyRate, nights]);

  const isValid = useMemo(() => {
    if (!fullName.trim() || !email.trim() || !checkIn || !checkOut) return false;
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return false;
    return outDate.getTime() > inDate.getTime();
  }, [fullName, email, checkIn, checkOut]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setFormMessage(null);

    try {
      const res = await fetch("/api/public-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          guestName: fullName.trim(),
          guestEmail: email.trim(),
          guestPhone: phone.trim(),
          checkIn,
          checkOut,
          guests: guests ? Number(guests) : undefined,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to submit the request.");
      }

      toast.success("Request sent to the owner.");
      setFormMessage("Request submitted to the owner account. You will receive confirmation shortly.");
      setFullName("");
      setEmail("");
      setPhone("");
      setCheckIn("");
      setCheckOut("");
      setGuests("1");
      setNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit the request.";
      toast.error(message);
      setFormMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
      <Toaster position="top-right" toastOptions={{ duration: 2500 }} />
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Booking request</h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <CalendarCheck size={12} /> Owner inbox
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Check-in
            </label>
            <input
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Check-out
            </label>
            <input
              type="date"
              value={checkOut}
              onChange={(event) => setCheckOut(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Guests
            </label>
            <input
              type="number"
              min="1"
              value={guests}
              onChange={(event) => setGuests(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              Phone (optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+254..."
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Preferred arrival time, special requests."
            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
          />
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-[11px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>Nights</span>
            <span className="font-semibold text-slate-700">{nights || "—"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Estimate</span>
            <span className="font-semibold text-slate-900">
              {totalEstimate ? `Ksh ${totalEstimate.toLocaleString()}` : "On request"}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid}
          className="mt-2 w-full rounded-full bg-slate-900 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? "Submitting..." : "Submit request"}
        </button>

        {formMessage ? (
          <p className="text-[11px] text-slate-500">{formMessage}</p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Your request is logged in the owner account for review. A confirmation email is sent when enabled.
          </p>
        )}
      </form>
    </div>
  );
}
