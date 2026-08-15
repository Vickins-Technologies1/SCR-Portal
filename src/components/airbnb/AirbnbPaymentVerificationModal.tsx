"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type VerificationBooking = {
  id: string;
  listingName: string;
  guestName?: string | null;
  total: number;
  ownerId?: string | null;
  reference?: string | null;
  paymentMethod?: string | null;
  mpesaCode?: string | null;
  paymentDate?: string | null;
};

export default function AirbnbPaymentVerificationModal({
  open,
  booking,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  booking: VerificationBooking | null;
  onClose: () => void;
  onSubmit: (payload: { transactionCode: string; amount: number; paymentDateTime: string; note?: string }) => Promise<void>;
  isSubmitting?: boolean;
}) {
  const [transactionCode, setTransactionCode] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDateTime, setPaymentDateTime] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !booking) return;
    setTransactionCode(String(booking.mpesaCode || "").trim());
    setAmount(String(booking.total || ""));
    setPaymentDateTime(
      booking.paymentDate ? new Date(booking.paymentDate).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
    );
    setNote("");
  }, [booking, open]);

  if (!open || !booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-[1.5rem] border border-border bg-background shadow-[0_24px_100px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Manual verification</p>
            <h3 className="text-lg font-semibold text-foreground">{booking.listingName}</h3>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-border bg-white/80 p-4 text-sm">
            <p className="font-semibold text-foreground">{booking.guestName || "Guest"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Reference: {booking.reference || booking.id}</p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              M-Pesa transaction code
            </span>
            <input
              value={transactionCode}
              onChange={(e) => setTransactionCode(e.target.value)}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
              placeholder="e.g. QJH4K8L1ZX"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Amount
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Payment date/time
              </span>
              <input
                value={paymentDateTime}
                onChange={(e) => setPaymentDateTime(e.target.value)}
                type="datetime-local"
                className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Note
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
              placeholder="Optional note for audit trail"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                transactionCode: transactionCode.trim(),
                amount: Number(amount || booking.total || 0),
                paymentDateTime,
                note: note.trim() || undefined,
              })
            }
            disabled={isSubmitting || !transactionCode.trim()}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting ? "Verifying..." : "Verify payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
