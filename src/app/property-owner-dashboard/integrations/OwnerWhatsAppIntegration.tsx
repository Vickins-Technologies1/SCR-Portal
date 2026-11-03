"use client";

import { useEffect, useState } from "react";
import { Loader2, QrCode, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

type WhatsAppIntegration = {
  connected: boolean;
  enabled: boolean;
  status: string;
  phone: string | null;
  connectedAt: string | null;
};

const empty: WhatsAppIntegration = { connected: false, enabled: false, status: "not_connected", phone: null, connectedAt: null };

export default function OwnerWhatsAppIntegration({ canManage }: { canManage: boolean }) {
  const [integration, setIntegration] = useState(empty);
  const [qrCode, setQrCode] = useState("");
  const [csrf, setCsrf] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = async () => {
    const response = await fetch("/api/owner/whatsapp", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Unable to read WhatsApp status");
    setIntegration(data.integration || empty);
  };

  useEffect(() => {
    fetch("/api/csrf-token", { credentials: "include" }).then((response) => response.json()).then((data) => {
      if (data.success && data.csrfToken) setCsrf(data.csrfToken);
    }).catch(() => {});
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (!qrCode) return;
    const timer = window.setInterval(() => refresh().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [qrCode]);

  const act = async (action: string, values: Record<string, unknown> = {}) => {
    if (!csrf) { toast.error("Refresh the page and try again."); return; }
    setBusy(action);
    try {
      const response = await fetch("/api/owner/whatsapp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ action, ...values }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "WhatsApp operation failed");
      if (data.integration) setIntegration(data.integration);
      if (data.qrCode) setQrCode(data.qrCode);
      if (action === "connect") toast.success("Scan the QR promptly with the WhatsApp account you want to use for your tenants.");
      if (action === "enabled") toast.success(values.enabled ? "WhatsApp tenant notifications enabled." : "WhatsApp tenant notifications paused.");
      if (action === "disconnect") { setQrCode(""); toast.success("WhatsApp account disconnected."); }
      if (action === "status" && data.integration?.connected) setQrCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "WhatsApp operation failed");
      refresh().catch(() => {});
    } finally {
      setBusy("");
    }
  };

  const connect = () => act(integration.status === "not_connected" ? "connect" : "qr");
  const statusLabel = integration.status.replaceAll("_", " ");

  return (
    <section className="surface-card rounded-3xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Tenant messaging</p>
          <h2 className="mt-1 text-lg font-semibold">Your WhatsApp account</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Connect the WhatsApp account you want tenants to see when they receive your rent reminders and other notifications. Each property owner uses a separate account.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integration.connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {integration.enabled ? "Sending enabled" : integration.connected ? "Connected · paused" : statusLabel}
        </span>
      </div>

      {!canManage && <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Only the property owner can connect or disconnect this WhatsApp account.</p>}

      <div className="flex flex-wrap items-center gap-3">
        {!integration.connected && (
          <button type="button" onClick={connect} disabled={!canManage || !!busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : integration.status === "not_connected" ? <Smartphone size={16} /> : <QrCode size={16} />}
            {integration.status === "not_connected" ? "Connect WhatsApp" : "Show pairing QR"}
          </button>
        )}
        {integration.connected && (
          <>
            <button type="button" onClick={() => act("status")} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-60"><RefreshCw size={15} /> Refresh status</button>
            <button type="button" onClick={() => act("enabled", { enabled: !integration.enabled })} disabled={!canManage || !!busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{integration.enabled ? "Pause tenant notifications" : "Enable tenant notifications"}</button>
          </>
        )}
        {integration.status !== "not_connected" && <button type="button" onClick={() => { if (window.confirm("Disconnect this WhatsApp account and stop its queued notifications?")) act("disconnect"); }} disabled={!canManage || !!busy} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 disabled:opacity-60"><Trash2 size={15} /> Disconnect</button>}
      </div>

      {integration.phone && <p className="text-xs text-muted-foreground">Linked WhatsApp number: {integration.phone}</p>}
      {qrCode && !integration.connected && <div className="rounded-2xl border border-border bg-white p-4">
        <p className="mb-3 text-sm font-medium">On your phone, open WhatsApp → Settings → Linked Devices → Link a device, then scan this QR.</p>
        <img src={qrCode} alt="WhatsApp account pairing QR" className="h-56 w-56 rounded-xl border bg-white p-2" />
        <button type="button" onClick={() => act("qr")} disabled={!!busy} className="mt-3 inline-flex items-center gap-2 text-xs font-medium underline"><RefreshCw size={13} /> Refresh QR</button>
        <p className="mt-2 text-xs text-muted-foreground">Keep the QR private and scan it promptly. WhatsApp can unlink unofficial integrations; connect only an account you control.</p>
      </div>}
    </section>
  );
}
