"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Sparkles, UserRound, Users, X } from "lucide-react";
import Modal from "../components/Modal";

export interface ComposerTenant {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  propertyId: string;
  propertyName?: string;
  unitType?: string;
  unitIdentifier?: string;
  houseNumber?: string;
  leasedUnits?: Array<{ unitIdentifier?: string; unitType?: string; houseNumber?: string }>;
}

export type NotificationCategory = "announcement" | "rent_reminder" | "payment_update" | "maintenance" | "important" | "emergency" | "other";
export type NotificationDeliveryMethod = "app" | "sms" | "email" | "whatsapp" | "both";

export interface NotificationDraft {
  title: string;
  message: string;
  category: NotificationCategory;
  type: "maintenance" | "tenant" | "other";
  deliveryMethod: NotificationDeliveryMethod;
  tenantIds: string[];
}

interface Props {
  isOpen: boolean;
  tenants: ComposerTenant[];
  isSending: boolean;
  onClose: () => void;
  onSubmit: (draft: NotificationDraft) => Promise<{ failedIds: string[]; errorMessage?: string }>;
}

type RecipientMode = "all" | "selected" | "individual";

const categories: Array<{ value: NotificationCategory; label: string; type: NotificationDraft["type"] }> = [
  { value: "announcement", label: "General announcement", type: "other" },
  { value: "rent_reminder", label: "Rent reminder", type: "tenant" },
  { value: "payment_update", label: "Payment update", type: "other" },
  { value: "maintenance", label: "Maintenance notice", type: "maintenance" },
  { value: "important", label: "Important information", type: "other" },
  { value: "emergency", label: "Emergency notice", type: "other" },
  { value: "other", label: "Other", type: "other" },
];

const templates: Array<{ label: string; category: NotificationCategory; title: string; message: string }> = [
  { label: "Rent payment reminder", category: "rent_reminder", title: "Rent payment reminder", message: "Hello, this is a friendly reminder to arrange your rent payment. If you have already paid, please disregard this message." },
  { label: "Water supply interruption", category: "maintenance", title: "Water supply interruption", message: "Please note that water service will be interrupted on [date] from [time] to [time] while maintenance is carried out. We apologize for the inconvenience." },
  { label: "Electricity maintenance", category: "maintenance", title: "Scheduled electrical maintenance", message: "Electrical maintenance is scheduled for [date] between [time] and [time]. Please plan accordingly and contact us if you have any concerns." },
  { label: "Property inspection", category: "important", title: "Scheduled property inspection", message: "A property inspection is planned for [date] at [time]. Please let us know if you need to arrange another suitable time." },
  { label: "General announcement", category: "announcement", title: "Property announcement", message: "Hello, we would like to share an update about [topic]. [Add the details tenants need to know.]" },
  { label: "Security advisory", category: "emergency", title: "Security advisory", message: "Please be aware of [security concern]. Keep doors and gates secured and contact [contact details] if you notice anything concerning." },
];

function getUnitLabel(tenant: ComposerTenant) {
  const units = Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0
    ? tenant.leasedUnits.map((unit) => unit.houseNumber || unit.unitIdentifier || unit.unitType).filter(Boolean)
    : [tenant.houseNumber || tenant.unitIdentifier || tenant.unitType].filter(Boolean);
  return units.join(", ") || "Unit not listed";
}

export default function NotificationComposerModal({ isOpen, tenants, isSending, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<RecipientMode>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("announcement");
  const [deliveryMethod, setDeliveryMethod] = useState<NotificationDeliveryMethod>("app");
  const [template, setTemplate] = useState("");
  const [formError, setFormError] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode("all");
    setSelectedIds([]);
    setSearch("");
    setTitle("");
    setMessage("");
    setCategory("announcement");
    setDeliveryMethod("app");
    setTemplate("");
    setFormError("");
  }, [isOpen]);

  const activeCategory = categories.find((option) => option.value === category) || categories[0];
  const filteredTenants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return tenants;
    return tenants.filter((tenant) => [tenant.name, tenant.phone, tenant.email, tenant.propertyName, tenant.propertyId, getUnitLabel(tenant)]
      .some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [search, tenants]);
  const recipientCount = mode === "all" ? tenants.length : mode === "individual" ? (selectedIds.length ? 1 : 0) : selectedIds.length;
  const readyToSend = recipientCount > 0 && title.trim().length > 0 && message.trim().length > 0 && !isSending;

  const toggleTenant = (tenantId: string) => {
    setSelectedIds((current) => mode === "individual"
      ? current.includes(tenantId) ? [] : [tenantId]
      : current.includes(tenantId) ? current.filter((id) => id !== tenantId) : [...current, tenantId]);
  };

  const handleSubmit = async () => {
    if (isSending || submittingRef.current) return;
    setFormError("");
    if (!title.trim() || !message.trim()) {
      setFormError("Add a title and message before sending.");
      return;
    }
    if (recipientCount === 0) {
      setFormError("Choose at least one active tenant.");
      return;
    }
    if (recipientCount >= 20 && !window.confirm(`Send this notification to ${recipientCount} tenants?`)) return;

    submittingRef.current = true;
    try {
      const result = await onSubmit({
        title: title.trim(),
        message: message.trim(),
        category,
        type: activeCategory.type,
        deliveryMethod,
        tenantIds: mode === "all" ? tenants.map((tenant) => tenant._id) : selectedIds,
      });
      if (result.failedIds.length > 0) {
        setMode(result.failedIds.length === 1 ? "individual" : "selected");
        setSelectedIds(result.failedIds);
        setFormError(result.errorMessage || `${result.failedIds.length} notification${result.failedIds.length === 1 ? " was" : "s were"} not submitted. Your title and message are still here; review the remaining recipients and try again.`);
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const applyTemplate = (templateLabel: string) => {
    setTemplate(templateLabel);
    const selectedTemplate = templates.find((item) => item.label === templateLabel);
    if (!selectedTemplate) return;
    setTitle(selectedTemplate.title);
    setMessage(selectedTemplate.message);
    setCategory(selectedTemplate.category);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create notification" disableClose={isSending} className="!max-w-4xl !max-h-[94dvh] sm:!max-h-[90vh]">
      <div className="space-y-5 sm:space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Write one message and choose the tenants who should receive it.</p>
          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Recipient type">
            {([
              ["all", "All tenants", Users],
              ["selected", "Selected", Users],
              ["individual", "One tenant", UserRound],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); if (value === "individual") setSelectedIds((current) => current.slice(0, 1)); setFormError(""); }}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/50"}`}>
                <Icon size={16} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2.5 text-sm">
            <span className="font-medium text-foreground">
              {mode === "all" ? `All active tenants · ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}` : mode === "individual" ? selectedIds.length ? (() => { const tenant = tenants.find((item) => item._id === selectedIds[0]); return `One tenant · ${tenant?.name || "Selected"}${tenant ? ` · ${tenant.propertyName || "Property"} · ${getUnitLabel(tenant)}` : ""}`; })() : "Choose one tenant" : `Selected tenants · ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}
            </span>
            {mode === "all" && <span className="text-xs text-muted-foreground">Inactive and ended tenancies are excluded.</span>}
          </div>
          {mode === "selected" && selectedIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected recipients">{selectedIds.slice(0, 8).map((tenantId) => { const tenant = tenants.find((item) => item._id === tenantId); return <span key={tenantId} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-1 pl-2.5 pr-1 text-xs text-foreground"><span className="max-w-48 truncate">{tenant?.name || "Tenant"} · {tenant ? `${tenant.propertyName || "Property"} · ${getUnitLabel(tenant)}` : ""}</span><button type="button" onClick={() => setSelectedIds((current) => current.filter((id) => id !== tenantId))} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${tenant?.name || "tenant"} from selection`}><X size={12} /></button></span>; })}{selectedIds.length > 8 && <span className="self-center text-xs text-muted-foreground">+{selectedIds.length - 8} more</span>}</div>}

          {mode !== "all" && (
            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <label className="flex items-center gap-2 border-b border-border px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/50">
                <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Search tenants by name, phone, email, property, or unit</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, property or unit" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                {search && <button type="button" onClick={() => setSearch("")} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Clear search"><X size={15} /></button>}
              </label>
              {mode === "selected" && <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs"><button type="button" onClick={() => setSelectedIds(Array.from(new Set([...selectedIds, ...filteredTenants.map((tenant) => tenant._id)])))} className="font-semibold text-primary hover:underline">Select all {search ? "results" : "tenants"}</button><button type="button" onClick={() => setSelectedIds([])} className="text-muted-foreground hover:text-foreground">Clear selection</button></div>}
              <div className="max-h-52 overflow-y-auto overscroll-contain sm:max-h-60" role={mode === "individual" ? "radiogroup" : "group"} aria-label={mode === "individual" ? "Choose one tenant" : "Choose tenants"}>
                {filteredTenants.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">No active tenants match that search.</p> : filteredTenants.map((tenant) => {
                  const selected = selectedIds.includes(tenant._id);
                  return <label key={tenant._id} className={`flex cursor-pointer items-start gap-3 border-b border-border/60 px-3 py-3 last:border-b-0 hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}>
                    <input type={mode === "individual" ? "radio" : "checkbox"} name={mode === "individual" ? "individual-tenant" : undefined} checked={selected} onChange={() => toggleTenant(tenant._id)} className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{tenant.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{tenant.propertyName || "Property"} · {getUnitLabel(tenant)}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{[tenant.phone, tenant.email].filter(Boolean).join(" · ") || "No contact details"}</span></span>
                  </label>;
                })}
              </div>
              <p className="border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{mode === "individual" ? "Choose one tenant. Search includes contact details and unit." : `${selectedIds.length} selected`}</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
          <section className="space-y-4" aria-label="Compose notification">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm font-medium text-foreground">Notification title <span className="text-destructive" aria-hidden="true">*</span><input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Scheduled water maintenance" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /><span className="mt-1 block text-right text-xs text-muted-foreground">{title.length}/80</span></label>
              <label className="w-full text-sm font-medium text-foreground sm:w-auto sm:min-w-48">Category<select value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            <label className="block text-sm font-medium text-foreground">Message <span className="text-destructive" aria-hidden="true">*</span><textarea required maxLength={3000} value={message} onChange={(event) => setMessage(event.target.value)} rows={7} placeholder="Share the information tenants need. Include dates, times, and any action they should take." className="mt-1.5 min-h-40 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" /><span className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground"><span>Line breaks are preserved in the message.</span><span>{message.length}/3000</span></span></label>
            <label className="flex max-w-md items-center gap-3 text-sm font-medium text-foreground"><span className="shrink-0">Send by</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as NotificationDeliveryMethod)} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"><option value="app">In-app notification</option><option value="sms">SMS</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="both">SMS, email & WhatsApp</option></select></label>
          </section>

          <aside className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground"><Sparkles size={16} className="text-primary" aria-hidden="true" />Use a message template<select value={template} onChange={(event) => applyTemplate(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground"><option value="">Optional</option>{templates.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label>
            <div className="rounded-2xl border border-border bg-muted/20 p-4" aria-live="polite">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review before sending</p>
              <h3 className="mt-3 break-words text-base font-semibold text-foreground">{title.trim() || "Notification title"}</h3>
              <p className="mt-1 text-xs font-medium text-primary">{activeCategory.label} · {recipientCount} recipient{recipientCount === 1 ? "" : "s"}</p>
              <p className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{message.trim() || "Your message preview will appear here."}</p>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Delivery status is recorded in Sent notifications after each channel responds.</p>
            </div>
          </aside>
        </div>

        {formError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{formError}</p>}
        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-5 sm:flex-row sm:justify-between sm:px-5">
          <button type="button" onClick={onClose} disabled={isSending} className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!readyToSend} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
            <Send size={16} aria-hidden="true" />{isSending ? "Sending…" : `Send to ${recipientCount} tenant${recipientCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
