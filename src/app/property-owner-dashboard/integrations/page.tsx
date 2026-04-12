"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { PlugZap, Save, ShieldCheck, ShieldX } from "lucide-react";
import { motion } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { usePermissions } from "@/hooks/usePermissions";

type TumaState = {
  enabled: boolean;
  email: string;
  apiKey: string;
  hasApiKey: boolean;
  maskedApiKey: string;
};

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
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [tuma, setTuma] = useState<TumaState>({
    enabled: true,
    email: "",
    apiKey: "",
    hasApiKey: false,
    maskedApiKey: "",
  });
  const [initial, setInitial] = useState({
    enabled: true,
    email: "",
    hasApiKey: false,
  });

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
            apiKey: "",
            hasApiKey: !!nextTuma.hasApiKey,
            maskedApiKey: nextTuma.maskedApiKey || "",
          });
          setInitial({
            enabled: nextTuma.enabled !== false,
            email: nextTuma.email || "",
            hasApiKey: !!nextTuma.hasApiKey,
          });
        } else {
          toast.error(data.message || "Failed to load integrations.");
        }
      } catch (error) {
        toast.error("Failed to load integrations.");
      } finally {
        setLoading(false);
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
    fetchCsrf();
  }, [router, canViewIntegrations]);

  const isDirty = useMemo(() => {
    return (
      tuma.enabled !== initial.enabled ||
      tuma.email !== initial.email ||
      tuma.apiKey.trim().length > 0
    );
  }, [tuma, initial]);

  const requiresApiKey = tuma.enabled && !initial.hasApiKey && !tuma.apiKey.trim();
  const isConfigured =
    tuma.enabled && tuma.email.trim() && (initial.hasApiKey || tuma.apiKey.trim());

  const statusLabel = loading
    ? "Checking connection..."
    : isConfigured
      ? isDirty
        ? "Configured - Unsaved changes"
        : "Configured"
      : "Not configured";

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

    if (tuma.enabled && !tuma.email.trim()) {
      toast.error("Please provide your Tuma business email.");
      return;
    }

    if (requiresApiKey) {
      toast.error("Please provide your Tuma API key.");
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
            email: tuma.email.trim(),
            apiKey: tuma.apiKey.trim(),
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
        apiKey: "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
      });
      toast.success("Tuma integration saved successfully.");
    } catch {
      toast.error("Failed to update integrations.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-6xl mx-auto space-y-6 overflow-y-auto transition-all duration-300">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                <PlugZap size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Connect payment providers and manage API credentials.
                </p>
              </div>
            </div>
          </motion.section>

          <motion.section
            className="surface-card rounded-2xl p-5 sm:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    isConfigured
                      ? "bg-primary/15 text-primary"
                      : "bg-amber-100 text-amber-600"
                  }`}
                >
                  {isConfigured ? <ShieldCheck className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Tuma Gateway</p>
                  <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Enable Tuma to collect tenant payments via STK push.
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                  isConfigured
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isConfigured ? "Connected" : "Not connected"}
              </span>
            </div>

            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
                  <label className="text-xs font-medium text-gray-600">Enable Tuma</label>
                  <select
                    value={tuma.enabled ? "yes" : "no"}
                    onChange={(e) =>
                      setTuma((prev) => ({ ...prev, enabled: e.target.value === "yes" }))
                    }
                    disabled={isReadOnly}
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  >
                    <option value="yes">Enabled</option>
                    <option value="no">Disabled</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
                  <label className="text-xs font-medium text-gray-600">Current API Key</label>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {tuma.hasApiKey ? tuma.maskedApiKey || "Configured" : "Not set"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave the new key field blank to keep the existing value.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Tuma Business Email</label>
                  <input
                    type="email"
                    value={tuma.email}
                    onChange={(e) =>
                      setTuma((prev) => ({ ...prev, email: e.target.value }))
                    }
                    disabled={isReadOnly}
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder="you@yourcompany.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">New Tuma API Key</label>
                  <input
                    type="password"
                    value={tuma.apiKey}
                    onChange={(e) =>
                      setTuma((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                    disabled={isReadOnly}
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                    placeholder={tuma.hasApiKey ? "Leave blank to keep existing key" : "Enter your API key"}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isReadOnly || saving || !isDirty}
                className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save Integration"}
              </button>
            </form>
          </motion.section>

          <motion.section
            className="surface-card rounded-2xl p-5 sm:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <h2 className="text-base sm:text-lg font-semibold text-foreground">More integrations coming soon</h2>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
              Stripe, PayPal, and banking partners will appear here once enabled.
            </p>
          </motion.section>
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}
