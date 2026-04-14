"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { ArrowRight, CheckCircle2, Clock, CreditCard, Landmark, PlugZap, Wallet } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import Modal from "../components/Modal";
import { usePermissions } from "@/hooks/usePermissions";

type IntegrationStatus = "connected" | "available" | "coming_soon";

type IntegrationCard = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  badgeLabel?: string;
  cta?: string;
  icon: typeof PlugZap;
  logoSrc?: string;
  logoAlt?: string;
  logoClassName?: string;
};

type TumaState = {
  enabled: boolean;
  email: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  businessId: string;
};

type TumaBusinessForm = {
  name: string;
  email: string;
  mobile: string;
  bankId: string;
  accountNumber: string;
  logo: string;
  description: string;
};

type TumaBank = {
  id: string;
  name: string;
  code?: string;
  country?: string;
};

const comingSoonIntegrations: IntegrationCard[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept international card payments from tenants.",
    status: "coming_soon",
    cta: "Join waitlist",
    icon: CreditCard,
    logoSrc: "/brand/stripe.svg",
    logoAlt: "Stripe",
    logoClassName: "h-5",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Offer PayPal for resident checkout and invoices.",
    status: "coming_soon",
    cta: "Notify me",
    icon: Wallet,
    logoSrc: "/brand/paypal.svg",
    logoAlt: "PayPal",
    logoClassName: "h-6",
  },
  {
    id: "banking",
    name: "Banking Partners",
    description: "Connect local bank partners for payouts and settlements.",
    status: "coming_soon",
    cta: "Request access",
    icon: Landmark,
  },
];

export default function OwnerIntegrationsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const sessionRole = Cookies.get("role") || null;
  const isOwnerRole = sessionRole === "propertyOwner";
  const canViewIntegrations =
    perm.hasPermission("integrations:view") || perm.hasPermission("settings:view");
  const canEditIntegrations =
    isOwnerRole || perm.hasPermission("integrations:edit") || perm.hasPermission("settings:edit");

  const isReadOnly = !canEditIntegrations;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [tuma, setTuma] = useState<TumaState>({
    enabled: true,
    email: "",
    hasApiKey: false,
    maskedApiKey: "",
    businessId: "",
  });
  const [initial, setInitial] = useState({
    enabled: true,
    email: "",
    hasApiKey: false,
    businessId: "",
  });
  const [banks, setBanks] = useState<TumaBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [tumaForm, setTumaForm] = useState<TumaBusinessForm>({
    name: "",
    email: "",
    mobile: "",
    bankId: "",
    accountNumber: "",
    logo: "",
    description: "",
  });
  const [showModal, setShowModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationCard | null>(null);

  useEffect(() => {
    const id = Cookies.get("userId");
    const role = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    if (!id || !["propertyOwner", "teamMember"].includes(role || "")) {
      toast.error("Unauthorized access. Please log in as a property owner or team member.");
      router.replace("/");
      return;
    }

    if (role === "teamMember" && !canViewIntegrations) {
      toast.error("Access restricted. You do not have permission to view integrations.");
      router.replace("/property-owner-dashboard");
      return;
    }

    const ownerIdToUse = role === "propertyOwner" ? id : (ownerIdFromCookie || id);
    if (!ownerIdToUse) {
      toast.error("Could not determine property owner. Please log in again.");
      router.replace("/");
      return;
    }

    const fetchIntegrations = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/owner/integrations", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          const nextTuma = data.integrations?.tuma || {};
          setTuma({
            enabled: nextTuma.enabled !== false,
            email: nextTuma.email || "",
            hasApiKey: !!nextTuma.hasApiKey,
            maskedApiKey: nextTuma.maskedApiKey || "",
            businessId: nextTuma.businessId || "",
          });
          setInitial({
            enabled: nextTuma.enabled !== false,
            email: nextTuma.email || "",
            hasApiKey: !!nextTuma.hasApiKey,
            businessId: nextTuma.businessId || "",
          });
          setTumaForm((prev) => ({
            ...prev,
            email: nextTuma.email || prev.email,
          }));
        } else {
          toast.error(data.message || "Failed to load integrations.");
        }
      } catch (error) {
        toast.error("Failed to load integrations.");
      } finally {
        setLoading(false);
      }
    };

    const fetchBanks = async () => {
      setBanksLoading(true);
      try {
        const res = await fetch("/api/owner/tuma/banks", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          const list = Array.isArray(data.banks) ? data.banks : [];
          setBanks(list);
        } else {
          toast.error(data.message || "Failed to load Tuma banks.");
        }
      } catch {
        toast.error("Failed to load Tuma banks.");
      } finally {
        setBanksLoading(false);
      }
    };

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) setCsrfToken(data.csrfToken);
      } catch {
        setCsrfToken(null);
      }
    };

    fetchIntegrations();
    fetchBanks();
    fetchCsrf();
  }, [router, canViewIntegrations]);

  const isDirty = useMemo(() => {
    return tuma.enabled !== initial.enabled;
  }, [tuma, initial]);

  const isProvisioned = tuma.email.trim() && tuma.hasApiKey;
  const isConfigured = tuma.enabled && isProvisioned;

  const statusLabel = loading
    ? "Checking connection..."
    : isConfigured
      ? isDirty
        ? "Configured - Unsaved changes"
        : "Configured"
      : isProvisioned
        ? "Configured (Disabled)"
        : "Not configured";

  const tumaCardDescription = isProvisioned
    ? "Manage Tuma settings and tenant payment routing."
    : "Create a Tuma profile to start collecting tenant payments.";
  const tumaCta = isConfigured ? "Manage Tuma" : isProvisioned ? "Finish setup" : "Create profile";

  const integrationCards = useMemo<IntegrationCard[]>(() => {
    const tumaBadgeLabel = isConfigured ? "Connected" : isProvisioned ? "Available" : "Setup required";
    return [
      {
        id: "tuma",
        name: "Tuma Gateway",
        description: tumaCardDescription,
        status: isConfigured ? "connected" : "available",
        badgeLabel: tumaBadgeLabel,
        cta: tumaCta,
        icon: PlugZap,
        logoSrc: "/brand/tuma.png",
        logoAlt: "Tuma",
        logoClassName: "h-7",
      },
      ...comingSoonIntegrations,
    ];
  }, [isConfigured, isProvisioned, tumaCardDescription]);

  const openIntegrationModal = (integration: IntegrationCard) => {
    setSelectedIntegration(integration);
    setShowModal(true);
  };

  const closeIntegrationModal = () => {
    setShowModal(false);
    setSelectedIntegration(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to edit integrations.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/owner/integrations", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          tuma: {
            enabled: tuma.enabled,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to update integrations.");
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      toast.success("Tuma integration saved successfully.");
    } catch {
      toast.error("Failed to update integrations.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to create a Tuma business.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    if (!tumaForm.name.trim()) {
      toast.error("Please provide the business name.");
      return;
    }
    if (!tumaForm.email.trim()) {
      toast.error("Please provide the business email.");
      return;
    }
    if (!tumaForm.mobile.trim()) {
      toast.error("Please provide the mobile number in 254XXXXXXXXX format.");
      return;
    }
    if (!tumaForm.bankId.trim()) {
      toast.error("Please select a bank.");
      return;
    }
    if (!tumaForm.accountNumber.trim()) {
      toast.error("Please provide the bank account number.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/owner/tuma/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          name: tumaForm.name.trim(),
          email: tumaForm.email.trim(),
          mobile: tumaForm.mobile.trim(),
          bankId: tumaForm.bankId.trim(),
          accountNumber: tumaForm.accountNumber.trim(),
          logo: tumaForm.logo.trim(),
          description: tumaForm.description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to create Tuma business.");
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      toast.success(data.message || "Tuma business created successfully.");
    } catch {
      toast.error("Failed to create Tuma business.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (isReadOnly) {
      toast.error("You do not have permission to delete integrations.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const confirmed = window.confirm(
      "This will remove your Tuma API key and business profile from this account. You will need to create it again to receive payments. Continue?"
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch("/api/owner/integrations", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to delete integrations.");
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      toast.success(data.message || "Tuma credentials deleted.");
    } catch {
      toast.error("Failed to delete integrations.");
    } finally {
      setSaving(false);
    }
  };

  const renderStatusBadge = (status: IntegrationStatus, labelOverride?: string) => {
    if (status === "connected") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
          <CheckCircle2 size={12} />
          {labelOverride || "Connected"}
        </span>
      );
    }
    if (status === "coming_soon") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
          <Clock size={12} />
          {labelOverride || "Coming soon"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
        <Clock size={12} />
        {labelOverride || "Available"}
      </span>
    );
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center shadow-sm">
                  <PlugZap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Connect payment providers and manage API credentials.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse" />
              ))
            ) : (
              integrationCards.map((integration) => {
                const Icon = integration.icon;
                const buttonLabel =
                  integration.cta ||
                  (integration.status === "coming_soon"
                    ? "View details"
                    : integration.status === "connected"
                      ? "Manage"
                      : "Connect");
                return (
                  <div key={integration.id} className="surface-card rounded-3xl p-6 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/80 shadow-sm">
                          {integration.logoSrc ? (
                            <img
                              src={integration.logoSrc}
                              alt={integration.logoAlt || integration.name}
                              className={integration.logoClassName || "h-6"}
                            />
                          ) : (
                            <Icon size={18} className="text-primary" />
                          )}
                        </div>
                        <h3 className="text-base sm:text-lg font-semibold text-foreground">{integration.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                      </div>
                      {renderStatusBadge(integration.status, integration.badgeLabel)}
                    </div>
                    <button
                      onClick={() => openIntegrationModal(integration)}
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {buttonLabel}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </section>

          <Modal
            title={selectedIntegration?.name || "Integration"}
            isOpen={showModal && !!selectedIntegration}
            onClose={closeIntegrationModal}
            className="max-w-3xl"
          >
            {selectedIntegration?.id === "tuma" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Integration status</p>
                    <p className="text-sm font-semibold text-foreground mt-2">{statusLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enable Tuma to collect tenant payments via STK push.
                    </p>
                  </div>
                  {renderStatusBadge(
                    isConfigured ? "connected" : "available",
                    isConfigured ? "Connected" : isProvisioned ? "Available" : "Setup required"
                  )}
                </div>

                {isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    You have read-only access. Contact an owner admin to update integrations.
                  </div>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Enable Tuma</label>
                      <select
                        value={tuma.enabled ? "yes" : "no"}
                        onChange={(e) =>
                          setTuma((prev) => ({ ...prev, enabled: e.target.value === "yes" }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="yes">Enabled</option>
                        <option value="no">Disabled</option>
                      </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Current API Key</label>
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        {tuma.hasApiKey ? tuma.maskedApiKey || "Configured" : "Not set"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        API keys are generated automatically when you create the business profile.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Tuma Business Email</label>
                      <input
                        type="email"
                        value={tuma.email}
                        disabled
                        className="mt-2 w-full rounded-xl border border-border bg-white/70 px-3 py-2 text-sm text-muted-foreground"
                        placeholder="Not created yet"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Tuma Business ID</label>
                      <input
                        type="text"
                        value={tuma.businessId}
                        disabled
                        className="mt-2 w-full rounded-xl border border-border bg-white/70 px-3 py-2 text-sm text-muted-foreground"
                        placeholder="Not created yet"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isReadOnly || saving || !isDirty}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save integration"}
                    </button>
                    {tuma.hasApiKey && (
                      <button
                        type="button"
                        onClick={handleDeleteCredentials}
                        disabled={isReadOnly || saving}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete credentials
                      </button>
                    )}
                  </div>
                </form>

                {!isProvisioned && (
                  <div className="rounded-3xl border border-border bg-white/70 p-5">
                    <h3 className="text-base font-semibold text-foreground">Create a Tuma business profile</h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Enter your business and banking details. We will create a child profile and save the API key automatically.
                    </p>
                    <form onSubmit={handleCreateBusiness} className="mt-5 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Business Name</label>
                          <input
                            type="text"
                            value={tumaForm.name}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, name: e.target.value }))}
                            disabled={isReadOnly}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                            placeholder="Your business name"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Business Email</label>
                          <input
                            type="email"
                            value={tumaForm.email}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, email: e.target.value }))}
                            disabled={isReadOnly}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                            placeholder="billing@yourcompany.com"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Mobile Number (254XXXXXXXXX)</label>
                          <input
                            type="tel"
                            value={tumaForm.mobile}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, mobile: e.target.value }))}
                            disabled={isReadOnly}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                            placeholder="254712345678"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Bank</label>
                          <select
                            value={tumaForm.bankId}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, bankId: e.target.value }))}
                            disabled={isReadOnly || banksLoading}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                          >
                            <option value="">
                              {banksLoading ? "Loading banks..." : "Select a bank"}
                            </option>
                            {banks.map((bank) => (
                              <option key={bank.id} value={bank.id}>
                                {bank.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Bank Account Number</label>
                          <input
                            type="text"
                            value={tumaForm.accountNumber}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                            disabled={isReadOnly}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                            placeholder="1234567890"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Logo URL (optional)</label>
                          <input
                            type="url"
                            value={tumaForm.logo}
                            onChange={(e) => setTumaForm((prev) => ({ ...prev, logo: e.target.value }))}
                            disabled={isReadOnly}
                            className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                            placeholder="https://yourdomain.com/logo.png"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                        <textarea
                          value={tumaForm.description}
                          onChange={(e) => setTumaForm((prev) => ({ ...prev, description: e.target.value }))}
                          disabled={isReadOnly}
                          className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                          rows={3}
                          placeholder="Brief description of your business"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isReadOnly || creating}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {creating ? "Creating..." : "Create Tuma Business"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  This integration is being prepared for owners. When it launches, you will connect and manage it right
                  here.
                </p>
                <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-xs text-muted-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Coming soon</p>
                  <p className="mt-2">
                    Reach out to support if you want early access or a custom rollout.
                  </p>
                </div>
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
}
