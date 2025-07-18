"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Bell, ArrowUpDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Notification {
  _id: string;
  userId: string;
  message: string;
  type: "Payment" | "Maintenance" | "Tenant" | "Other";
  createdAt: string;
  read: boolean;
}

interface SortConfig {
  key: keyof Notification;
  direction: "asc" | "desc";
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });

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
        setNotifications(data.notifications || []);
      } else {
        setError(data.message || "Failed to fetch notifications.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchNotifications();
    }
  }, [userId, role, fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/notifications/${notificationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ read: true }),
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

  const handleSort = useCallback((key: keyof Notification) => {
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
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setNotifications(sortedNotifications);
      return { key, direction };
    });
  }, [notifications]);

  const getSortIcon = useCallback((key: keyof Notification) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

  const openNotificationDetails = useCallback((notification: Notification) => {
    setSelectedNotification(notification);
    setIsModalOpen(true);
    if (!notification.read) {
      markAsRead(notification._id);
    }
  }, [markAsRead]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 md:px-10 lg:px-12 py-8 bg-gray-50 min-h-screen">
          <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <Bell className="text-[#1e3a8a]" />
            Notifications
          </h1>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1e3a8a]"></div>
              <span className="ml-2">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No notifications found.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("message")}
                    >
                      Message {getSortIcon("message")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("type")}
                    >
                      Type {getSortIcon("type")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("createdAt")}
                    >
                      Date {getSortIcon("createdAt")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("read")}
                    >
                      Status {getSortIcon("read")}
                    </th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr
                      key={n._id}
                      className={`border-t hover:bg-gray-50 transition cursor-pointer ${
                        n.read ? "bg-gray-50" : "bg-white font-semibold"
                      }`}
                      onClick={() => openNotificationDetails(n)}
                    >
                      <td className="px-4 py-3">{n.message}</td>
                      <td className="px-4 py-3">{n.type}</td>
                      <td className="px-4 py-3">{new Date(n.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            n.read ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {n.read ? "Read" : "Unread"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openNotificationDetails(n);
                          }}
                          className="text-[#1e3a8a] hover:text-[#1e40af] transition"
                          title="View Notification Details"
                          aria-label={`View details for notification ${n._id}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setSelectedNotification(null);
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    aria-label="Close notification details"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
}