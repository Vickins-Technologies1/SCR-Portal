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
  const [creating, setCreating] = useState(false);
  const [tumaForm, setTumaForm] = useState<TumaBusinessForm>({
    name: "",
    email: "",
    mobile: "",
    bankId: "",
    accountNumber: "",
    logo: "",
    description: "",
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
                    : isProvisioned
                      ? "bg-amber-100 text-amber-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {isConfigured ? "Connected" : isProvisioned ? "Disabled" : "Not connected"}
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
                    API keys are generated automatically when you create the business profile.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Tuma Business Email</label>
                  <input
                    type="email"
                    value={tuma.email}
                    disabled
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/50 text-xs sm:text-sm text-gray-500"
                    placeholder="Not created yet"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Tuma Business ID</label>
                  <input
                    type="text"
                    value={tuma.businessId}
                    disabled
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/50 text-xs sm:text-sm text-gray-500"
                    placeholder="Not created yet"
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

          {!isProvisioned && (
            <motion.section
              className="surface-card rounded-2xl p-5 sm:p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">
                    Create a Tuma business profile
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                    Enter your business and banking details. We will create a child profile and save the API key
                    automatically.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateBusiness} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Business Name</label>
                    <input
                      type="text"
                      value={tumaForm.name}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, name: e.target.value }))}
                      disabled={isReadOnly}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      placeholder="Your business name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Business Email</label>
                    <input
                      type="email"
                      value={tumaForm.email}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, email: e.target.value }))}
                      disabled={isReadOnly}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      placeholder="billing@yourcompany.com"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Mobile Number (254XXXXXXXXX)</label>
                    <input
                      type="tel"
                      value={tumaForm.mobile}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, mobile: e.target.value }))}
                      disabled={isReadOnly}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      placeholder="254712345678"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Bank</label>
                    <select
                      value={tumaForm.bankId}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, bankId: e.target.value }))}
                      disabled={isReadOnly || banksLoading}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
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
                    <label className="text-xs font-medium text-gray-600">Bank Account Number</label>
                    <input
                      type="text"
                      value={tumaForm.accountNumber}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      disabled={isReadOnly}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Logo URL (optional)</label>
                    <input
                      type="url"
                      value={tumaForm.logo}
                      onChange={(e) => setTumaForm((prev) => ({ ...prev, logo: e.target.value }))}
                      disabled={isReadOnly}
                      className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      placeholder="https://yourdomain.com/logo.png"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600">Description (optional)</label>
                  <textarea
                    value={tumaForm.description}
                    onChange={(e) => setTumaForm((prev) => ({ ...prev, description: e.target.value }))}
                    disabled={isReadOnly}
                    className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                    rows={3}
                    placeholder="Brief description of your business"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isReadOnly || creating}
                  className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Tuma Business"}
                </button>
              </form>
            </motion.section>
          )}

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
