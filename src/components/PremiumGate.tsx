"use client";

import React, { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";

export default function PremiumGate(props: {
  locked: boolean;
  title?: string;
  message?: string;
  children: React.ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const {
    locked,
    title = "Upgrade to Premium",
    message = "This section is available on Premium. Upgrade to unlock full access.",
    children,
    ctaHref = "/upgrade",
    ctaLabel = "Upgrade",
  } = props;

  if (!locked) return <>{children}</>;

  const [isDue, setIsDue] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const checkDues = async () => {
      try {
        const res = await fetch("/api/owner-dues", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) {
          setIsDue(Boolean(data?.isDue));
        }
      } catch {
        // ignore
      }
    };
    checkDues();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedCta = useMemo(() => {
    if (!isDue) {
      return { href: ctaHref, label: ctaLabel, title, message };
    }

    const managementType = Cookies.get("managementType") === "airbnb" ? "airbnb" : "rentals";
    const payHref = managementType === "airbnb" ? "/airbnb-dashboard/reports" : "/property-owner-dashboard/reports";

    return {
      href: payHref,
      label: "Pay invoice",
      title: "Payment required",
      message: "Your invoice is overdue. Pay to regain full access.",
    };
  }, [ctaHref, ctaLabel, isDue, message, title]);

  return (
    <div className="relative">
      <div className="blur-sm opacity-60 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-2xl border border-amber-200 bg-amber-50/90 backdrop-blur-sm p-5 shadow-lg">
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Premium feature</p>
          <h3 className="mt-1 text-sm sm:text-base font-semibold text-foreground">{resolvedCta.title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{resolvedCta.message}</p>
          <div className="mt-4 flex items-center gap-3">
            <a
              href={resolvedCta.href}
              className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
            >
              {resolvedCta.label}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
