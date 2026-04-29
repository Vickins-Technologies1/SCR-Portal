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

  const resolved = tier ?? resolveAccountTier(undefined, "premium");
  return {
    tier: resolved,
    isFree: resolved === "free",
    isPremium: resolved === "premium",
    refreshTier,
  };
}
