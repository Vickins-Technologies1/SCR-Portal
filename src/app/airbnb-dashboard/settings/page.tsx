"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Clock, Sparkles, Mail, CheckCircle2 } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";

const defaultSettings = {
  brandName: "Sorana Short-Stays",
  supportEmail: "",
  supportPhone: "",
  currency: "KES",
  checkInTime: "3:00 PM",
  checkOutTime: "11:00 AM",
  minNights: 2,
  maxNights: 21,
  cleaningFee: 0,
  serviceFee: 0,
  taxRate: 0,
  cancellationPolicy: "Flexible (full refund 1 day prior to arrival)",
  houseRules: "",
  instantBook: true,
  sendBookingConfirmation: true,
  sendPaymentReceipt: true,
  sendCheckInReminder: true,
  sendCheckOutReminder: true,
};

type SettingsState = typeof defaultSettings;

export default function AirbnbSettingsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("settings:view");
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/airbnb/settings?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setSettings({ ...defaultSettings, ...data.settings });
      }
    } finally {
      setIsLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchSettings();
    }
  }, [hasAccess, fetchSettings]);

  const handleSave = async () => {
    if (!csrfToken) {
      setFormMessage("Missing session token. Refresh and try again.");
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/airbnb/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save settings");
      }
      setSettings({ ...defaultSettings, ...data.settings });
      setFormMessage("Airbnb settings updated successfully.");
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (hasAccess === false) {
    return (
      <div className="min-h-[100svh] bg-background text-foreground">
        <Navbar />
        <Sidebar />
        <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="surface-card rounded-3xl p-8 text-center text-sm text-muted-foreground">
            You do not have access to settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-6xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Short-term Rentals"
            title="Airbnb Settings"
            subtitle="Keep short-term operations fully independent with dedicated pricing, rules, and guest workflows."
            icon={Settings}
          />

          {formMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {formMessage}
            </div>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Stay rules</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Check-in time</label>
                  <input
                    value={settings.checkInTime}
                    onChange={(event) => setSettings((prev) => ({ ...prev, checkInTime: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Check-out time</label>
                  <input
                    value={settings.checkOutTime}
                    onChange={(event) => setSettings((prev) => ({ ...prev, checkOutTime: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Min nights</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.minNights}
                    onChange={(event) => setSettings((prev) => ({ ...prev, minNights: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Max nights</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.maxNights}
                    onChange={(event) => setSettings((prev) => ({ ...prev, maxNights: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={settings.instantBook}
                  onChange={(event) => setSettings((prev) => ({ ...prev, instantBook: event.target.checked }))}
                />
                Enable instant booking for guests
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Cancellation policy</label>
                <input
                  value={settings.cancellationPolicy}
                  onChange={(event) => setSettings((prev) => ({ ...prev, cancellationPolicy: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Default house rules</label>
                <textarea
                  value={settings.houseRules}
                  onChange={(event) => setSettings((prev) => ({ ...prev, houseRules: event.target.value }))}
                  rows={4}
                  className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="surface-card rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Pricing & fees</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Cleaning fee</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.cleaningFee}
                    onChange={(event) => setSettings((prev) => ({ ...prev, cleaningFee: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Service fee</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.serviceFee}
                    onChange={(event) => setSettings((prev) => ({ ...prev, serviceFee: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Tax rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.taxRate}
                    onChange={(event) => setSettings((prev) => ({ ...prev, taxRate: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Currency</label>
                  <input
                    value={settings.currency}
                    onChange={(event) => setSettings((prev) => ({ ...prev, currency: event.target.value }))}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-white/70 p-4 text-xs text-muted-foreground">
                These fees apply only to short-term listings and do not affect long-term rental calculations.
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Guest communications</h2>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Support email</label>
                <input
                  value={settings.supportEmail}
                  onChange={(event) => setSettings((prev) => ({ ...prev, supportEmail: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Support phone</label>
                <input
                  value={settings.supportPhone}
                  onChange={(event) => setSettings((prev) => ({ ...prev, supportPhone: event.target.value }))}
                  className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.sendBookingConfirmation}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, sendBookingConfirmation: event.target.checked }))
                    }
                  />
                  Send booking confirmation email
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.sendPaymentReceipt}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, sendPaymentReceipt: event.target.checked }))
                    }
                  />
                  Send payment received email
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.sendCheckInReminder}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, sendCheckInReminder: event.target.checked }))
                    }
                  />
                  Send check-in reminders
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.sendCheckOutReminder}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, sendCheckOutReminder: event.target.checked }))
                    }
                  />
                  Send check-out reminders
                </label>
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="rounded-xl bg-primary px-6 py-3 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Airbnb settings"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
