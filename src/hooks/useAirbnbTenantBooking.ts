"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type AirbnbTenantBookingResponse = {
  success: boolean;
  message?: string;
  ownerTier?: "free" | "premium";
  features?: {
    canPay?: boolean;
  };
  booking?: {
    id: string;
    listingName: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    total: number;
    amountPaid?: number;
    amountDue?: number;
    payoutStatus?: string;
    reference?: string;
  };
  paymentRail?: {
    paymentType?: string;
    shortcode?: string;
    paybillAccountNumber?: string;
    hasPasskey?: boolean;
  };
  latestPayment?: {
    id: string;
    status?: string;
    provider?: string;
    amount?: number;
    paymentDate?: string;
    mpesaCode?: string | null;
  } | null;
};

export function useAirbnbTenantBooking() {
  const [data, setData] = useState<AirbnbTenantBookingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/booking", { credentials: "include" });
      const json: AirbnbTenantBookingResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load booking.");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load booking.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const booking = useMemo(() => data?.booking ?? null, [data]);
  const paymentRail = useMemo(() => data?.paymentRail ?? null, [data]);
  const latestPayment = useMemo(() => data?.latestPayment ?? null, [data]);
  const canPay = useMemo(() => data?.features?.canPay ?? true, [data]);

  return { data, booking, paymentRail, latestPayment, canPay, isLoading, error, refetch: fetchBooking };
}
