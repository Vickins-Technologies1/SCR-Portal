"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CreditCard, ShieldCheck } from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

type Plan = { currency: string; active: boolean; features: Record<string, boolean>; limits: Record<string, number | string>; pricing: { minimumUnits: number; maximumUnits: number | null; currency: string; tiers: Array<{ minUnits: number; maxUnits: number | null; price: number; currency: string; active: boolean }> } };
type Quote = { units: number; amount: number; currency: string; tier: { minUnits: number; maxUnits: number | null } };

export default function LifetimeCheckoutPage() {
  const router = useRouter();
  const { csrfToken, ensureCsrf } = useCsrfToken();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    fetch("/api/lifetime/plan", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        const nextPlan = data.plan || null;
        setPlan(nextPlan);
        const requestedUnits = Number(new URLSearchParams(window.location.search).get("units"));
        setUnits(Number.isSafeInteger(requestedUnits) && requestedUnits > 0 ? requestedUnits : nextPlan?.pricing?.minimumUnits || 1);
      })
      .catch(() => setMessage("Unable to load Lifetime package details."));
  }, []);

  useEffect(() => {
    if (!plan || !Number.isSafeInteger(units) || units < plan.pricing.minimumUnits) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    fetch("/api/lifetime/plan", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ units }) })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "No price is available for this unit count.");
        if (!cancelled) { setQuote(data); setMessage(null); }
      })
      .catch((error) => { if (!cancelled) { setQuote(null); setMessage(error instanceof Error ? error.message : "No price is available for this unit count."); } })
      .finally(() => { if (!cancelled) setQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [plan, units]);

  useEffect(() => {
    if (!paymentId || status === "paid" || status === "failed" || status === "cancelled") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/lifetime/checkout/status?paymentId=${encodeURIComponent(paymentId)}`, { credentials: "include" });
      const data = await response.json();
      if (data.success) {
        setStatus(data.payment.status);
        if (data.entitlement) {
          setMessage("Payment successful. Your Lifetime entitlement is active.");
          window.clearInterval(timer);
          window.setTimeout(() => router.replace("/property-owner-dashboard"), 1200);
        }
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [paymentId, status, router]);

  const startPayment = async () => {
    if (!confirmed) return setMessage("Please confirm that this is a one-time payment.");
    if (!quote) return setMessage("Choose a unit count with an available Lifetime price.");
    setLoading(true);
    setMessage(null);
    try {
      const token = csrfToken || await ensureCsrf();
      const response = await fetch("/api/lifetime/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token || "" },
        credentials: "include",
        body: JSON.stringify({ phone, units }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to start payment.");
      setPaymentId(data.paymentId);
      setStatus(data.status || "pending");
      setMessage(data.message || "Check your phone to complete payment.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment.");
    } finally {
      setLoading(false);
    }
  };

  const money = quote ? `${quote.currency} ${quote.amount.toLocaleString("en-KE")}` : "Price to be configured";
  const featureLabels = ["Property management", "Tenant management", "Financial reporting", "Maintenance management", "Notifications", "Multi-user support", "Marketplace access"];

  return (
    <main className="min-h-[100svh] bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.05fr_.95fr] lg:items-start">
        <section className="rounded-[2rem] border border-primary/20 bg-card p-7 shadow-2xl sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-primary">Sorana Lifetime</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Own your property management experience — pay once.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">A permanent product entitlement with no monthly subscription and no annual renewal. Access remains tied to your Sorana account.</p>
          <div className="mt-8 flex flex-wrap items-end gap-3">
            <span className="text-4xl font-semibold">{money}</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">One-time payment</span>
          </div>
          <label className="mt-8 block text-sm font-medium">Number of units<input type="number" min={plan?.pricing.minimumUnits ?? 1} max={plan?.pricing.maximumUnits ?? undefined} step="1" value={units} onChange={(event) => setUnits(Math.max(plan?.pricing.minimumUnits ?? 1, Number(event.target.value) || 0))} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-lg outline-none focus:border-primary" /></label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-primary/10 p-4 text-sm"><p className="text-xs text-muted-foreground">Pricing tier</p><p className="mt-1 font-semibold">{quote ? `${quote.tier.minUnits}–${quote.tier.maxUnits ?? "∞"} units` : quoteLoading ? "Calculating…" : "Unavailable"}</p></div><div className="rounded-xl bg-muted/50 p-4 text-sm"><p className="text-xs text-muted-foreground">Included capacity</p><p className="mt-1 font-semibold">Up to {units || "—"} units</p></div></div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {featureLabels.map((feature) => <li key={feature} className="flex items-center gap-2 text-sm"><Check size={16} className="text-primary" />{feature}</li>)}
          </ul>
          <div className="mt-8 rounded-2xl bg-muted/50 p-4 text-xs text-muted-foreground">Configured limits are applied server-side and remain visible in your account after purchase.</div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-xl sm:p-8">
          <div className="flex items-center gap-3"><CreditCard className="text-primary" /><h2 className="text-xl font-semibold">Confirm your package</h2></div>
          <div className="mt-6 space-y-4 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Your package</span><span className="font-semibold">Lifetime</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payment type</span><span className="font-semibold">One-time</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Units</span><span className="font-semibold">{units}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pricing tier</span><span className="font-semibold">{quote ? `${quote.tier.minUnits}–${quote.tier.maxUnits ?? "∞"}` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{money}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Renewal</span><span className="font-semibold">None</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Access</span><span className="font-semibold">Lifetime</span></div>
          </div>
          <label className="mt-6 block text-sm font-medium">M-Pesa phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-primary" /></label>
          <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />I understand that this is a one-time payment and the Lifetime package does not renew automatically.</label>
          <button type="button" onClick={startPayment} disabled={loading || quoteLoading || Boolean(paymentId) || !plan?.active || !quote} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={17} />{loading ? "Starting secure payment…" : paymentId ? "Awaiting payment confirmation…" : quoteLoading ? "Calculating price…" : "Continue to Payment"}</button>
          {status && <p className="mt-4 text-center text-xs font-semibold uppercase tracking-widest text-primary">Payment status: {status}</p>}
          {message && <p className="mt-4 rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">{message}</p>}
          {!paymentId && <Link href="/property-owner-dashboard" className="mt-5 block text-center text-xs font-semibold text-primary hover:underline">Return to dashboard</Link>}
        </section>
      </div>
    </main>
  );
}
