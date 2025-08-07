"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Bell, ArrowUpDown, Plus, Send, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Tenant {
  _id: string;
  name: string;
  phone: string;
  email: string;
}

interface Notification {
  _id: string;
  userId: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  deliveryMethod: "app" | "sms" | "email" | "both";
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantId: "",
    type: "other" as Notification["type"],
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
        setNewNotification((prev) => ({
          ...prev,
          tenantId: data.tenants?.length > 0 ? "all" : "",
        }));
      } else {
        setError(data.message || "Failed to fetch tenants.");
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

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      setIsLoading(true);
      const previousNotifications = notifications;
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      try {
        const res = await fetch(`/api/notifications?notificationId=${encodeURIComponent(notificationId)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        const data = await res.json();
        if (!data.success) {
          setNotifications(previousNotifications);
          setError(data.message || "Failed to delete notification.");
        }
      } catch {
        setNotifications(previousNotifications);
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
        setIsDeleteModalOpen(false);
        setNotificationToDelete(null);
      }
    },
    [notifications]
  );

  const createNotification = async () => {
    if (!newNotification.tenantId) {
      setError("Please select a tenant or 'All Tenants' to send the notification.");
      return;
    }
    if (!newNotification.type || !["payment", "maintenance", "tenant", "other"].includes(newNotification.type)) {
      setError("Please select a valid notification type.");
      return;
    }
    if (!newNotification.deliveryMethod || !["app", "sms", "email", "both"].includes(newNotification.deliveryMethod)) {
      setError("Please select a valid delivery method.");
      return;
    }
    if (newNotification.type !== "payment" && !newNotification.message.trim()) {
      setError("Please enter a message for non-payment notifications.");
      return;
    }
    setIsLoading(true);
    const payload = { ...newNotification, userId };
    console.log("Sending notification payload:", payload);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => [data.data, ...prev]);
        setIsCreateModalOpen(false);
        setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
        setCurrentPage(1); // Reset to first page on new notification
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

  const openNotificationDetails = useCallback((notification: Notification) => {
    setSelectedNotification(notification);
    setIsModalOpen(true);
  }, []);

  const openDeleteConfirmation = useCallback((notificationId: string) => {
    setNotificationToDelete(notificationId);
    setIsDeleteModalOpen(true);
  }, []);

  // Pagination logic
  const totalPages = Math.ceil(notifications.length / pageSize);
  const paginatedNotifications = notifications.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setCurrentPage(1); // Reset to first page when page size changes
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
          <motion.div
            className="flex justify-between items-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl font-bold flex items-center gap-3 text-[#012a4a]">
              <Bell className="text-[#03a678] h-8 w-8" />
              Notifications
            </h1>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-gradient-to-r from-[#03a678] to-[#02956a] text-white px-5 py-3 rounded-xl flex items-center gap-2 transition-transform transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={tenants.length === 0}
            >
              <Plus size={18} />
              Create Notification
            </button>
          </motion.div>
          {error && (
            <motion.div
              className="bg-red-50 text-red-600 p-4 mb-6 rounded-xl shadow-sm border border-red-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          {isLoading ? (
            <motion.div
              className="text-center text-[#012a4a]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#03a678]"></div>
              <span className="ml-3 text-lg">Loading notifications...</span>
            </motion.div>
          ) : notifications.length === 0 ? (
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-[#012a4a] text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-lg font-medium">No notifications found.</p>
              <p className="text-sm text-gray-500 mt-2">Create a new notification to get started.</p>
            </motion.div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-sm">
                <thead>
                  <tr className="bg-gray-50 text-[#012a4a] text-left text-sm font-semibold">
                    {["message", "type", "tenantName", "createdAt", "deliveryMethod"].map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort(key as keyof Notification)}
                      >
                        {key === "tenantName"
                          ? "Tenant"
                          : key === "createdAt"
                          ? "Date"
                          : key === "deliveryMethod"
                          ? "Delivery"
                          : key.charAt(0).toUpperCase() + key.slice(1)}
                        {getSortIcon(key as keyof Notification)}
                      </th>
                    ))}
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedNotifications.map((n, index) => (
                    <motion.tr
                      key={n._id}
                      className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      onClick={() => openNotificationDetails(n)}
                    >
                      <td className="px-4 py-3 text-sm text-[#012a4a] truncate max-w-xs">{n.message}</td>
                      <td className="px-4 py-3 text-sm text-[#012a4a]">
                        {n.type.charAt(0).toUpperCase() + n.type.slice(1)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#012a4a]">{n.tenantName}</td>
                      <td className="px-4 py-3 text-sm text-[#012a4a]">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#012a4a]">
                        {n.deliveryMethod === "both"
                          ? "SMS & Email"
                          : n.deliveryMethod === "sms"
                          ? `SMS (${n.deliveryStatus || "Pending"})`
                          : n.deliveryMethod === "email"
                          ? "Email"
                          : "App"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteConfirmation(n._id);
                          }}
                          className="text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#012a4a]">Items per page:</span>
                  <select
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-[#012a4a] text-sm focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-200 text-[#012a4a] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm text-[#012a4a]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-200 text-[#012a4a] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-8 flex gap-6">
            {["message", "type", "tenantName", "createdAt", "deliveryMethod"].map((key) => (
              <button
                key={key}
                onClick={() => handleSort(key as keyof Notification)}
                className="text-sm font-medium text-[#012a4a] hover:text-[#03a678] flex items-center gap-1 transition-colors"
              >
                Sort by{" "}
                {key === "tenantName"
                  ? "Tenant"
                  : key === "createdAt"
                  ? "Date"
                  : key === "deliveryMethod"
                  ? "Delivery"
                  : key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                {getSortIcon(key as keyof Notification)}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {isModalOpen && (
              <Modal
                title="Notification Details"
                isOpen={isModalOpen}
                onClose={() => {
                  setIsModalOpen(false);
                  setSelectedNotification(null);
                }}
              >
                {selectedNotification && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-[#012a4a]">Message</label>
                      <p className="w-full border border-gray-200 px-4 py-3 rounded-lg bg-gray-50 text-[#012a4a]">
                        {selectedNotification.message}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#012a4a]">Type</label>
                      <p className="w-full border border-gray-200 px-4 py-3 rounded-lg bg-gray-50 text-[#012a4a]">
                        {selectedNotification.type.charAt(0).toUpperCase() + selectedNotification.type.slice(1)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#012a4a]">Tenant</label>
                      <p className="w-full border border-gray-200 px-4 py-3 rounded-lg bg-gray-50 text-[#012a4a]">
                        {selectedNotification.tenantName}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#012a4a]">Date</label>
                      <p className="w-full border border-gray-200 px-4 py-3 rounded-lg bg-gray-50 text-[#012a4a]">
                        {new Date(selectedNotification.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#012a4a]">Delivery Method</label>
                      <p className="w-full border border-gray-200 px-4 py-3 rounded-lg bg-gray-50 text-[#012a4a]">
                        {selectedNotification.deliveryMethod === "both"
                          ? "SMS & Email"
                          : selectedNotification.deliveryMethod === "sms"
                          ? `SMS (${selectedNotification.deliveryStatus || "Pending"})`
                          : selectedNotification.deliveryMethod === "email"
                          ? "Email"
                          : "App"}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setIsModalOpen(false);
                          setSelectedNotification(null);
                        }}
                        className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </Modal>
            )}
            {isCreateModalOpen && (
              <Modal
                title="Create Notification"
                isOpen={isCreateModalOpen}
                onClose={() => {
                  setIsCreateModalOpen(false);
                  setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
                }}
              >
                <div className="space-y-5">
                  {tenants.length === 0 && (
                    <div className="bg-yellow-50 text-yellow-700 p-4 rounded-lg border border-yellow-200">
                      No tenants available. Please add tenants to send notifications.
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-[#012a4a]">Message</label>
                    <textarea
                      value={newNotification.message}
                      onChange={(e) =>
                        setNewNotification({ ...newNotification, message: e.target.value })
                      }
                      className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] placeholder-gray-400"
                      placeholder="Enter notification message"
                      rows={4}
                      maxLength={160}
                      disabled={newNotification.type === "payment"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#012a4a]">Tenant</label>
                    <select
                      value={newNotification.tenantId}
                      onChange={(e) =>
                        setNewNotification({ ...newNotification, tenantId: e.target.value })
                      }
                      className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] disabled:bg-gray-50 disabled:cursor-not-allowed"
                      disabled={tenants.length === 0}
                    >
                      {tenants.length > 0 && <option value="all">All Tenants</option>}
                      {tenants.map((tenant) => (
                        <option key={tenant._id} value={tenant._id}>
                          {tenant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#012a4a]">Type</label>
                    <select
                      value={newNotification.type}
                      onChange={(e) =>
                        setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })
                      }
                      className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a]"
                    >
                      <option value="payment">Payment</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="tenant">Tenant</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#012a4a]">Delivery Method</label>
                    <select
                      value={newNotification.deliveryMethod}
                      onChange={(e) =>
                        setNewNotification({ ...newNotification, deliveryMethod: e.target.value as Notification["deliveryMethod"] })
                      }
                      className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a]"
                    >
                      <option value="app">App</option>
                      <option value="sms">SMS Only</option>
                      <option value="email">Email Only</option>
                      <option value="both">SMS & Email</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setIsCreateModalOpen(false);
                        setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
                      }}
                      className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createNotification}
                      className="px-5 py-2 bg-gradient-to-r from-[#03a678] to-[#02956a] text-white rounded-lg flex items-center gap-2 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading || !newNotification.tenantId || !newNotification.type || !newNotification.deliveryMethod || (newNotification.type !== "payment" && !newNotification.message.trim()) || (["sms", "both"].includes(newNotification.deliveryMethod) && !tenants.some(t => t.phone)) || (["email", "both"].includes(newNotification.deliveryMethod) && !tenants.some(t => t.email))}
                    >
                      <Send size={18} />
                      {isLoading ? "Sending..." : "Send Notification"}
                    </button>
                  </div>
                </div>
              </Modal>
            )}
            {isDeleteModalOpen && (
              <Modal
                title="Confirm Deletion"
                isOpen={isDeleteModalOpen}
                onClose={() => {
                  setIsDeleteModalOpen(false);
                  setNotificationToDelete(null);
                }}
              >
                <div className="space-y-5">
                  <p className="text-[#012a4a] text-sm">
                    Are you sure you want to delete this notification? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setIsDeleteModalOpen(false);
                        setNotificationToDelete(null);
                      }}
                      className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => notificationToDelete && deleteNotification(notificationToDelete)}
                      className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      Delete
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </AnimatePresence>
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        table {
          width: 100%;
          table-layout: auto;
        }
        th, td {
          text-align: left;
          vertical-align: middle;
        }
      `}</style>
    </div>
  );
}