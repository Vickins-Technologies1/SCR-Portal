"use client";

import { useMemo } from "react";
import Cookies from "js-cookie";
import type { AccountTier } from "@/lib/tier";
import { resolveAccountTier } from "@/lib/tier";

export function useAccountTier() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { tier: null as AccountTier | null, isFree: false, isPremium: false };
    }

    const raw = Cookies.get("tier");
    const tier = resolveAccountTier(raw, "premium");
    return { tier, isFree: tier === "free", isPremium: tier === "premium" };
  }, []);
}

