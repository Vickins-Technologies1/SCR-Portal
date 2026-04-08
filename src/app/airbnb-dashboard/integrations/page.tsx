"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbIntegration } from "@/types/airbnb";

export default function AirbnbIntegrationsPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("settings:view");
  const [integrations, setIntegrations] = useState<AirbnbIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Integrations"
            subtitle="Connect channels, payments, and automation partners."
            icon={Plug}
          />

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse" />
              ))
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
        </main>
      </div>
    </div>
  );
}
