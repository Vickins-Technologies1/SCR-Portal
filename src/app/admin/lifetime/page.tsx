"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import AdminPageShell from "../components/AdminPageShell";

type Tier = { id?: string; minUnits: number; maxUnits: number | null; price: number; currency: string; active: boolean };
type Pricing = { minimumUnits: number; maximumUnits: number | null; currency: string; tiers: Tier[]; warnings?: string[] };
type AdminData = {
  plan: { active: boolean; currency: string; pricing: Pricing };
  entitlements: Array<{ _id: string; status: string; ownerId: string; owner?: { email?: string } | null }>;
  transactions: Array<{ _id: string; status: string; ownerId: string; owner?: { email?: string } | null; amount?: number; currency?: string; purchasedUnits?: number; pricingSnapshot?: { tier?: { minUnits?: number; maxUnits?: number | null } }; providerReference?: string; mpesaCode?: string; createdAt?: string }>;
};
type Quote = { units: number; amount: number; currency: string; tier: { minUnits: number; maxUnits: number | null } };

const money = (amount: number, currency = "KES") => `${currency} ${Number(amount || 0).toLocaleString("en-KE")}`;
const blankTier = (currency: string): Tier => ({ id: `tier-${Date.now()}-${Math.random().toString(36).slice(2)}`, minUnits: 1, maxUnits: 10, price: 0, currency, active: true });

export default function LifetimeAdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [active, setActive] = useState(true);
  const [pricing, setPricing] = useState<Pricing>({ minimumUnits: 1, maximumUnits: null, currency: "KES", tiers: [] });
  const [previewUnits, setPreviewUnits] = useState(1);
  const [preview, setPreview] = useState<Quote | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { ensureCsrf } = useCsrfToken();

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/lifetime", { credentials: "include" });
      const next = await response.json().catch(() => ({}));
      if (!response.ok || !next.success) throw new Error(next.message || "Unable to load Lifetime settings.");
      setData(next);
      setActive(Boolean(next.plan.active));
      const nextPricing = next.plan.pricing || { minimumUnits: 1, maximumUnits: null, currency: next.plan.currency || "KES", tiers: [] };
      setPricing(nextPricing);
      setPreviewUnits(nextPricing.minimumUnits || 1);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unable to load Lifetime settings.");
    } finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const calculatePreview = async () => {
    setPreviewMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/lifetime/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ units: previewUnits }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "No price is available for this unit count.");
      setPreview(result);
    } catch (error) { setPreviewMessage(error instanceof Error ? error.message : "Unable to calculate price."); }
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setMessage("");
    try {
      const csrfToken = await ensureCsrf();
      if (!csrfToken) throw new Error("Security token missing. Please refresh and try again.");
      const response = await fetch("/api/admin/lifetime", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ active, pricing }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || `Unable to save settings (${response.status}).`);
      setMessageType("success");
      setMessage(result.warnings?.length ? `Lifetime pricing saved. ${result.warnings[0]}` : "Lifetime pricing saved successfully.");
      await load();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unable to save Lifetime settings. Please try again.");
    } finally { setIsSaving(false); }
  };

  const updateTier = (index: number, update: Partial<Tier>) => setPricing((current) => ({ ...current, tiers: current.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...update } : tier) }));
  const successfulPayments = data?.transactions.filter((item) => ["paid", "completed"].includes(item.status)) || [];
  const revenue = successfulPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return <AdminPageShell>
    <main className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6"><p className="text-xs uppercase tracking-[.28em] text-primary">One-time revenue</p><h1 className="mt-2 text-2xl font-semibold">Lifetime package</h1><p className="mt-2 text-sm text-muted-foreground">Configure unit-based pricing, inspect purchases, and manage authorized access changes.</p></section>
      <section className="grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Lifetime customers</p><p className="mt-2 text-3xl font-semibold">{data?.entitlements.filter((item) => item.status === "active").length ?? "—"}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Successful one-time payments</p><p className="mt-2 text-3xl font-semibold">{data ? successfulPayments.length : "—"}</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Gross Lifetime revenue</p><p className="mt-2 text-3xl font-semibold">{data ? money(revenue, data.plan.currency) : "—"}</p></div></section>
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold">Lifetime pricing calculator</h2><p className="mt-1 text-sm text-muted-foreground">Customers pay according to the number of units they purchase capacity for.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Lifetime checkout active</label></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3"><label className="text-sm">Minimum units<input type="number" min="0" step="1" value={pricing.minimumUnits} onChange={(event) => setPricing((current) => ({ ...current, minimumUnits: Number(event.target.value) }))} className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label><label className="text-sm">Maximum self-service units<input type="number" min="1" step="1" placeholder="No maximum" value={pricing.maximumUnits ?? ""} onChange={(event) => setPricing((current) => ({ ...current, maximumUnits: event.target.value === "" ? null : Number(event.target.value) }))} className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label><label className="text-sm">Currency<input value={pricing.currency} maxLength={3} onChange={(event) => setPricing((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2 uppercase" /></label></div>
        <div className="mt-8 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Unit pricing tiers</h3><p className="mt-1 text-xs text-muted-foreground">Active tiers cannot overlap. Gaps are warned about and cannot be used for checkout.</p></div><button type="button" onClick={() => setPricing((current) => ({ ...current, tiers: [...current.tiers, blankTier(current.currency)] }))} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"><Plus size={15} />Add tier</button></div>
        <div className="mt-4 space-y-3">{pricing.tiers.length ? pricing.tiers.map((tier, index) => <div key={tier.id || index} className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_1fr_1.2fr_1fr_auto_auto] sm:items-end"><label className="text-xs text-muted-foreground">Min units<input type="number" min="0" step="1" value={tier.minUnits} onChange={(event) => updateTier(index, { minUnits: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Max units<input type="number" min="1" step="1" placeholder="No max" value={tier.maxUnits ?? ""} onChange={(event) => updateTier(index, { maxUnits: event.target.value === "" ? null : Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Price<input type="number" min="0" step="1" value={tier.price} onChange={(event) => updateTier(index, { price: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Currency<input value={tier.currency} maxLength={3} onChange={(event) => updateTier(index, { currency: event.target.value.toUpperCase() })} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm uppercase text-foreground" /></label><label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground"><input type="checkbox" checked={tier.active} onChange={(event) => updateTier(index, { active: event.target.checked })} />Active</label><button type="button" aria-label="Delete pricing tier" onClick={() => setPricing((current) => ({ ...current, tiers: current.tiers.filter((_, tierIndex) => tierIndex !== index) }))} className="mb-1 inline-flex h-9 items-center justify-center rounded-lg border border-destructive/30 px-3 text-destructive hover:bg-destructive/5"><Trash2 size={15} /></button></div>) : <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No pricing tiers configured. Add a tier before enabling Lifetime checkout.</p>}</div>
        <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">Test Lifetime price</h3><p className="mt-1 text-xs text-muted-foreground">Uses the same backend calculator as customer checkout.</p></div><label className="text-xs font-semibold text-muted-foreground">Number of units<input type="number" min="0" step="1" value={previewUnits} onChange={(event) => setPreviewUnits(Number(event.target.value) || 0)} className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-40" /></label><button type="button" onClick={calculatePreview} className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-primary/40">Calculate</button></div>{preview && <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Calculated price</p><p className="mt-1 text-xl font-semibold">{money(preview.amount, preview.currency)}</p></div><div><p className="text-xs text-muted-foreground">Applicable tier</p><p className="mt-1 font-semibold">{preview.tier.minUnits}–{preview.tier.maxUnits ?? "∞"} units</p></div><div><p className="text-xs text-muted-foreground">Units</p><p className="mt-1 font-semibold">{preview.units}</p></div></div>}{previewMessage && <p className="mt-4 text-sm text-destructive">{previewMessage}</p>}</div>
        {pricing.warnings?.map((warning) => <p key={warning} className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700">{warning}</p>)}
        {message && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${messageType === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-foreground"}`}>{message}</p>}
        <button type="button" onClick={save} disabled={isSaving || isLoading} className="mt-6 inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{isSaving && <Loader2 size={16} className="animate-spin" />}{isSaving ? "Saving pricing…" : "Save pricing configuration"}</button>
      </section>
      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Lifetime transactions</h2><table className="mt-4 w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3">Owner</th><th>Units</th><th>Tier</th><th>Amount</th><th>Status</th><th>Provider reference</th><th>Created</th></tr></thead><tbody>{(data?.transactions || []).map((item) => <tr key={item._id} className="border-b border-border/60"><td className="py-3">{item.owner?.email || item.ownerId}</td><td>{item.purchasedUnits || "—"}</td><td>{item.pricingSnapshot?.tier ? `${item.pricingSnapshot.tier.minUnits}–${item.pricingSnapshot.tier.maxUnits ?? "∞"}` : "—"}</td><td>{money(Number(item.amount || 0), item.currency || "KES")}</td><td>{item.status}</td><td className="font-mono text-xs">{item.providerReference || item.mpesaCode || "—"}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-KE") : "—"}</td></tr>)}</tbody></table></section>
    </main>
  </AdminPageShell>;
}
