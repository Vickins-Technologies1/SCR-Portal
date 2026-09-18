"use client";

import { useEffect, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";

type AdminData = {
  settings: { attributionDays: number; subscriptionRewardMonths: number; cashCommissionAmount: number; minimumPayoutAmount: number; requirePaidSubscription: boolean };
  referrals: Array<{ _id: string; status: string; referredUserId: string; referrerUserId: string; referrer?: { name?: string; email?: string } }>;
  payouts: Array<{ _id: string; amount: number; method: string; destinationMasked: string; status: string; requestedAt: string; user?: { name?: string; email?: string }; reference?: string }>;
};

const money = (value: number) => `KSh ${Number(value || 0).toLocaleString("en-KE")}`;

export default function AdminReferralsPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/referrals", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load referral administration");
    setData(payload);
  };

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load referral administration")); }, []);

  const updatePayout = async (id: string, status: string) => {
    const response = await fetch(`/api/admin/referrals/payouts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to update payout");
    await load();
  };

  if (error) return <AdminPageShell><main className="mx-auto min-h-screen max-w-7xl p-4 text-destructive sm:p-6">{error}</main></AdminPageShell>;
  if (!data) return <AdminPageShell><main className="mx-auto min-h-screen max-w-7xl p-4 text-muted-foreground sm:p-6">Loading referrals…</main></AdminPageShell>;

  return <AdminPageShell><main className="mx-auto min-h-screen max-w-7xl space-y-6">
    <div><p className="text-[10px] uppercase tracking-[0.28em] text-primary">Admin console</p><h1 className="mt-2 text-2xl font-semibold text-foreground">Referrals & payouts</h1><p className="mt-1 text-sm text-muted-foreground">Review attribution, commissions, and cash payout requests inside Sorana.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Pending payouts</p><p className="mt-2 text-2xl font-semibold text-foreground">{data.payouts.filter((payout) => ["requested", "processing"].includes(payout.status)).length}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Pending value</p><p className="mt-2 text-2xl font-semibold text-foreground">{money(data.payouts.filter((payout) => ["requested", "processing"].includes(payout.status)).reduce((sum, payout) => sum + payout.amount, 0))}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Default minimum payout</p><p className="mt-2 text-2xl font-semibold text-foreground">{money(data.settings.minimumPayoutAmount)}</p></div></div>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold text-foreground">Payout queue</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="pb-3">User</th><th className="pb-3">Amount</th><th className="pb-3">Method</th><th className="pb-3">Status</th><th className="pb-3">Requested</th><th className="pb-3">Action</th></tr></thead><tbody>{data.payouts.length ? data.payouts.map((payout) => <tr key={payout._id} className="border-b border-border/70 last:border-0"><td className="py-3"><p className="font-medium text-foreground">{payout.user?.name || "Unknown user"}</p><p className="text-xs text-muted-foreground">{payout.user?.email || "—"}</p></td><td className="py-3 font-semibold text-foreground">{money(payout.amount)}</td><td className="py-3 text-muted-foreground">{payout.method}<br /><span className="text-xs">{payout.destinationMasked}</span></td><td className="py-3 capitalize text-primary">{payout.status}</td><td className="py-3 text-muted-foreground">{new Date(payout.requestedAt).toLocaleDateString("en-KE")}</td><td className="py-3"><div className="flex gap-2">{payout.status === "requested" && <button onClick={() => updatePayout(payout._id, "processing")} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">Process</button>}{["requested", "processing"].includes(payout.status) && <><button onClick={() => updatePayout(payout._id, "paid")} className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Mark paid</button><button onClick={() => updatePayout(payout._id, "failed")} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600">Fail</button></>}</div></td></tr>) : <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No payout requests yet.</td></tr>}</tbody></table></div></section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="font-semibold text-foreground">Referral activity</h2><div className="mt-4 space-y-2">{data.referrals.slice(0, 30).map((referral) => <div key={referral._id} className="flex flex-col gap-1 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-foreground">{referral.referrer?.name || referral.referrer?.email || referral.referrerUserId}</p><p className="text-xs text-muted-foreground">Referred account: {referral.referredUserId}</p></div><span className="text-xs font-semibold capitalize text-primary">{referral.status}</span></div>)}</div></section>
  </main></AdminPageShell>;
}
