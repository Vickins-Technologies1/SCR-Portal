"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarCheck, AlertCircle, RefreshCw } from "lucide-react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import { cn } from "@/lib/cn";
import { formatKes } from "@/lib/airbnb-metrics";
import AirbnbPaymentVerificationModal from "@/components/airbnb/AirbnbPaymentVerificationModal";

interface Booking {
  _id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  listingName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  status: string;
  source: string;
  payoutStatus: string;
  createdAt?: string;
}

export default function AdminAirbnbBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<Booking | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchBookings = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/airbnb/bookings", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load bookings");

      setBookings(data.bookings || []);
    } catch (err: any) {
      setError(err.message || "Failed to load Airbnb bookings.");
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  const verifyPayment = async (payload: { transactionCode: string; amount: number; paymentDateTime: string; note?: string }) => {
    if (!verificationTarget) return;
    setIsVerifying(true);
    try {
      const res = await fetch("/api/airbnb/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bookingId: verificationTarget._id,
          ownerId: verificationTarget.ownerId,
          transactionCode: payload.transactionCode,
          amount: payload.amount,
          paymentDateTime: payload.paymentDateTime,
          note: payload.note,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to verify payment");
      setVerificationTarget(null);
      await fetchBookings();
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchBookings();
    }
  }, [status, fetchBookings]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CalendarCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Airbnb Bookings</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Inspect reservations from Airbnb and direct channels.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchBookings();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl h-20 animate-pulse" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
              No Airbnb bookings yet.
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="table-shell">
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listing</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guest</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Owner</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-In</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-Out</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nights</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payout</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking._id} className="hover:bg-primary/5 transition-colors">
                        <td className="py-3 px-4 text-xs font-medium text-foreground">{booking.listingName}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{booking.guestName}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{booking.ownerEmail || booking.ownerName}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {new Date(booking.checkIn).toLocaleDateString("en-KE")}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {new Date(booking.checkOut).toLocaleDateString("en-KE")}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{booking.nights ?? 0}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-primary">{formatKes(booking.total || 0)}</td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                              booking.status === "confirmed"
                                ? "bg-emerald-100 text-emerald-700"
                                : booking.status === "cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{booking.source}</td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                              booking.payoutStatus === "paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : booking.payoutStatus === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {booking.payoutStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {booking.payoutStatus !== "paid" ? (
                            <button
                              onClick={() => setVerificationTarget(booking)}
                              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              Verify
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </main>
      </div>

      <AirbnbPaymentVerificationModal
        open={Boolean(verificationTarget)}
        booking={
          verificationTarget
            ? {
                id: verificationTarget._id,
                listingName: verificationTarget.listingName,
                guestName: verificationTarget.guestName,
                total: verificationTarget.total,
                ownerId: verificationTarget.ownerId,
                reference: verificationTarget._id,
                paymentMethod: "M-Pesa",
                mpesaCode: null,
                paymentDate: verificationTarget.createdAt || null,
              }
            : null
        }
        onClose={() => setVerificationTarget(null)}
        onSubmit={verifyPayment}
        isSubmitting={isVerifying}
      />
    </div>
  );
}
