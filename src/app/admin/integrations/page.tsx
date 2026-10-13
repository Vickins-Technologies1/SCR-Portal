"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

export default function AdminIntegrationsPage() {
  const [provider, setProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [savedProvider, setSavedProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [csrf, setCsrf] = useState("");
  const [saving, setSaving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/csrf-token"), fetch("/api/admin/invoice-payment-provider")]).then(async ([csrfRes, providerRes]) => {
      const csrfData = await csrfRes.json(); const providerData = await providerRes.json();
      setCsrf(csrfData.csrfToken || "");
      if (providerData.provider === "daraja" || providerData.provider === "kopokopo") {
        setProvider(providerData.provider);
        setSavedProvider(providerData.provider);
      }
    }).catch(() => setMessage("Failed to load payment settings."));
  }, []);

  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/invoice-payment-provider", { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ provider }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Failed to save provider");
      if (data.provider !== "daraja" && data.provider !== "kopokopo") throw new Error("The server returned an invalid saved provider.");
      setProvider(data.provider);
      setSavedProvider(data.provider);
      setIsConfirmOpen(false);
      setMessage("Provider updated. Existing transactions were not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save provider."); } finally { setSaving(false); }
  };

  const providerLabel = (value: "kopokopo" | "daraja") => value === "daraja" ? "M-Pesa PayBill" : "Kopokopo";

  return <div className="min-h-[100svh] bg-transparent text-foreground"><Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} /><Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} /><div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8"><main className="max-w-7xl mx-auto space-y-6"><section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center"><Plug className="h-5 w-5 text-primary" /></div><div><p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p><h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1><p className="text-xs sm:text-sm text-muted-foreground">Control how My Accurate Rent receives Property Owner invoice payments.</p></div></div></section><section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><div><p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Property Owner Invoice Payments</p><h2 className="mt-2 text-lg font-semibold text-foreground">Receive payments via</h2><p className="mt-1 text-sm text-muted-foreground">This setting applies to new invoice payment attempts only. Property Owners cannot change it.</p></div></div><div className="mt-8 grid gap-4 sm:grid-cols-2">{(["kopokopo", "daraja"] as const).map((item) => <label key={item} className={`cursor-pointer rounded-2xl border p-5 transition-colors ${provider === item ? "border-primary bg-primary/5" : "border-border hover:bg-primary/5"}`}><input type="radio" name="provider" checked={provider === item} onChange={() => { setProvider(item); setMessage(""); }} className="mr-3" /><span className="font-semibold">{providerLabel(item)}</span><p className="mt-2 text-xs text-muted-foreground">{item === "daraja" ? "Use My Accurate Rent’s configured Daraja shortcode." : "Use the existing Kopokopo invoice flow."}</p></label>)}</div><p className="mt-4 text-xs text-muted-foreground">{provider === savedProvider ? "Saved configuration" : "Unsaved selection"}</p><button onClick={() => setIsConfirmOpen(true)} disabled={saving || provider === savedProvider} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Save provider</button>{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}</section></main></div>
    <Modal title="Confirm payment provider switch" isOpen={isConfirmOpen} onClose={() => { if (!saving) setIsConfirmOpen(false); }}>
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-lg font-semibold text-foreground">Switch to {providerLabel(provider)}?</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">New Property Owner invoice payment attempts will use this provider after the change is saved.</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current</p><p className="mt-1 text-sm font-medium text-foreground">{providerLabel(savedProvider)}</p></div>
          <span aria-hidden="true" className="text-lg text-muted-foreground">→</span>
          <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected</p><p className="mt-1 text-sm font-medium text-foreground">{providerLabel(provider)}</p></div>
        </div>
        <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">Existing pending and completed transactions will stay with their original provider.</p>
        {message && provider !== savedProvider && <p role="alert" className="text-sm text-red-600">{message}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setIsConfirmOpen(false)} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{saving ? "Saving…" : "Confirm switch"}</button>
        </div>
      </div>
    </Modal>
  </div>;
}
