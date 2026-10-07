"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

type Owner = { _id: string; name: string; email: string; accountStatus?: string };
type History = { _id: string; ownerId: string; title?: string; message: string; createdAt: string; status: string };

export default function AdminCommunicationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<History[]>([]);
  const [percentage, setPercentage] = useState(1);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const csrf = async () => { const response = await fetch("/api/csrf-token"); const data = await response.json(); return data.csrfToken || ""; };
  const load = async () => {
    const [ownerResponse, historyResponse, settingResponse] = await Promise.all([
      fetch("/api/admin/property-owners?limit=100"), fetch("/api/admin/owner-notifications"), fetch("/api/admin/settings"),
    ]);
    const ownerData = await ownerResponse.json(); const historyData = await historyResponse.json(); const settingData = await settingResponse.json();
    setOwners(ownerData.propertyOwners || []); setHistory(historyData.history || []); setPercentage(Number(settingData.softwareLeasingPercentage ?? 1));
  };
  useEffect(() => { void load(); }, []);
  const send = async () => {
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/owner-notifications", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": await csrf() }, body: JSON.stringify({ title, message, all, recipientIds: selected }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setNotice(`Sent to ${data.count} property owner${data.count === 1 ? "" : "s"}.`); setTitle(""); setMessage(""); setSelected([]); setAll(false); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to send notification"); } finally { setBusy(false); }
  };
  const savePercentage = async () => {
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json", "x-csrf-token": await csrf() }, body: JSON.stringify({ softwareLeasingPercentage: percentage, reason }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setPercentage(data.softwareLeasingPercentage); setNotice("Software leasing percentage updated. Future calculations use the new value; existing invoice percentages remain unchanged."); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save setting"); } finally { setBusy(false); }
  };
  return <div className="min-h-screen bg-background"><Navbar isSidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} /><Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} /><main className="px-4 pb-12 pt-24 md:ml-72 md:px-8"><div className="mx-auto max-w-6xl"><h1 className="text-2xl font-semibold text-foreground">Owner communications & settings</h1>{notice && <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">{notice}</p>}<div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">Send a custom notification</h2><p className="mt-1 text-xs text-muted-foreground">Messages appear in the existing PropertyOwner notification center.</p><input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title" className="mt-5 w-full rounded-md border border-border bg-background p-3 text-sm" /><textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} placeholder="Message" rows={5} className="mt-3 w-full rounded-md border border-border bg-background p-3 text-sm" /><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> All property owners</label>{!all && <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-md border border-border p-3">{owners.map(owner => <label key={owner._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(owner._id)} onChange={e => setSelected(current => e.target.checked ? [...current, owner._id] : current.filter(id => id !== owner._id))} /> <span>{owner.name}</span><span className="text-xs text-muted-foreground">{owner.email}</span></label>)}</div>}<button disabled={busy || !title.trim() || !message.trim() || (!all && selected.length === 0)} onClick={send} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send notification</button></section><section className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">Software leasing percentage</h2><p className="mt-1 text-xs text-muted-foreground">Current value applies to future software leasing invoices. Historical invoice percentages are preserved.</p><div className="mt-5 flex items-center gap-3"><input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => setPercentage(Number(e.target.value))} className="w-32 rounded-md border border-border bg-background p-3 text-sm" /><span>%</span></div><input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Optional change reason" className="mt-3 w-full rounded-md border border-border bg-background p-3 text-sm" /><button disabled={busy || !Number.isFinite(percentage) || percentage < 0 || percentage > 100} onClick={savePercentage} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save percentage</button><h3 className="mt-8 font-semibold">Notification history</h3><div className="mt-3 max-h-64 space-y-2 overflow-auto">{history.map(item => <div key={item._id} className="rounded-lg border border-border p-3 text-xs"><div className="font-semibold">{item.title || "Admin notification"} · {item.status === "read" ? "Read" : "Sent"}</div><div className="mt-1 text-muted-foreground">{item.message}</div><div className="mt-1 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div>)}</div></section></div></div></main></div>;
}
