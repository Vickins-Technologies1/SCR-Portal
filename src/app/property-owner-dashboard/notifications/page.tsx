"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Bell, ArrowUpDown, Plus, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Tenant {
  _id: string;
  name: string;
  phone: string;
}

interface Notification {
  _id: string;
  userId: string;
  message: string;
  type: "Payment" | "Maintenance" | "Tenant" | "Other";
  createdAt: string;
  read: boolean;
  deliveryMethod: "app" | "sms";
  deliveryStatus?: "pending" | "success" | "failed";
  tenantId: string;
  tenantName: string;
}

interface SortConfig {
  key: keyof Notification;
  direction: "asc" | "desc";
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantId: "all",
    type: "Other" as Notification["type"],
    deliveryMethod: "app" as Notification["deliveryMethod"],
  });

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
    }
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId!)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data || []);
      } else {
        setError(data.message || "Failed to fetch notifications.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchTenants = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/tenants?ownerId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setTenants(data.tenants || []);
      }
    } catch {
      setError("Failed to fetch tenants.");
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchNotifications();
      fetchTenants();
    }
  }, [userId, role, fetchNotifications, fetchTenants]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ notificationId, action: "mark-read" }),
        });
        const data = await res.json();
        if (data.success) {
          setNotifications((prev) =>
            prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n))
          );
        } else {
          setError(data.message || "Failed to mark notification as read.");
        }
      } catch {
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const createNotification = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...newNotification, userId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => [data.data, ...prev]);
        setIsCreateModalOpen(false);
        setNewNotification({ message: "", tenantId: "all", type: "Other", deliveryMethod: "app" });
      } else {
        setError(data.message || "Failed to create notification.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = useCallback(
    (key: keyof Notification) => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
        const sortedNotifications = [...notifications].sort((a, b) => {
          if (key === "createdAt") {
            return direction === "asc"
              ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
              : new Date(b[key]).getTime() - new Date(a[key]).getTime();
          }
          if (key === "read") {
            return direction === "asc"
              ? Number(a[key]) - Number(b[key])
              : Number(b[key]) - Number(a[key]);
          }
          return direction === "asc"
            ? String(a[key]).localeCompare(String(b[key]))
            : String(b[key]).localeCompare(String(a[key]));
        });
        setNotifications(sortedNotifications);
        return { key, direction };
      });
    },
    [notifications]
  );

  const getSortIcon = useCallback(
    (key: keyof Notification) => {
      if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
      return sortConfig.direction === "asc" ? (
        <span className="inline ml-1">↑</span>
      ) : (
        <span className="inline ml-1">↓</span>
      );
    },
    [sortConfig]
  );

  const openNotificationDetails = useCallback(
    (notification: Notification) => {
      setSelectedNotification(notification);
      setIsModalOpen(true);
      if (!notification.read) {
        markAsRead(notification._id);
      }
    },
    [markAsRead]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <motion.div
            className="flex justify-between items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Bell className="text-[#012a4a]" />
              Notifications
            </h1>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-[#03a678] hover:bg-[#02956a] text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={16} />
              Create Notification
            </button>
          </motion.div>
          {error && (
            <motion.div
              className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          {isLoading ? (
            <motion.div
              className="text-center text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading notifications...</span>
            </motion.div>
          ) : notifications.length === 0 ? (
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              No notifications found.
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {notifications.map((n, index) => (
                <motion.div
                  key={n._id}
                  className={`bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow cursor-pointer ${
                    n.read ? "opacity-80" : ""
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  onClick={() => openNotificationDetails(n)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{n.message}</h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        n.read ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {n.read ? "Read" : "Unread"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Type: {n.type}</p>
                  <p className="text-xs text-gray-500">Tenant: {n.tenantName}</p>
                  <p className="text-xs text-gray-500">
                    Date: {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    Delivery: {n.deliveryMethod === "sms" ? `SMS (${n.deliveryStatus || "Pending"})` : "App"}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => handleSort("message")}
              className="text-sm text-[#012a4a] hover:text-[#03a678] flex items-center gap-1"
            >
              Sort by Message {getSortIcon("message")}
            </button>
            <button
              onClick={() => handleSort("type")}
              className="text-sm text-[#012a4a] hover:text-[#03a678] flex items-center gap-1"
            >
              Sort by Type {getSortIcon("type")}
            </button>
            <button
              onClick={() => handleSort("createdAt")}
              className="text-sm text-[#012a4a] hover:text-[#03a678] flex items-center gap-1"
            >
              Sort by Date {getSortIcon("createdAt")}
            </button>
            <button
              onClick={() => handleSort("read")}
              className="text-sm text-[#012a4a] hover:text-[#03a678] flex items-center gap-1"
            >
              Sort by Status {getSortIcon("read")}
            </button>
          </div>
          <Modal
            title="Notification Details"
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedNotification(null);
            }}
          >
            {selectedNotification && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Message</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {selectedNotification.message}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {selectedNotification.type}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tenant</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {selectedNotification.tenantName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <p className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100">
                    {new Date(selectedNotification.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p
                    className={`w-full border px-3 py-2 rounded-lg ${
                      selectedNotification.read
                        ? "bg-gray-100 text-gray-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {selectedNotification.read ? "Read" : "Unread"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Delivery Method</label>
                  <p className="w-full border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedNotification.deliveryMethod === "sms"
                      ? `SMS (${selectedNotification.deliveryStatus || "Pending"})`
                      : "App"}
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setSelectedNotification(null);
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </Modal>
          <Modal
            title="Create Notification"
            isOpen={isCreateModalOpen}
            onClose={() => {
              setIsCreateModalOpen(false);
              setNewNotification({ message: "", tenantId: "all", type: "Other", deliveryMethod: "app" });
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Message</label>
                <textarea
                  value={newNotification.message}
                  onChange={(e) =>
                    setNewNotification({ ...newNotification, message: e.target.value })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
                  placeholder="Enter notification message"
                  rows={4}
                  maxLength={160}
                  disabled={newNotification.type === "Payment"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tenant</label>
                <select
                  value={newNotification.tenantId}
                  onChange={(e) =>
                    setNewNotification({ ...newNotification, tenantId: e.target.value })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={newNotification.type}
                  onChange={(e) =>
                    setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
                >
                  <option value="Payment">Payment</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Tenant">Tenant</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Delivery Method</label>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">App</span>
                    <div
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        newNotification.deliveryMethod === "app" ? "bg-[#03a678]" : "bg-gray-300"
                      }`}
                      onClick={() => setNewNotification({ ...newNotification, deliveryMethod: "app" })}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          newNotification.deliveryMethod === "app" ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </div>
                    <span className="text-sm text-gray-600">SMS</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setNewNotification({ message: "", tenantId: "all", type: "Other", deliveryMethod: "app" });
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createNotification}
                  className="px-4 py-2 bg-[#03a678] hover:bg-[#02956a] text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                  disabled={isLoading || (newNotification.deliveryMethod === "sms" && !tenants.length)}
                >
                  <Send size={16} />
                  {isLoading ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </div>
          </Modal>
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