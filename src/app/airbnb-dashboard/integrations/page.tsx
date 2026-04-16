"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, CheckCircle2, Clock, ArrowRight, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbIntegration } from "@/types/airbnb";

export default function AirbnbIntegrationsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("settings:view");
  const router = useRouter();
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
  const managedProviders = ["tuma", "stripe", "smtp", "ga", "meta"];

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
                  {managedProviders.includes(selectedIntegration.provider || "") && (
                    <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Configuration
                      </p>
                      {selectedIntegration.provider === "tuma" ? (
                        <>
                          <p>
                            Configure Tuma on the Owner dashboard under Integrations. Once connected, booking STK Push
                            collections will automatically route through Tuma.
                          </p>
                          <button
                            onClick={() => {
                              setShowModal(false);
                              router.push("/property-owner-dashboard/integrations");
                            }}
                            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[11px] font-semibold text-white hover:bg-primary-hover"
                          >
                            Open owner integrations
                            <ArrowRight size={14} />
                          </button>
                        </>
                      ) : (
                        <p>
                          This integration is enabled through environment variables and system settings. No in-app
                          configuration is required here.
                        </p>
                      )}
                    </div>
                  )}
                  {!managedProviders.includes(selectedIntegration.provider || "") && (
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
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
