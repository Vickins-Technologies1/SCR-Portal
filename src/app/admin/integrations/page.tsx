"use client";
import { useEffect, useState } from "react";

export default function AdminIntegrationsPage() {
  const [provider, setProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [csrf, setCsrf] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([fetch("/api/csrf-token"), fetch("/api/admin/invoice-payment-provider")]).then(async ([csrfRes, providerRes]) => {
      const csrfData = await csrfRes.json(); const providerData = await providerRes.json();
      setCsrf(csrfData.csrfToken || "");
      if (providerData.provider === "daraja" || providerData.provider === "kopokopo") setProvider(providerData.provider);
    }).catch(() => setMessage("Failed to load payment settings."));
  }, []);
  const save = async () => {
    if (!window.confirm(`Switch Property Owner invoice payments to ${provider === "daraja" ? "M-Pesa PayBill" : "Kopokopo"}? Existing transactions will not be modified.`)) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/invoice-payment-provider", { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ provider }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Failed to save provider");
      setMessage("Provider updated. Existing transactions were not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save provider."); } finally { setSaving(false); }
  };
  return <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8"><div className="surface-card rounded-3xl p-6 sm:p-8"><p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Admin · Integrations</p><h1 className="mt-2 text-2xl font-semibold text-foreground">Property Owner Invoice Payments</h1><p className="mt-2 text-sm text-muted-foreground">Choose how Sorana receives new invoice payments. Property owners cannot change this setting.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{(["kopokopo", "daraja"] as const).map((item) => <label key={item} className={`cursor-pointer rounded-2xl border p-5 ${provider === item ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="provider" checked={provider === item} onChange={() => setProvider(item)} className="mr-3" />{item === "daraja" ? "M-Pesa PayBill" : "Kopokopo"}<p className="mt-2 text-xs text-muted-foreground">{item === "daraja" ? "Use Sorana’s configured Daraja shortcode." : "Use the existing Kopokopo invoice flow."}</p></label>)}</div><button onClick={save} disabled={saving} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save provider"}</button>{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}</div></main>;
}
