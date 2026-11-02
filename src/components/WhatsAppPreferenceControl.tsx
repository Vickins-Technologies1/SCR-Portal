"use client";

import { useEffect, useState } from "react";

export default function WhatsAppPreferenceControl({ disabled = false }: { disabled?: boolean }) {
  const [csrf, setCsrf] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const csrfResponse = await fetch("/api/csrf-token", { credentials: "include" });
        const csrfData = await csrfResponse.json();
        if (!csrfResponse.ok || !csrfData.csrfToken) throw new Error("Unable to load security token");
        const response = await fetch("/api/whatsapp-preferences", { credentials: "include" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load WhatsApp preference");
        if (!cancelled) { setCsrf(csrfData.csrfToken); setEnabled(data.enabled === true); }
      } catch (value) {
        if (!cancelled) setError(value instanceof Error ? value.message : "Unable to load WhatsApp preference");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = async (next: boolean) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/whatsapp-preferences", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ enabled: next }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to update preference");
      setEnabled(data.enabled === true);
      setNotice(next ? "WhatsApp notifications enabled." : "WhatsApp notifications turned off.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to update preference"); }
    finally { setSaving(false); }
  };

  return <section className="rounded-2xl border border-border bg-card/70 p-5 space-y-3" aria-labelledby="whatsapp-preference-title">
    <div><h2 id="whatsapp-preference-title" className="font-semibold text-foreground">WhatsApp notifications</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Choose whether to receive account and tenancy updates on the phone number saved to your profile. You can change this at any time.</p></div>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={loading || saving || disabled || !csrf} onChange={(event) => void update(event.target.checked)} className="h-4 w-4 accent-primary" /> Receive WhatsApp notifications</label>
    {loading && <p className="text-xs text-muted-foreground">Loading preference…</p>}
    {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </section>;
}
