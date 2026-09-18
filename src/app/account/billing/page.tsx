"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import OwnerPageShell from "@/app/property-owner-dashboard/components/OwnerPageShell";
import { SidebarProvider } from "@/app/property-owner-dashboard/components/SidebarContext";

export default function AccountBillingPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch("/api/account/entitlements", { credentials: "include" }).then((response) => response.json()).then(setData).catch(() => setData({ success: false })); }, []);
  const lifetime = data?.plan?.type === "lifetime";
  return (
    <PublicThemeWrapper>
      <SidebarProvider>
        <OwnerPageShell>
          <main className="min-h-[100svh] bg-background px-4 py-10 text-foreground sm:px-6">
            <div className="mx-auto max-w-3xl space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[.28em] text-primary">Account</p>
                <h1 className="mt-2 text-3xl font-semibold">Billing & access</h1>
              </div>
              <section className="rounded-3xl border border-border bg-card p-6 shadow-xl">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Plan</p><p className="mt-1 text-xl font-semibold">{data?.plan?.name || "Loading…"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Billing</p><p className="mt-1 font-semibold">{lifetime ? "One-time payment" : data?.plan?.billingType || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-semibold text-primary">{data?.plan?.status || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Purchased</p><p className="mt-1 font-semibold">{data?.billing?.purchasedAt ? new Date(data.billing.purchasedAt).toLocaleDateString("en-KE") : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Renewal</p><p className="mt-1 font-semibold">{lifetime ? "Never" : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Next payment</p><p className="mt-1 font-semibold">{lifetime ? "None" : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Transaction reference</p><p className="mt-1 break-all font-mono text-xs">{data?.billing?.providerReference || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Amount paid</p><p className="mt-1 font-semibold">{data?.billing?.amountPaid != null ? `${data.billing.currency} ${Number(data.billing.amountPaid).toLocaleString()}` : "—"}</p></div>
                </div>
                {lifetime && <p className="mt-7 rounded-2xl bg-primary/10 p-4 text-sm text-primary">Your Lifetime access does not require recurring payments.</p>}
                {!lifetime && <Link href="/lifetime/checkout" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Get Lifetime Access</Link>}
              </section>
              <section className="rounded-3xl border border-border bg-card p-6">
                <h2 className="font-semibold">Configured access</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {Object.entries(data?.limits || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{key.replace(/Limit$/, "")}</span>
                      <span className="font-semibold">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>
        </OwnerPageShell>
      </SidebarProvider>
    </PublicThemeWrapper>
  );
}
