"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

export default function AdminIntegrationsPage() {
  const [provider, setProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [csrf, setCsrf] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  return <div className="min-h-[100svh] bg-transparent text-foreground"><Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} /><Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} /><div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8"><main className="max-w-7xl mx-auto space-y-6"><section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center"><Plug className="h-5 w-5 text-primary" /></div><div><p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p><h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1><p className="text-xs sm:text-sm text-muted-foreground">Control how Sorana receives Property Owner invoice payments.</p></div></div></section><section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><div><p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Property Owner Invoice Payments</p><h2 className="mt-2 text-lg font-semibold text-foreground">Receive payments via</h2><p className="mt-1 text-sm text-muted-foreground">This setting applies to new invoice payment attempts only. Property Owners cannot change it.</p></div></div><div className="mt-8 grid gap-4 sm:grid-cols-2">{(["kopokopo", "daraja"] as const).map((item) => <label key={item} className={`cursor-pointer rounded-2xl border p-5 transition-colors ${provider === item ? "border-primary bg-primary/5" : "border-border hover:bg-primary/5"}`}><input type="radio" name="provider" checked={provider === item} onChange={() => setProvider(item)} className="mr-3" /><span className="font-semibold">{item === "daraja" ? "M-Pesa PayBill" : "Kopokopo"}</span><p className="mt-2 text-xs text-muted-foreground">{item === "daraja" ? "Use Sorana’s configured Daraja shortcode." : "Use the existing Kopokopo invoice flow."}</p></label>)}</div><button onClick={save} disabled={saving} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save provider"}</button>{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}</section></main></div></div>;
}
