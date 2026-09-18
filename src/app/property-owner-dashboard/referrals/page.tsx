"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Gift, Link2, Share2, WalletCards } from "lucide-react";
import OwnerPageShell from "../components/OwnerPageShell";

type ReferralData = {
  profile: { referralCode: string; rewardMode: string; referralLink: string };
  rewardMode: string;
  settings: { minimumPayoutAmount: number; subscriptionRewardMonths: number; cashCommissionAmount: number };
  stats: { total: number; registered: number; qualified: number; pending: number };
  wallet: { totalEarned: number; available: number; pending: number; paidOut: number };
  referrals: Array<{ _id: string; status: string; referredUser: string; createdAt: string; commission?: { amount: number; status: string } | null; subscriptionReward?: { months: number; status: string } | null }>;
  payouts: Array<{ _id: string; amount: number; method: string; destinationMasked: string; status: string; requestedAt: string; reference?: string }>;
};

const money = (value: number) => `KSh ${Number(value || 0).toLocaleString("en-KE")}`;

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("M-Pesa");
  const [destination, setDestination] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/referrals", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load referrals");
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetch("/api/csrf-token", { credentials: "include" }).then((response) => response.json()).then((payload) => setCsrfToken(payload.csrfToken || "")).catch(() => undefined);
  }, []);

  const copyLink = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.profile.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (!data) return;
    const text = `I’m using Sorana Property Managers to manage properties, tenants and payments.\n\nTry Sorana here:\n${data.profile.referralLink}`;
    if (navigator.share) await navigator.share({ title: "Try Sorana", text, url: data.profile.referralLink });
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const requestPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    const parsedAmount = Number(amount);
    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ amount: parsedAmount, method, destination, csrfToken, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to request payout");
      setMessage("Payout request submitted for review.");
      setShowPayout(false);
      setAmount("");
      setDestination("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request payout");
    }
  };

  const isCash = data?.rewardMode === "cash_commission" || data?.rewardMode === "cash_and_subscription";
  const canPayout = isCash && !!data && data.wallet.available >= data.settings.minimumPayoutAmount;
  const moreNeeded = useMemo(() => Math.max(0, (data?.settings.minimumPayoutAmount || 0) - (data?.wallet.available || 0)), [data]);

  if (loading) return <OwnerPageShell><main className="mx-auto min-h-screen max-w-7xl p-4 text-muted-foreground sm:p-6">Loading your referral dashboard…</main></OwnerPageShell>;
  if (!data) return <OwnerPageShell><main className="mx-auto min-h-screen max-w-7xl p-4 text-destructive sm:p-6">{message || "Referral dashboard unavailable."}</main></OwnerPageShell>;

  return (
    <OwnerPageShell><main className="mx-auto min-h-screen max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-primary">Sorana referral program</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Share Sorana. Earn rewards.</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your referral program is part of your Sorana account. You can refer customers whether or not you manage properties.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground transition hover:border-primary/40"><Copy size={15} />{copied ? "Copied" : "Copy link"}</button>
          <button onClick={share} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"><Share2 size={15} />Share</button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">{message}</div>}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><Link2 className="mt-0.5 text-primary" size={20} /><div><p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Your referral link</p><p className="mt-2 break-all text-sm font-semibold text-foreground">{data.profile.referralLink}</p><p className="mt-2 text-xs text-muted-foreground">Code: {data.profile.referralCode}</p></div></div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Total referrals', data.stats.total], ['Registered', data.stats.registered], ['Qualified', data.stats.qualified], ['Pending', data.stats.pending]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold text-foreground">{value}</p></div>)}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-3"><Gift className="text-primary" size={20} /><div><h2 className="font-semibold text-foreground">{isCash ? "Your referral earnings" : "Your referral reward"}</h2><p className="text-xs text-muted-foreground">{isCash ? `Earn ${money(data.settings.cashCommissionAmount)} per qualified referral. Minimum payout: ${money(data.settings.minimumPayoutAmount)}.` : `Earn ${data.settings.subscriptionRewardMonths} month${data.settings.subscriptionRewardMonths === 1 ? "" : "s"} of Sorana subscription credit per qualified referral.`}</p></div></div>
          {isCash ? <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-primary/10 p-4"><p className="text-xs text-muted-foreground">Available</p><p className="mt-1 text-2xl font-semibold text-foreground">{money(data.wallet.available)}</p></div><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Total earned</p><p className="mt-1 text-2xl font-semibold text-foreground">{money(data.wallet.totalEarned)}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="mt-1 font-semibold text-foreground">{money(data.wallet.pending)}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Paid out</p><p className="mt-1 font-semibold text-foreground">{money(data.wallet.paidOut)}</p></div></div> : <div className="mt-6 rounded-xl bg-primary/10 p-4 text-sm text-foreground">Subscription credits are recorded against your qualified referrals and remain on this account if you later start managing properties.</div>}
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><WalletCards className="text-primary" size={20} /><h2 className="font-semibold text-foreground">Payouts</h2></div>{isCash ? <><p className="mt-4 text-sm text-muted-foreground">Available: <span className="font-semibold text-foreground">{money(data.wallet.available)}</span></p><p className="mt-1 text-xs text-muted-foreground">Minimum payout: {money(data.settings.minimumPayoutAmount)}</p>{canPayout ? <button onClick={() => setShowPayout(true)} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Request payout</button> : <p className="mt-5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">You need {money(moreNeeded)} more to request a payout.</p>}</> : <p className="mt-4 text-sm text-muted-foreground">Your current reward mode is subscription credit. Cash payout options will appear when your account is configured for cash commissions.</p>}</section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold text-foreground">Referral history</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="pb-3">Customer</th><th className="pb-3">Status</th><th className="pb-3">Reward</th><th className="pb-3">Date</th></tr></thead><tbody>{data.referrals.length ? data.referrals.map((referral) => <tr key={referral._id} className="border-b border-border/70 last:border-0"><td className="py-3 font-medium text-foreground">{referral.referredUser}</td><td className="py-3 capitalize text-muted-foreground">{referral.status}</td><td className="py-3 text-foreground">{referral.commission ? `+ ${money(referral.commission.amount)}` : referral.subscriptionReward ? `+ ${referral.subscriptionReward.months} month` : "—"}</td><td className="py-3 text-muted-foreground">{new Date(referral.createdAt).toLocaleDateString("en-KE")}</td></tr>) : <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Start earning by sharing your link with property owners, landlords and property managers.</td></tr>}</tbody></table></div></section>

      {data.payouts.length > 0 && <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold text-foreground">Payout history</h2><div className="mt-4 space-y-3">{data.payouts.map((payout) => <div key={payout._id} className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-foreground">{money(payout.amount)} · {payout.method}</p><p className="text-xs text-muted-foreground">{payout.destinationMasked} · {new Date(payout.requestedAt).toLocaleDateString("en-KE")}</p></div><span className="text-xs font-semibold capitalize text-primary">{payout.status}</span></div>)}</div></section>}

      {showPayout && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={requestPayout} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"><h2 className="text-lg font-semibold text-foreground">Request payout</h2><p className="mt-1 text-xs text-muted-foreground">Funds are reserved while your payout is reviewed.</p><label className="mt-5 block text-xs font-medium text-muted-foreground">Amount (KSh)<input type="number" min={data.settings.minimumPayoutAmount} max={data.wallet.available} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" required /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Method<select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground"><option>M-Pesa</option><option>Bank</option></select></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="M-Pesa number or bank details" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" required /></label><div className="mt-6 flex gap-3"><button type="button" onClick={() => setShowPayout(false)} className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground">Cancel</button><button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Submit request</button></div></form></div>}
    </main></OwnerPageShell>
  );
}
