"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plug, ShieldCheck, RefreshCw, QrCode, Send } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

type WhatsAppState = { enabled: boolean; gatewayUrl: string; sessionId: string; apiKeyConfigured: boolean; sessionStatus: string; lastCheckAt: string | null; lastCheckError: string | null };
type Attempt = { _id: string; recipientMasked?: string; type?: string; status?: string; errorCategory?: string; createdAt?: string };
const emptyState: WhatsAppState = { enabled: false, gatewayUrl: "", sessionId: "", apiKeyConfigured: false, sessionStatus: "unknown", lastCheckAt: null, lastCheckError: null };

export default function AdminIntegrationsPage() {
  const [provider, setProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [savedProvider, setSavedProvider] = useState<"kopokopo" | "daraja">("kopokopo");
  const [csrf, setCsrf] = useState("");
  const [saving, setSaving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [wa, setWa] = useState<WhatsAppState>(emptyState);
  const [apiKey, setApiKey] = useState("");
  const [phone, setPhone] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [connection, setConnection] = useState("Not checked");
  const [qr, setQr] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/csrf-token"), fetch("/api/admin/invoice-payment-provider"), fetch("/api/admin/whatsapp")]).then(async ([csrfRes, providerRes, waRes]) => {
      const csrfData = await csrfRes.json(); const providerData = await providerRes.json(); const waData = await waRes.json();
      setCsrf(csrfData.csrfToken || "");
      if (providerData.provider === "daraja" || providerData.provider === "kopokopo") { setProvider(providerData.provider); setSavedProvider(providerData.provider); }
      if (waData.success) { setWa(waData.settings); setAttempts(waData.attempts || []); setConnection(waData.settings.lastCheckAt ? `${waData.settings.lastCheckError ? "Gateway unavailable" : "Last known"} · session ${waData.settings.sessionStatus}` : "Not checked"); }
    }).catch(() => { setMessage("Failed to load integration settings."); setWaMessage("Failed to load WhatsApp settings."); });
  }, []);

  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/invoice-payment-provider", { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ provider }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Failed to save provider");
      if (data.provider !== "daraja" && data.provider !== "kopokopo") throw new Error("The server returned an invalid saved provider.");
      setProvider(data.provider); setSavedProvider(data.provider); setIsConfirmOpen(false); setMessage("Provider updated. Existing transactions were not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to save provider."); } finally { setSaving(false); }
  };

  const saveWhatsApp = async () => {
    setBusyAction("save"); setWaMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ ...wa, apiKey }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Unable to save WhatsApp settings");
      setWa(data.settings); setApiKey(""); setWaMessage("WhatsApp settings saved.");
    } catch (error) { setWaMessage(error instanceof Error ? error.message : "Unable to save WhatsApp settings"); } finally { setBusyAction(""); }
  };

  const action = async (name: "status" | "qr" | "test") => {
    setBusyAction(name); setWaMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ action: name, phone }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "WhatsApp operation failed");
      if (name === "status") { setConnection(`${data.gateway === "reachable" ? "Gateway reachable" : "Gateway unavailable"} · session ${data.session}`); setWa((value) => ({ ...value, lastCheckAt: data.lastCheckAt, lastCheckError: data.error })); }
      if (name === "qr") setQr(data.qrCode);
      if (name === "test") { setWaMessage(`Test attempt status: ${data.status}. A submitted status confirms gateway acceptance only, not delivery.`); fetch("/api/admin/whatsapp").then((r) => r.json()).then((result) => result.success && setAttempts(result.attempts || [])).catch(() => {}); }
    } catch (error) { setWaMessage(error instanceof Error ? error.message : "WhatsApp operation failed"); if (name === "status") setConnection("Unavailable"); }
    finally { setBusyAction(""); }
  };

  const providerLabel = (value: "kopokopo" | "daraja") => value === "daraja" ? "M-Pesa PayBill" : "Kopokopo";

  return <div className="min-h-[100svh] bg-transparent text-foreground"><Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} /><Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} /><div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8"><main className="max-w-7xl mx-auto space-y-6">
    <section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center"><Plug className="h-5 w-5 text-primary" /></div><div><p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p><h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1><p className="text-xs sm:text-sm text-muted-foreground">Configure payment and messaging providers.</p></div></div></section>
    <section className="glass-panel rounded-3xl p-6 sm:p-8"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><div><p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Property Owner Invoice Payments</p><h2 className="mt-2 text-lg font-semibold text-foreground">Receive payments via</h2><p className="mt-1 text-sm text-muted-foreground">This setting applies to new invoice payment attempts only. Property Owners cannot change it.</p></div></div><div className="mt-8 grid gap-4 sm:grid-cols-2">{(["kopokopo", "daraja"] as const).map((item) => <label key={item} className={`cursor-pointer rounded-2xl border p-5 transition-colors ${provider === item ? "border-primary bg-primary/5" : "border-border hover:bg-primary/5"}`}><input type="radio" name="provider" checked={provider === item} onChange={() => { setProvider(item); setMessage(""); }} className="mr-3" /><span className="font-semibold">{providerLabel(item)}</span><p className="mt-2 text-xs text-muted-foreground">{item === "daraja" ? "Use My Accurate Rent’s configured Daraja shortcode." : "Use the existing Kopokopo invoice flow."}</p></label>)}</div><p className="mt-4 text-xs text-muted-foreground">{provider === savedProvider ? "Saved configuration" : "Unsaved selection"}</p><button onClick={() => setIsConfirmOpen(true)} disabled={saving || provider === savedProvider} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Save provider</button>{message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}</section>
    <section className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5"><div><p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">WhatsApp · OpenWA</p><h2 className="mt-2 text-lg font-semibold">Messaging connection</h2><p className="mt-1 text-sm text-muted-foreground">OpenWA is an unofficial WhatsApp Web gateway. It is disabled by default. Never use it for unsolicited messaging.</p></div>
      <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={wa.enabled} onChange={(e) => setWa({ ...wa, enabled: e.target.checked })} /> Enable OpenWA for existing WhatsApp notifications</label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Gateway URL<input value={wa.gatewayUrl} onChange={(e) => setWa({ ...wa, gatewayUrl: e.target.value })} placeholder="https://whatsapp-gateway.example" className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label><label className="text-sm">OpenWA session ID<input value={wa.sessionId} onChange={(e) => setWa({ ...wa, sessionId: e.target.value })} placeholder="session-id" className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label><label className="text-sm sm:col-span-2">API key {wa.apiKeyConfigured && <span className="text-muted-foreground">(saved; leave blank to keep current key)</span>}<input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={wa.apiKeyConfigured ? "••••••••••••••••" : "OpenWA API key"} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label></div>
      <p className="text-xs text-muted-foreground">The API key is encrypted in MongoDB and never returned to this page. Set WHATSAPP_ENCRYPTION_KEY in the server environment. QR codes are sensitive and shown only to administrators.</p><button onClick={saveWhatsApp} disabled={busyAction !== ""} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busyAction === "save" ? "Saving…" : "Save WhatsApp settings"}</button>
      <div className="rounded-2xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Connection</p><p className="text-sm text-muted-foreground">{connection}{wa.lastCheckAt ? ` · checked ${new Date(wa.lastCheckAt).toLocaleString()}` : ""}</p>{wa.lastCheckError && <p className="mt-1 text-xs text-red-600">{wa.lastCheckError}</p>}</div><div className="flex gap-2"><button onClick={() => action("status")} disabled={busyAction !== ""} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"><RefreshCw size={15} /> Refresh status</button><button onClick={() => action("qr")} disabled={busyAction !== ""} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"><QrCode size={15} /> Get QR</button></div></div>{qr && <div className="mt-4"><p className="mb-2 text-xs text-muted-foreground">Scan promptly with the WhatsApp account owner. Keep this screen private.</p><Image unoptimized src={qr} alt="OpenWA WhatsApp session QR code" width={224} height={224} className="h-56 w-56 rounded-xl border bg-white p-2" /><button onClick={() => setQr("")} className="mt-2 text-xs underline">Hide QR</button></div>}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-sm">Test number you control<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547…" className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" /></label><button onClick={() => action("test")} disabled={!phone || busyAction !== ""} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm"><Send size={15} /> Send test</button></div><p className="text-xs text-muted-foreground">A test message is sent only when you click this button. The number must belong to you or an operator who has authorized this test.</p>{waMessage && <p role="status" className="text-sm text-muted-foreground">{waMessage}</p>}
      <div><h3 className="text-sm font-semibold">Recent attempts</h3><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Recipient</th><th className="py-2 pr-3">Status</th><th className="py-2">Details</th></tr></thead><tbody>{attempts.map((item) => <tr key={item._id} className="border-b border-border/60"><td className="py-2 pr-3">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</td><td className="py-2 pr-3">{item.type || "—"}</td><td className="py-2 pr-3">{item.recipientMasked || "—"}</td><td className="py-2 pr-3">{item.status || "—"}</td><td className="py-2">{item.errorCategory || "—"}</td></tr>)}{attempts.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">No OpenWA attempts recorded.</td></tr>}</tbody></table></div></div>
    </section></main></div>
    <Modal title="Confirm payment provider switch" isOpen={isConfirmOpen} onClose={() => { if (!saving) setIsConfirmOpen(false); }}><div className="space-y-5 p-5 sm:p-6"><div><p className="text-lg font-semibold text-foreground">Switch to {providerLabel(provider)}?</p><p className="mt-2 text-sm leading-6 text-muted-foreground">New Property Owner invoice payment attempts will use this provider after the change is saved.</p></div><div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current</p><p className="mt-1 text-sm font-medium text-foreground">{providerLabel(savedProvider)}</p></div><span aria-hidden="true" className="text-lg text-muted-foreground">→</span><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected</p><p className="mt-1 text-sm font-medium text-foreground">{providerLabel(provider)}</p></div></div><p className="rounded-xl bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">Existing pending and completed transactions will stay with their original provider.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setIsConfirmOpen(false)} disabled={saving} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{saving ? "Saving…" : "Confirm switch"}</button></div></div></Modal>
  </div>;
}
