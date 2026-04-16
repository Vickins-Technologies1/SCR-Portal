"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plug, CheckCircle2, Clock, ArrowRight, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbIntegration } from "@/types/airbnb";

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

export default function AirbnbIntegrationsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("settings:view");
  const [integrations, setIntegrations] = useState<AirbnbIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<AirbnbIntegration | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [config, setConfig] = useState({
    baseUrl: "",
    accessToken: "",
    refreshToken: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
  });
  const managedProviders = ["stripe", "smtp", "ga", "meta"];

  const [tumaLoading, setTumaLoading] = useState(false);
  const [tumaSaving, setTumaSaving] = useState(false);
  const [tumaCreating, setTumaCreating] = useState(false);
  const [tuma, setTuma] = useState<TumaState | null>(null);
  const [tumaApiKeyInput, setTumaApiKeyInput] = useState("");
  const [tumaCreds, setTumaCreds] = useState({
    enabled: true,
    email: "",
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

  const isTumaModal = selectedIntegration?.provider === "tuma";
  const tumaConfigured = useMemo(() => !!(tuma?.hasApiKey && tuma.email.trim()), [tuma]);

  const fetchIntegrations = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/integrations?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setIntegrations(data.integrations || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchIntegrations();
    }
  }, [hasAccess, fetchIntegrations]);

  const openConfigModal = (integration: AirbnbIntegration) => {
    setSelectedIntegration(integration);
    setConfig({
      baseUrl: integration.config?.baseUrl || "",
      accessToken: integration.config?.accessToken || "",
      refreshToken: integration.config?.refreshToken || "",
      tokenUrl: integration.config?.tokenUrl || "",
      clientId: integration.config?.clientId || "",
      clientSecret: integration.config?.clientSecret || "",
    });
    setFormMessage(null);
    setShowModal(true);
  };

  useEffect(() => {
    if (!showModal || !isTumaModal) return;

    const load = async () => {
      setFormMessage(null);
      setTumaLoading(true);
      try {
        const res = await fetch("/api/airbnb/tuma/integration", { credentials: "include" });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to load Tuma integration");
        }
        const next: TumaState = data.tuma || {
          enabled: true,
          email: "",
          hasApiKey: false,
          maskedApiKey: "",
          businessId: "",
        };
        setTuma(next);
        setTumaCreds({
          enabled: next.enabled !== false,
          email: next.email || "",
          businessId: next.businessId || "",
        });
        setTumaApiKeyInput("");
      } catch (err) {
        setFormMessage(err instanceof Error ? err.message : "Failed to load Tuma integration");
      } finally {
        setTumaLoading(false);
      }
    };

    const loadBanks = async () => {
      setBanksLoading(true);
      try {
        const res = await fetch("/api/airbnb/tuma/banks", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          setBanks(data.banks || []);
        }
      } finally {
        setBanksLoading(false);
      }
    };

    load();
    loadBanks();
  }, [showModal, isTumaModal]);

  const handleSaveTuma = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh and try again.");
      return;
    }
    setTumaSaving(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/airbnb/tuma/integration", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          enabled: tumaCreds.enabled,
          email: tumaCreds.email,
          businessId: tumaCreds.businessId,
          apiKey: tumaApiKeyInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update Tuma integration");
      }
      setTuma(data.tuma);
      setTumaApiKeyInput("");
      await fetchIntegrations();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to update Tuma integration");
    } finally {
      setTumaSaving(false);
    }
  };

  const handleDisconnectTuma = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh and try again.");
      return;
    }
    setTumaSaving(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/airbnb/tuma/integration", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to disconnect Tuma integration");
      }
      setTuma(data.tuma);
      setTumaApiKeyInput("");
      await fetchIntegrations();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to disconnect Tuma integration");
    } finally {
      setTumaSaving(false);
    }
  };

  const handleCreateTumaBusiness = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh and try again.");
      return;
    }
    setTumaCreating(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/airbnb/tuma/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(tumaForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create Tuma business");
      }
      setTuma(data.tuma);
      setTumaCreds({
        enabled: true,
        email: data.tuma?.email || "",
        businessId: data.tuma?.businessId || "",
      });
      setTumaApiKeyInput("");
      await fetchIntegrations();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to create Tuma business");
    } finally {
      setTumaCreating(false);
    }
  };

  const handleSaveIntegration = async (status: AirbnbIntegration["status"]) => {
    if (!csrfToken || !selectedIntegration) {
      setFormMessage("Missing session token. Refresh and try again.");
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/airbnb/integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          id: selectedIntegration.id,
          name: selectedIntegration.name,
          description: selectedIntegration.description,
          status,
          provider: selectedIntegration.provider,
          config,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update integration");
      }
      setShowModal(false);
      await fetchIntegrations();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to update integration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Integrations"
            subtitle="Connect payments, analytics, and guest communication partners."
            icon={Plug}
          />

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse" />
              ))
            ) : integrations.length === 0 ? (
              <div className="surface-card rounded-3xl p-6 text-xs text-muted-foreground">
                No integrations available yet.
              </div>
            ) : (
              integrations.map((integration) => (
                <div key={integration.id} className="surface-card rounded-3xl p-6 flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground">{integration.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                    </div>
                    {integration.status === "connected" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                        <CheckCircle2 size={12} />
                        Connected
                      </span>
                    ) : integration.status === "coming_soon" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                        <Clock size={12} />
                        Coming soon
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                        <Clock size={12} />
                        Available
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => openConfigModal(integration)}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    disabled={integration.status === "coming_soon"}
                  >
                    {integration.status === "connected" ? "Manage" : "Connect"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))
            )}
          </section>

          {showModal && selectedIntegration && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-lg overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {selectedIntegration.status === "connected" ? "Manage integration" : "Connect integration"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">{selectedIntegration.name}</p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-4">
                  {formMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {formMessage}
                    </div>
                  )}
                  {selectedIntegration.provider === "tuma" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Tuma Gateway</p>
                        <p>
                          Configure a dedicated Tuma business for Airbnb STK Push collections here.
                        </p>
                      </div>

                      {tumaLoading ? (
                        <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-xs text-muted-foreground">
                          Loading Tuma settings...
                        </div>
                      ) : (
                        <>
                          <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center justify-between">
                              <span>Status</span>
                              <span className="font-semibold text-foreground">
                                {tumaConfigured ? "Connected" : "Not configured"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Email</span>
                              <span className="font-medium text-foreground">{tuma?.email || "—"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Business ID</span>
                              <span className="font-medium text-foreground">{tuma?.businessId || "—"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>API Key</span>
                              <span className="font-medium text-foreground">{tuma?.maskedApiKey || "—"}</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                              Connect existing
                            </p>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={tumaCreds.enabled}
                                onChange={(event) =>
                                  setTumaCreds((prev) => ({ ...prev, enabled: event.target.checked }))
                                }
                              />
                              Enabled
                            </label>
                            <input
                              className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                              placeholder="Tuma business email"
                              value={tumaCreds.email}
                              onChange={(event) => setTumaCreds((prev) => ({ ...prev, email: event.target.value }))}
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                              placeholder="Tuma business ID (optional)"
                              value={tumaCreds.businessId}
                              onChange={(event) =>
                                setTumaCreds((prev) => ({ ...prev, businessId: event.target.value }))
                              }
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                              placeholder={tumaConfigured ? "New API key (leave blank to keep)" : "Tuma API key"}
                              type="password"
                              value={tumaApiKeyInput}
                              onChange={(event) => setTumaApiKeyInput(event.target.value)}
                            />
                            <div className="flex justify-end gap-3">
                              {tumaConfigured && (
                                <button
                                  onClick={handleDisconnectTuma}
                                  disabled={tumaSaving || tumaCreating}
                                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                                >
                                  Disconnect
                                </button>
                              )}
                              <button
                                onClick={handleSaveTuma}
                                disabled={tumaSaving || tumaCreating}
                                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                              >
                                {tumaSaving ? "Saving..." : "Save Tuma settings"}
                              </button>
                            </div>
                          </div>

                          {!tumaConfigured && (
                            <div className="space-y-3 pt-2">
                              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                Create business
                              </p>
                              <input
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Business name"
                                value={tumaForm.name}
                                onChange={(event) => setTumaForm((prev) => ({ ...prev, name: event.target.value }))}
                              />
                              <input
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Business email"
                                value={tumaForm.email}
                                onChange={(event) => setTumaForm((prev) => ({ ...prev, email: event.target.value }))}
                              />
                              <input
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Mobile (2547XXXXXXXX)"
                                value={tumaForm.mobile}
                                onChange={(event) => setTumaForm((prev) => ({ ...prev, mobile: event.target.value }))}
                              />
                              <select
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                value={tumaForm.bankId}
                                onChange={(event) => setTumaForm((prev) => ({ ...prev, bankId: event.target.value }))}
                                disabled={banksLoading}
                              >
                                <option value="">
                                  {banksLoading ? "Loading banks..." : "Select bank"}
                                </option>
                                {banks.map((bank) => (
                                  <option key={bank.id} value={bank.id}>
                                    {bank.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Account number"
                                value={tumaForm.accountNumber}
                                onChange={(event) =>
                                  setTumaForm((prev) => ({ ...prev, accountNumber: event.target.value }))
                                }
                              />
                              <input
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Logo URL (optional)"
                                value={tumaForm.logo}
                                onChange={(event) => setTumaForm((prev) => ({ ...prev, logo: event.target.value }))}
                              />
                              <textarea
                                className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                                placeholder="Description (optional)"
                                value={tumaForm.description}
                                onChange={(event) =>
                                  setTumaForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                rows={3}
                              />
                              <div className="flex justify-end">
                                <button
                                  onClick={handleCreateTumaBusiness}
                                  disabled={tumaCreating || tumaSaving}
                                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                                >
                                  {tumaCreating ? "Creating..." : "Create Tuma business"}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {managedProviders.includes(selectedIntegration.provider || "") && (
                    <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Configuration
                      </p>
                      <p>
                        This integration is enabled through environment variables and system settings. No in-app
                        configuration is required here.
                      </p>
                    </div>
                  )}
                  {!isTumaModal && !managedProviders.includes(selectedIntegration.provider || "") && (
                    <>
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Base URL"
                        value={config.baseUrl}
                        onChange={(event) => setConfig((prev) => ({ ...prev, baseUrl: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Access token"
                        value={config.accessToken}
                        onChange={(event) => setConfig((prev) => ({ ...prev, accessToken: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Refresh token"
                        value={config.refreshToken}
                        onChange={(event) => setConfig((prev) => ({ ...prev, refreshToken: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Token URL"
                        value={config.tokenUrl}
                        onChange={(event) => setConfig((prev) => ({ ...prev, tokenUrl: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Client ID"
                        value={config.clientId}
                        onChange={(event) => setConfig((prev) => ({ ...prev, clientId: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                        placeholder="Client secret"
                        value={config.clientSecret}
                        onChange={(event) => setConfig((prev) => ({ ...prev, clientSecret: event.target.value }))}
                      />
                    </>
                  )}
                  {!isTumaModal && (
                    <div className="flex justify-end gap-3">
                      {selectedIntegration.status === "connected" && (
                        <button
                          onClick={() => handleSaveIntegration("available")}
                          className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Disconnect
                        </button>
                      )}
                      <button
                        onClick={() => handleSaveIntegration("connected")}
                        disabled={isSaving}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                      >
                        {isSaving ? "Saving..." : "Save settings"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
