"use client";
import { Plus } from "lucide-react";

interface NotificationsHeaderProps {
  viewMode: "sent" | "upcoming";
  setViewMode: (mode: "sent" | "upcoming") => void;
  onCreateNotification: () => void;
  onSendReminders?: () => void;
  isLoading: boolean;
  tenantsCount: number;
  csrfToken: string | null;
}

export default function NotificationsHeader({
  viewMode,
  setViewMode,
  onCreateNotification,
  onSendReminders,
  isLoading,
  tenantsCount,
  csrfToken,
}: NotificationsHeaderProps) {
  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-7">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Send reminders, track delivery, and manage tenant comms.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="flex bg-white/70 border border-white/60 rounded-full p-1">
            <button
              onClick={() => setViewMode("sent")}
              className={`flex-1 px-4 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all ${
                viewMode === "sent"
                  ? "bg-primary text-white shadow-md"
                  : "text-muted-foreground hover:bg-gray-100"
              }`}
            >
              Sent Reminders
            </button>
            <button
              onClick={() => setViewMode("upcoming")}
              className={`flex-1 px-4 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all ${
                viewMode === "upcoming"
                  ? "bg-primary text-white shadow-md"
                  : "text-muted-foreground hover:bg-gray-100"
              }`}
            >
              Upcoming Reminders
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCreateNotification}
              disabled={tenantsCount === 0 || !csrfToken}
              className="bg-gradient-to-r from-primary to-emerald-500 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold hover:scale-105 transition-transform shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Create Notification
            </button>

            {viewMode === "upcoming" && onSendReminders && (
              <button
                onClick={onSendReminders}
                disabled={isLoading}
                className="bg-[#1e3a8a] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1e3a8a]/90 transition-colors shadow-md disabled:opacity-50"
              >
                {isLoading ? "Sending..." : "Send Reminders Now"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




