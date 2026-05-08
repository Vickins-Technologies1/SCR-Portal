"use client";

import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";
import type { AccountTier } from "@/lib/tier";
import { resolveAccountTier } from "@/lib/tier";

export function useAccountTier() {
  const [tier, setTier] = useState<AccountTier | null>(null);

  const refreshTier = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = Cookies.get("tier");
    setTier(resolveAccountTier(raw, "premium"));
  }, []);

  useEffect(() => {
    refreshTier();
  }, [refreshTier]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromCookie = () => {
      const raw = Cookies.get("tier");
      const next = resolveAccountTier(raw, "premium");
      setTier((prev) => (prev === next ? prev : next));
    };

    // Keep React state in sync when the server updates the cookie (e.g. invoice due -> free mode).
    const interval = window.setInterval(syncFromCookie, 3000);
    window.addEventListener("focus", syncFromCookie);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncFromCookie);
    };
  }, []);

  const resolved = tier ?? resolveAccountTier(undefined, "premium");
  return {
    tier: resolved,
    isFree: resolved === "free",
    isPremium: resolved === "premium",
    refreshTier,
  };
}
