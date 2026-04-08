"use client";

import { Settings, Bell, Shield, Users } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";

export default function AirbnbSettingsPage() {
  const { hasAccess } = useAirbnbAccess("settings:view");

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
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Settings"
            subtitle="Configure team roles, notifications, and automation defaults."
            icon={Settings}
          />

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-sm sm:text-base font-semibold text-foreground">Team roles</h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Define permissions for managers, cleaners, and accountants.
              </p>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Manage access
              </button>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-sm sm:text-base font-semibold text-foreground">Notifications</h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Control email, SMS, and WhatsApp alerts for guests and staff.
              </p>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Update alerts
              </button>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-sm sm:text-base font-semibold text-foreground">Security</h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enforce OTP, audit logs, and device access policies.
              </p>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Review security
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
