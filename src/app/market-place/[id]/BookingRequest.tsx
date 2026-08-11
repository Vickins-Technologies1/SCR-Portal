"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, MessageCircle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { buildWhatsAppLink } from "@/lib/listing-contact";

interface BookingRequestProps {
  propertyName: string;
  contactPhone?: string | null;
  nightlyRate?: number;
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

export default function BookingRequest({ propertyName, contactPhone, nightlyRate }: BookingRequestProps) {
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
    if (!fullName.trim() || !checkIn || !checkOut) return false;
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return false;
    return outDate.getTime() > inDate.getTime();
  }, [fullName, checkIn, checkOut]);

  const buildInquiryMessage = () => {
    const requestedGuests = Number(guests || 1);
    const parts = [
      `Hello, I am interested in booking ${propertyName}.`,
      `I found the property on Sorana and would like to know its availability and booking requirements.`,
      "",
      `Name: ${fullName.trim()}`,
      `Check-in: ${checkIn}`,
      `Check-out: ${checkOut}`,
      `Guests: ${Number.isFinite(requestedGuests) && requestedGuests > 0 ? requestedGuests : 1}`,
    ];

    if (email.trim()) {
      parts.push(`Email: ${email.trim()}`);
    }
    if (phone.trim()) {
      parts.push(`Phone: ${phone.trim()}`);
    }
    if (notes.trim()) {
      parts.push("");
      parts.push(`Notes: ${notes.trim()}`);
    }

    if (nights > 0 && nightlyRate) {
      parts.push("");
      parts.push(`Estimated stay: ${nights} night(s)`);
      parts.push(`Estimated total: Ksh ${totalEstimate.toLocaleString()}`);
    }

    return parts.join("\n");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid || isSubmitting) return;

    const inquiryPhone = contactPhone?.trim() || "";
    if (!inquiryPhone) {
      toast.error("This listing does not have a WhatsApp contact number.");
      setFormMessage("This property does not have a WhatsApp contact number listed yet.");
      return;
    }

    const message = buildInquiryMessage();
    const preferWeb = typeof window !== "undefined" && !/Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    const link = buildWhatsAppLink(inquiryPhone, message, preferWeb);

    if (!link) {
      toast.error("The listed WhatsApp number is invalid.");
      setFormMessage("The listed WhatsApp number is invalid. Please try another property or contact support.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage(null);

    try {
      window.open(link, "_blank", "noopener,noreferrer");
      toast.success("Opening WhatsApp with your inquiry.");
      setFormMessage("WhatsApp opened with a prefilled inquiry. The booking is not confirmed until the owner responds.");
    } catch {
      toast.error("Unable to open WhatsApp right now.");
      setFormMessage("Unable to open WhatsApp right now. Please copy the inquiry and message the contact manually.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
      <Toaster position="top-right" toastOptions={{ duration: 2500 }} />
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Book via WhatsApp</h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <CalendarCheck size={12} /> Direct contact
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
              Email (optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition"
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
          <div className="mt-1 flex items-center justify-between">
            <span>Contact</span>
            <span className="font-mono text-[10px] text-slate-700">
              {contactPhone || "Not listed"}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || isSubmitting || !contactPhone}
          className="mt-2 w-full rounded-full bg-primary px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <MessageCircle size={14} />
          {isSubmitting ? "Opening WhatsApp..." : "Contact on WhatsApp"}
        </button>

        {formMessage ? (
          <p className="text-[11px] text-slate-500">{formMessage}</p>
        ) : (
          <p className="text-[11px] text-slate-500">
            WhatsApp opens with a prefilled inquiry. This does not confirm the booking.
          </p>
        )}
      </form>
    </div>
  );
}
