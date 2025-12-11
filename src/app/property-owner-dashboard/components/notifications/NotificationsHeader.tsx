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
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-bold text-[#012a4a]">Notifications</h1>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode("sent")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === "sent"
                  ? "bg-[#03a678] text-white shadow-md"
                  : "text-[#012a4a] hover:bg-gray-200"
              }`}
            >
              Sent Reminders
            </button>
            <button
              onClick={() => setViewMode("upcoming")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                viewMode === "upcoming"
                  ? "bg-[#03a678] text-white shadow-md"
                  : "text-[#012a4a] hover:bg-gray-200"
              }`}
            >
              Upcoming Reminders
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCreateNotification}
              disabled={tenantsCount === 0 || !csrfToken}
              className="bg-gradient-to-r from-[#03a678] to-[#02956a] text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              Create Notification
            </button>

            {viewMode === "upcoming" && onSendReminders && (
              <button
                onClick={onSendReminders}
                disabled={isLoading}
                className="bg-[#012a4a] text-white px-5 py-2.5 rounded-xl hover:bg-[#012a4a]/90 transition-colors shadow-md disabled:opacity-50"
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