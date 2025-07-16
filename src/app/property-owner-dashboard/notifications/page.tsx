
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertCircle, Send, Trash2 } from "lucide-react";
import Cookies from "js-cookie";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

// TypeScript Interfaces
interface Tenant {
  _id: string;
  name: string;
  propertyId: string;
  ownerId: string;
}

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  date: string;
  status: "read" | "unread";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod?: "app" | "sms"; // Placeholder for SMS integration
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Reusable Components
/** Notification Card Component */
const NotificationCard = ({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const typeStyles = {
    payment: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
    maintenance: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
    tenant: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    other: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
  };

  const style = typeStyles[notification.type];

  return (
    <div
      className={`p-4 mb-4 rounded-lg shadow-sm border ${style.border} ${style.bg} flex justify-between items-center animate-fade-in-up transition-all hover:shadow-md`}
    >
      <div className="flex items-center gap-3">
        <Bell size={20} className={style.text} />
        <div>
          <p className={`text-sm font-medium ${style.text}`}>
            {notification.message} <span className="text-gray-500">({notification.tenantName})</span>
          </p>
          <p className="text-xs text-gray-500">
            {new Date(notification.date).toLocaleString()} • {notification.deliveryMethod || "App"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {notification.status === "unread" && (
          <button
            onClick={() => onMarkAsRead(notification._id)}
            className="text-xs font-semibold text-[#03a678] hover:text-[#028a5f] transition-colors"
          >
            Mark as Read
          </button>
        )}
        <button
          onClick={() => onDelete(notification._id)}
          className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

/** NotificationsPage Component */
export default function NotificationsPage() {
  const router = useRouter();
  const [propertyOwnerId, setPropertyOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantId: "all",
    type: "other" as Notification["type"],
    sendViaSms: false, // Placeholder for SMS integration
  });

  /** Load authentication from cookies */
  useEffect(() => {
    const ownerId = Cookies.get("userId"); // Cookie name set by /api/signin
    const r = Cookies.get("role");
    if (!ownerId || r !== "propertyOwner") {
      router.replace("/");
      return;
    }
    setPropertyOwnerId(ownerId);
    setRole(r);
  }, [router]);

  /** Fetch tenants and notifications */
  useEffect(() => {
    if (!propertyOwnerId || role !== "propertyOwner") return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [tenantsRes, notificationsRes] = await Promise.all([
          fetch(`/api/tenants?userId=${encodeURIComponent(propertyOwnerId)}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch("/api/notifications", {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        if (!tenantsRes.ok || !notificationsRes.ok) {
          throw new Error(`HTTP error! Tenants: ${tenantsRes.status}, Notifications: ${notificationsRes.status}`);
        }

        const [tenantsData, notificationsData] = await Promise.all([
          tenantsRes.json() as Promise<ApiResponse<Tenant[]>>,
          notificationsRes.json() as Promise<ApiResponse<Notification[]>>,
        ]);

        if (!tenantsData.success || !notificationsData.success) {
          throw new Error(tenantsData.message || notificationsData.message || "Failed to fetch data");
        }

        setTenants(tenantsData.data || []);
        setNotifications(notificationsData.data || []);
      } catch (err) {
        console.error("Fetch data error:", err);
        setError("Failed to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [propertyOwnerId, role]);

  /** Handle sending new notification */
  const sendNotification = async () => {
    if (!newNotification.message.trim()) {
      setError("Message cannot be empty");
      return;
    }

    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: newNotification.message,
          tenantId: newNotification.tenantId,
          type: newNotification.type,
          deliveryMethod: newNotification.sendViaSms ? "sms" : "app", // Placeholder for SMS
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: ApiResponse<Notification> = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to send notification");
      }

      setNotifications((prev) => [data.data!, ...prev]);
      setNewNotification({ message: "", tenantId: "all", type: "other", sendViaSms: false });
    } catch (err) {
      console.error("Send notification error:", err);
      setError("Failed to send notification. Please try again.");
    }
  };

  /** Mark notification as read */
  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: ApiResponse<void> = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to mark notification as read");
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId ? { ...n, status: "read" } : n
        )
      );
    } catch (err) {
      console.error("Mark as read error:", err);
      setError("Failed to mark notification as read. Please try again.");
    }
  };

  /** Delete notification */
  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications?notificationId=${notificationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: ApiResponse<void> = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to delete notification");
      }

      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) {
      console.error("Delete notification error:", err);
      setError("Failed to delete notification. Please try again.");
    }
  };

  // Memoize notification cards to prevent unnecessary re-renders
  const notificationCards = useMemo(
    () =>
      notifications.map((notification) => (
        <NotificationCard
          key={notification._id}
          notification={notification}
          onMarkAsRead={markAsRead}
          onDelete={deleteNotification}
        />
      )),
    [notifications]
  );

  if (!propertyOwnerId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#03a678] border-solid"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {/* Header */}
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2 animate-fade-in">
            <Bell size={28} className="text-[#03a678]" />
            Tenant Notifications
          </h1>

          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm flex items-center gap-2 animate-fade-in">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {isLoading && (
            <div className="mb-6 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#03a678] border-solid"></div>
            </div>
          )}

          {/* Send Notification Form */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Send New Notification</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-fade-in">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
                  <select
                    value={newNotification.tenantId}
                    onChange={(e) =>
                      setNewNotification({ ...newNotification, tenantId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#03a678] transition-colors"
                  >
                    <option value="all">All Tenants</option>
                    {tenants.map((tenant) => (
                      <option key={tenant._id} value={tenant._id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newNotification.type}
                    onChange={(e) =>
                      setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#03a678] transition-colors"
                  >
                    <option value="payment">Payment Reminder</option>
                    <option value="maintenance">Maintenance Alert</option>
                    <option value="tenant">Tenant Issue</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={newNotification.message}
                    onChange={(e) =>
                      setNewNotification({ ...newNotification, message: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#03a678] transition-colors"
                    rows={4}
                    placeholder="Enter your message..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newNotification.sendViaSms}
                    onChange={(e) =>
                      setNewNotification({ ...newNotification, sendViaSms: e.target.checked })
                    }
                    className="h-4 w-4 text-[#03a678] border-gray-300 rounded focus:ring-[#03a678]"
                    disabled // Placeholder for future SMS integration
                  />
                  <label className="text-sm text-gray-700">Send via SMS (Coming Soon)</label>
                </div>
                <button
                  onClick={sendNotification}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-[#03a678] text-white rounded-lg hover:bg-[#028a5f] transition-colors"
                >
                  <Send size={16} />
                  Send Notification
                </button>
              </div>
            </div>
          </section>

          {/* Notifications List */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Sent Notifications</h2>
            {notifications.length === 0 && !isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-gray-600 text-center animate-fade-in">
                No notifications sent. Start by sending a new notification above.
              </div>
            ) : (
              <div className="space-y-4">{notificationCards}</div>
            )}
          </section>
        </main>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}