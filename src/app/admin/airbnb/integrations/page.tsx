"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plug, AlertCircle, RefreshCw } from "lucide-react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import { cn } from "@/lib/utils";

interface Integration {
  _id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  provider: string;
  status: string;
  description: string;
  lastSyncedAt?: string;
}

export default function AdminAirbnbIntegrationsPage() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");

      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setError("Session expired or invalid. Redirecting...");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchIntegrations = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/airbnb/integrations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load integrations");

      setIntegrations(data.integrations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load Airbnb integrations.");
    } finally {
      setIsLoading(false);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchIntegrations();
    }
  }, [status, fetchIntegrations]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Plug className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Airbnb Integrations</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Monitor channel manager and payment integrations per owner.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    fetchIntegrations();
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs text-red-700 hover:text-red-800 transition-colors"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-2xl h-20 animate-pulse" />
              ))}
            </div>
          ) : integrations.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
              No Airbnb integrations yet.
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="table-shell">
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provider</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Integration</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Owner</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Sync</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrations.map((integration) => (
                      <tr key={integration._id} className="hover:bg-primary/5 transition-colors">
                        <td className="py-3 px-4 text-xs text-muted-foreground">{integration.provider}</td>
                        <td className="py-3 px-4 text-xs font-medium text-foreground">{integration.name}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {integration.ownerEmail || integration.ownerName}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                              integration.status === "connected"
                                ? "bg-emerald-100 text-emerald-700"
                                : integration.status === "warning"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {integration.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {integration.lastSyncedAt
                            ? new Date(integration.lastSyncedAt).toLocaleString("en-KE")
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {integration.description || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
