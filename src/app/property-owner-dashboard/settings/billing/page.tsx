"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Cookies from "js-cookie";
import { AlertTriangle, Loader2 } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import Navbar from "../../components/Navbar";

type Settings = { invoicingEnabled: boolean; automaticGeneration: boolean; automaticIssuing: boolean; automaticSending: boolean; manualApproval: boolean; generationDay: number; defaultDueDay: number; eligiblePropertyIds: string[]; eligibleTenantIds: string[]; excludedTenantIds: string[]; invoicePrefix: string; invoiceBrandName: string; invoiceBrandColor: string; remindersEnabled: boolean; reminderBeforeDays: number; reminderOnDueDate: boolean; overdueReminderEveryDays: number };
type Tenant = { _id: string; name: string; propertyId: string; unit: string };
const defaults: Settings = { invoicingEnabled: false, automaticGeneration: false, automaticIssuing: false, automaticSending: false, manualApproval: true, generationDay: 1, defaultDueDay: 5, eligiblePropertyIds: [], eligibleTenantIds: [], excludedTenantIds: [], invoicePrefix: "R", invoiceBrandName: "My Accurate Rent", invoiceBrandColor: "#0a2b4f", remindersEnabled: false, reminderBeforeDays: 5, reminderOnDueDate: true, overdueReminderEveryDays: 7 };

export default function BillingSettingsPage() {
  const [settings, setSettings] = useState(defaults);
  const [properties, setProperties] = useState<Array<{_id:string;name:string}>>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tenant-invoices/settings", { credentials: "include", cache: "no-store" });
      let data: any;
      try { data = await response.json(); } catch { throw new Error(response.statusText || "Unable to load billing settings"); }
      if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to load billing settings");
      setSettings({ ...defaults, ...data.settings }); setProperties(data.properties || []); setTenants(data.tenants || []); setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load billing settings";
      setLoadError(message); toast.error(message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadSettings(); }, [loadSettings]);
  const toggle = (key: keyof Settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/tenant-invoices/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": Cookies.get("csrf-token") || "" }, body: JSON.stringify(settings) });
      let data: any;
      try { data = await response.json(); } catch { throw new Error(response.statusText || "Unable to save settings"); }
      if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to save settings");
      toast.success("Billing settings saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save settings"); }
    finally { setSaving(false); }
  };
  const check = (label: string, key: keyof Settings, description: string) => <label className="flex gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked={Boolean(settings[key])} onChange={() => toggle(key)} className="mt-1"/><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span></label>;
  const toaster = <Toaster position="top-right" toastOptions={{ duration: 4200, style: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "16px", boxShadow: "0 12px 36px rgba(0,0,0,.14)" } }} />;
  const shell = (children: ReactNode) => <div className="min-h-screen bg-background text-foreground">{toaster}<Navbar/><Sidebar/><div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8"><main className="max-w-7xl mx-auto space-y-6 overflow-y-auto transition-all duration-300">{children}</main></div></div>;
  if (loading) return shell(<div className="max-w-4xl space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Settings</p><h1 className="mt-1 text-2xl font-semibold">Billing & Invoicing</h1><p className="mt-1 text-sm text-muted-foreground">Loading your invoice and reminder preferences…</p></header><div role="status" aria-label="Loading billing settings" className="space-y-3 rounded-2xl border border-border bg-card p-5"><div className="h-5 w-44 animate-pulse rounded bg-muted"/>{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-muted/70"/>)}<span className="sr-only">Loading billing settings…</span></div></div>);
  if (loadError) return shell(<div className="max-w-4xl space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Settings</p><h1 className="mt-1 text-2xl font-semibold">Billing & Invoicing</h1></header><div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-8 text-center"><AlertTriangle className="mx-auto text-destructive" size={28}/><p className="mt-3 font-medium">Settings could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{loadError}</p><button type="button" onClick={() => void loadSettings()} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try again</button></div></div>);
  return shell(<form onSubmit={save} className="max-w-4xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Settings</p><h1 className="mt-1 text-2xl font-semibold">Billing & Invoicing</h1><p className="mt-1 text-sm text-muted-foreground">Control tenant invoices and rent reminders independently.</p></header>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Invoice generation</h2>{check("Enable tenant invoicing", "invoicingEnabled", "Allow rent invoices to be generated for your tenants.")}{check("Generate invoices automatically", "automaticGeneration", "Generate monthly rent drafts on the configured day.")}{check("Issue generated invoices automatically", "automaticIssuing", "Issue generated invoices when the approval setting permits it.")}{check("Send issued invoices automatically", "automaticSending", "Email invoice PDFs to tenants after automatic issue.")}{check("Require manual approval", "manualApproval", "Keep automatic invoices as drafts until a manager issues them.")}
      <div className="grid gap-4 pt-2 sm:grid-cols-2"><label className="text-sm">Generate on day<input type="number" min={1} max={28} value={settings.generationDay} onChange={(e) => setSettings({ ...settings, generationDay: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2"/></label><label className="text-sm">Default due day<input type="number" min={1} max={28} value={settings.defaultDueDay} onChange={(e) => setSettings({ ...settings, defaultDueDay: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div>
    </section>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Eligible properties</h2><p className="text-xs text-muted-foreground">Leave all unchecked to include every property you manage.</p>{properties.map((property) => <label key={property._id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.eligiblePropertyIds.includes(property._id)} onChange={(e) => setSettings({ ...settings, eligiblePropertyIds: e.target.checked ? [...settings.eligiblePropertyIds, property._id] : settings.eligiblePropertyIds.filter((id) => id !== property._id) })}/>{property.name}</label>)}</section>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Eligible tenants</h2><p className="text-xs text-muted-foreground">Leave all unchecked to include every eligible tenant; exclusions below always take priority.</p>{tenants.map((tenant) => <label key={tenant._id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.eligibleTenantIds.includes(tenant._id)} onChange={(e) => setSettings({ ...settings, eligibleTenantIds: e.target.checked ? [...settings.eligibleTenantIds, tenant._id] : settings.eligibleTenantIds.filter((id) => id !== tenant._id) })}/>{tenant.name} · {properties.find((property) => property._id === tenant.propertyId)?.name || "Property"} {tenant.unit}</label>)}</section>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Excluded tenants</h2><p className="text-xs text-muted-foreground">Selected tenants will be skipped by automatic and bulk monthly invoice generation.</p>{tenants.map((tenant) => <label key={tenant._id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.excludedTenantIds.includes(tenant._id)} onChange={(e) => setSettings({ ...settings, excludedTenantIds: e.target.checked ? [...settings.excludedTenantIds, tenant._id] : settings.excludedTenantIds.filter((id) => id !== tenant._id) })}/>{tenant.name} · {properties.find((property) => property._id === tenant.propertyId)?.name || "Property"} {tenant.unit}</label>)}</section>
    <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3"><h2 className="sm:col-span-3 font-semibold">Invoice branding and numbering</h2><label className="text-sm">Brand name<input maxLength={80} value={settings.invoiceBrandName} onChange={(e) => setSettings({ ...settings, invoiceBrandName: e.target.value })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2"/></label><label className="text-sm">Invoice number prefix<input maxLength={21} value={settings.invoicePrefix} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value.toUpperCase() })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2" placeholder="RENT"/></label><label className="text-sm">Brand color<input type="color" value={settings.invoiceBrandColor} onChange={(e) => setSettings({ ...settings, invoiceBrandColor: e.target.value })} className="mt-1 block h-10 w-full rounded-xl border border-border bg-background p-1"/></label></section>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Reminders</h2>{check("Enable invoice reminders", "remindersEnabled", "This setting is separate from your existing rent reminder preferences.")}{check("Send reminder on due date", "reminderOnDueDate", "Reminders stop when invoice balances are settled.")}<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Days before due date<input type="number" min={0} max={30} value={settings.reminderBeforeDays} onChange={(e) => setSettings({ ...settings, reminderBeforeDays: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2"/></label><label className="text-sm">Overdue interval (days)<input type="number" min={1} max={60} value={settings.overdueReminderEveryDays} onChange={(e) => setSettings({ ...settings, overdueReminderEveryDays: Number(e.target.value) })} className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2"/></label></div></section>
    <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <><Loader2 size={16} className="animate-spin"/>Saving…</> : "Save billing settings"}</button>
  </form>);
}
