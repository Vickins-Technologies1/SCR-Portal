"use client";

import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { CheckCircle2, Crown, Lock, Sparkles } from "lucide-react";
import { useAccountTier } from "@/hooks/useAccountTier";

export default function UpgradePage() {
  const router = useRouter();
  const { tier, isFree, isPremium } = useAccountTier();
  const [role, setRole] = useState<string | null>(null);
  const [managementType, setManagementType] = useState<"rentals" | "airbnb">("rentals");

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRole(Cookies.get("role") ?? null);
    setManagementType(Cookies.get("managementType") === "airbnb" ? "airbnb" : "rentals");
  }, []);

  const fetchCsrfToken = useCallback(async () => {
    const existing = Cookies.get("csrf-token");
    if (existing) return existing;
    const res = await fetch("/api/csrf-token", { credentials: "include" });
    const data = await res.json();
    if (data?.csrfToken) {
      Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/", expires: 1 });
      return data.csrfToken as string;
    }
    return null;
  }, []);

  const handleUpgrade = useCallback(async () => {
    if (role !== "propertyOwner") {
      setMessage("Only the Property Owner can upgrade this account. Ask the owner to upgrade.");
      return;
    }

    setIsUpgrading(true);
    setMessage(null);
    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) throw new Error("Missing CSRF token. Refresh and try again.");

      const res = await fetch("/api/owner/tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ tier: "premium" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Upgrade failed. Please try again.");
      }

      setMessage("Upgraded to Premium. Redirecting you to your dashboard…");
      const redirect = managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
      window.location.assign(redirect);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upgrade failed. Please try again.");
    } finally {
      setIsUpgrading(false);
    }
  }, [fetchCsrfToken, managementType, role]);

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <div className="pt-10 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-6xl mx-auto space-y-6">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Plans</p>
                <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">Upgrade your tier</h1>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                  Free includes 1 property for life. Premium unlocks automated tenant payments and critical operations.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                Current: {tier === "free" ? "Free" : "Premium"}
              </div>
            </div>
          </section>

          {message && (
            <section className="surface-card rounded-2xl p-4 border border-border text-sm">
              {message}
            </section>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-700" />
                  Free (Forever)
                </h2>
                {isFree && (
                  <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-700">
                    Active
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  1 property free for life
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Full Tenants & Property details access
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Dashboard access (limited insights)
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="h-4 w-4 mt-0.5 text-amber-700" />
                  Critical operations locked (Integrations, Users, Expenses, Reports)
                </li>
              </ul>
            </div>

            <div className="surface-card rounded-3xl p-6 border border-primary/20 bg-[linear-gradient(110deg,rgba(66,199,117,0.10),rgba(66,199,117,0.04))]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  Premium
                </h2>
                {isPremium && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-700">
                    Active
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Automated tenant payments & collections
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Full dashboard insights + trends
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Integrations, expenses, reports, and users management
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                  Scale beyond 1 property
                </li>
              </ul>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={isPremium || isUpgrading}
                  onClick={handleUpgrade}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPremium ? "You’re on Premium" : isUpgrading ? "Upgrading…" : "Upgrade to Premium"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard")}
                  className="mt-3 w-full inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/40"
                >
                  Back to dashboard
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
