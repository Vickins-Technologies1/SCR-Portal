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
  propertyId: string;
  unitType?: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  houseNumber: string;
}

interface Property {
  _id: string;
  ownerId: string;
  name: string;
  rentPaymentDate: number;
  unitTypes: Array<{ type: string; price: number }>;
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

interface Payment {
  _id: string;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
}

interface UpcomingReminder {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  houseNumber: string;
  rentDue: number;
  utilityDue: number;
  depositDue: number;
  totalDue: number;
  dueDate: string;
  reminderType: "fiveDaysBefore" | "paymentDate";
}

interface SortConfig {
  key: keyof Notification | keyof UpcomingReminder;
  direction: "asc" | "desc";
}

type NumericReminderKeys = "rentDue" | "utilityDue" | "depositDue" | "totalDue";

export default function NotificationsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"sent" | "upcoming">("sent");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<UpcomingReminder | null>(null);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [csrfToken, setCsrfToken] = useState<string | null>(null); // New state for CSRF token

  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantId: "",
    type: "other" as Notification["type"],
    deliveryMethod: "app" as Notification["deliveryMethod"],
  });

  // Fetch CSRF token
  const fetchCsrfToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
      } else {
        setError("Failed to fetch CSRF token.");
      }
    } catch {
      setError("Failed to connect to the server for CSRF token.");
    }
  }, []);

  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
    } else {
      fetchCsrfToken(); // Fetch CSRF token when userId is available
    }
  }, [router, fetchCsrfToken]);

  const fetchNotifications = useCallback(async () => {
    if (!csrfToken) return; // Wait for CSRF token
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId!)}&type=payment`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
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
  }, [userId, csrfToken]);

  const fetchTenantsAndProperties = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const [tenantsRes, propertiesRes] = await Promise.all([
        fetch(`/api/tenants?ownerId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        }),
        fetch(`/api/properties?ownerId=${encodeURIComponent(userId)}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        }),
      ]);

      const tenantsData = await tenantsRes.json();
      const propertiesData = await propertiesRes.json();

      if (tenantsData.success && propertiesData.success) {
        setTenants(tenantsData.tenants || []);
        setNewNotification((prev) => ({
          ...prev,
          tenantId: tenantsData.tenants?.length > 0 ? "all" : "",
        }));

        // Calculate upcoming reminders
        const currentDate = new Date("2025-08-07T12:32:00+03:00");
        const reminders: UpcomingReminder[] = [];
        for (const tenant of tenantsData.tenants || []) {
          const property = (propertiesData.properties || []).find(
            (p: Property) => p._id === tenant.propertyId
          );
          if (!property) continue;

          const leaseStartDate = new Date(tenant.leaseStartDate);
          if (leaseStartDate > currentDate) continue;

          const unit = property.unitTypes.find((u: { type: string }) => u.type === tenant.unitType);
          const rentAmount = unit ? unit.price : tenant.price;
          const depositAmount = tenant.deposit || 0;
          const utilityAmount = 1000; // Placeholder

          // Fetch payments
          const paymentsRes = await fetch(
            `/api/payments?tenantId=${encodeURIComponent(tenant._id)}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
              },
              credentials: "include",
            }
          );
          const paymentsData = await paymentsRes.json();
          if (!paymentsData.success) {
            console.error(`Failed to fetch payments for tenant ${tenant._id}: ${paymentsData.message}`);
            continue; // Skip to the next tenant if payment fetch fails
          }
          const payments: Payment[] = paymentsData.payments || [];

          const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

          const rentPayments = payments
            .filter((p: Payment) => p.type === "Rent" && p.status === "completed" && new Date(p.paymentDate) >= startOfMonth && new Date(p.paymentDate) <= endOfMonth)
            .reduce((sum: number, p: Payment) => sum + p.amount, 0);
          const utilityPayments = payments
            .filter((p: Payment) => p.type === "Utility" && p.status === "completed" && new Date(p.paymentDate) >= startOfMonth && new Date(p.paymentDate) <= endOfMonth)
            .reduce((sum: number, p: Payment) => sum + p.amount, 0);
          const depositPayments = payments
            .filter((p: Payment) => p.type === "Deposit" && p.status === "completed")
            .reduce((sum: number, p: Payment) => sum + p.amount, 0);

          const rentDue = Math.max(0, rentAmount - rentPayments);
          const utilityDue = Math.max(0, utilityAmount - utilityPayments);
          const depositDue = Math.max(0, depositAmount - depositPayments);

          const totalDue = rentDue + utilityDue + depositDue;
          if (totalDue <= 0) continue;

          const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), property.rentPaymentDate);
          const formattedDueDate = dueDate.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });

          const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
          const fiveDaysBefore = property.rentPaymentDate - 5;
          const adjustedFiveDaysBefore = fiveDaysBefore <= 0 ? fiveDaysBefore + daysInMonth : fiveDaysBefore;
          const reminderType = currentDate.getDate() === property.rentPaymentDate ? "paymentDate" : currentDate.getDate() === adjustedFiveDaysBefore ? "fiveDaysBefore" : null;

          if (reminderType) {
            reminders.push({
              tenantId: tenant._id,
              tenantName: tenant.name,
              propertyName: property.name,
              houseNumber: tenant.houseNumber,
              rentDue,
              utilityDue,
              depositDue,
              totalDue,
              dueDate: formattedDueDate,
              reminderType,
            });
          }
        }
        setUpcomingReminders(reminders);
      } else {
        setError(tenantsData.message || propertiesData.message || "Failed to fetch tenants or properties.");
      }
    } catch (err) {
      console.error("Error fetching tenants or properties:", err);
      setError("Failed to fetch tenants or properties.");
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      fetchNotifications();
      fetchTenantsAndProperties();
    }
  }, [userId, role, csrfToken, fetchNotifications, fetchTenantsAndProperties]);

  const triggerReminders = async () => {
    if (!csrfToken) {
      setError("CSRF token is missing.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => [...(data.data || []), ...prev]);
        setError(null);
        await fetchTenantsAndProperties();
      } else {
        setError(data.message || "Failed to trigger reminders.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!csrfToken) {
        setError("CSRF token is missing.");
        return;
      }
      setIsLoading(true);
      const previousNotifications = notifications;
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      try {
        const res = await fetch(`/api/notifications?notificationId=${encodeURIComponent(notificationId)}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
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
    [notifications, csrfToken]
  );

  const createNotification = async () => {
    if (!csrfToken) {
      setError("CSRF token is missing.");
      return;
    }
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
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => [data.data, ...prev]);
        setIsCreateModalOpen(false);
        setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
        setCurrentPage(1);
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
    (key: keyof Notification | keyof UpcomingReminder) => {
      setSortConfig((prev) => {
        const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
        if (viewMode === "sent") {
          const validKey = key as keyof Notification;
          const sortedNotifications = [...notifications].sort((a, b) => {
            if (validKey === "createdAt") {
              return direction === "asc"
                ? new Date(a[validKey]).getTime() - new Date(b[validKey]).getTime()
                : new Date(b[validKey]).getTime() - new Date(a[validKey]).getTime();
            }
            return direction === "asc"
              ? String(a[validKey]).localeCompare(String(b[validKey]))
              : String(b[validKey]).localeCompare(String(a[validKey]));
          });
          setNotifications(sortedNotifications);
        } else {
          const validKey = key as keyof UpcomingReminder;
          const sortedReminders = [...upcomingReminders].sort((a, b) => {
            if (validKey === "dueDate") {
              return direction === "asc"
                ? new Date(a[validKey]).getTime() - new Date(b[validKey]).getTime()
                : new Date(b[validKey]).getTime() - new Date(a[validKey]).getTime();
            }
            if (["rentDue", "utilityDue", "depositDue", "totalDue"].includes(validKey)) {
              const numericKey = validKey as NumericReminderKeys;
              return direction === "asc"
                ? a[numericKey] - b[numericKey]
                : b[numericKey] - a[numericKey];
            }
            return direction === "asc"
              ? String(a[validKey]).localeCompare(String(b[validKey]))
              : String(b[validKey]).localeCompare(String(a[validKey]));
          });
          setUpcomingReminders(sortedReminders);
        }
        return { key, direction };
      });
    },
    [notifications, upcomingReminders, viewMode]
  );

  const getSortIcon = useCallback(
    (key: keyof Notification | keyof UpcomingReminder) => {
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
    setSelectedReminder(null);
    setIsModalOpen(true);
  }, []);

  const openReminderDetails = useCallback((reminder: UpcomingReminder) => {
    setSelectedReminder(reminder);
    setSelectedNotification(null);
    setIsModalOpen(true);
  }, []);

  const openDeleteConfirmation = useCallback((notificationId: string) => {
    setNotificationToDelete(notificationId);
    setIsDeleteModalOpen(true);
  }, []);

  // Pagination logic
  const totalPages = Math.ceil(
    (viewMode === "sent" ? notifications.length : upcomingReminders.length) / pageSize
  );
  const paginatedItems = (viewMode === "sent" ? notifications : upcomingReminders).slice(
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
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
          <motion.div
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3 text-[#012a4a]">
              <Bell className="text-[#03a678] h-6 w-6 sm:h-8 sm:w-8" />
              Notifications
            </h1>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex rounded-lg border border-gray-200 bg-white p-1 w-full sm:w-auto">
                <button
                  onClick={() => setViewMode("sent")}
                  className={`flex-1 sm:flex-none px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    viewMode === "sent"
                      ? "bg-[#03a678] text-white"
                      : "bg-white text-[#012a4a] hover:bg-gray-100"
                  }`}
                >
                  Sent Reminders
                </button>
                <button
                  onClick={() => setViewMode("upcoming")}
                  className={`flex-1 sm:flex-none px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    viewMode === "upcoming"
                      ? "bg-[#03a678] text-white"
                      : "bg-white text-[#012a4a] hover:bg-gray-100"
                  }`}
                >
                  Upcoming Reminders
                </button>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex-1 sm:flex-none bg-gradient-to-r from-[#03a678] to-[#02956a] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  disabled={tenants.length === 0 || !csrfToken}
                >
                  <Plus size={16} />
                  Create Notification
                </button>
                {viewMode === "upcoming" && (
                  <button
                    onClick={triggerReminders}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-[#02956a] to-[#017b58] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    disabled={isLoading || upcomingReminders.length === 0 || !csrfToken}
                  >
                    <Send size={16} />
                    {isLoading ? "Sending..." : "Send Reminders Now"}
                  </button>
                )}
              </div>
            </div>
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
              <div className="inline-block animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-t-2 border-b-2 border-[#03a678]"></div>
              <span className="ml-3 text-base sm:text-lg">Loading...</span>
            </motion.div>
          ) : (viewMode === "sent" ? notifications.length : upcomingReminders.length) === 0 ? (
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 shadow-sm text-[#012a4a] text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-base sm:text-lg font-medium">
                {viewMode === "sent" ? "No sent reminders found." : "No upcoming reminders found."}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {viewMode === "sent" ? "Create a new notification to get started." : "Check back later or add tenants to see upcoming reminders."}
              </p>
            </motion.div>
          ) : (
            <div className="overflow-x-auto">
              <div className="hidden sm:block">
                <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[#012a4a] text-left text-xs sm:text-sm font-semibold">
                      {viewMode === "sent"
                        ? (["message", "type", "tenantName", "createdAt", "deliveryMethod"] as (keyof Notification)[]).map((key) => (
                            <th
                              key={key}
                              className="px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(key)}
                            >
                              {key === "tenantName"
                                ? "Tenant"
                                : key === "createdAt"
                                ? "Date"
                                : key === "deliveryMethod"
                                ? "Delivery"
                                : key.charAt(0).toUpperCase() + key.slice(1)}
                              {getSortIcon(key)}
                            </th>
                          ))
                        : (["tenantName", "propertyName", "rentDue", "utilityDue", "depositDue", "totalDue", "dueDate"] as (keyof UpcomingReminder)[]).map((key) => (
                            <th
                              key={key}
                              className="px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(key)}
                            >
                              {key === "tenantName"
                                ? "Tenant"
                                : key === "propertyName"
                                ? "Property"
                                : key === "rentDue"
                                ? "Rent Due"
                                : key === "utilityDue"
                                ? "Utilities Due"
                                : key === "depositDue"
                                ? "Deposit Due"
                                : key === "totalDue"
                                ? "Total Due"
                                : "Due Date"}
                              {getSortIcon(key)}
                            </th>
                          ))}
                      <th className="px-2 sm:px-4 py-2 sm:py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item, index) => (
                      <motion.tr
                        key={viewMode === "sent" ? (item as Notification)._id : `${(item as UpcomingReminder).tenantId}-${index}`}
                        className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        onClick={() =>
                          viewMode === "sent"
                            ? openNotificationDetails(item as Notification)
                            : openReminderDetails(item as UpcomingReminder)
                        }
                      >
                        {viewMode === "sent" ? (
                          <>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a] truncate max-w-[150px] sm:max-w-xs">
                              {(item as Notification).message}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as Notification).type.charAt(0).toUpperCase() + (item as Notification).type.slice(1)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as Notification).tenantName}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {new Date((item as Notification).createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as Notification).deliveryMethod === "both"
                                ? "SMS & Email"
                                : (item as Notification).deliveryMethod === "sms"
                                ? `SMS (${(item as Notification).deliveryStatus || "Pending"})`
                                : (item as Notification).deliveryMethod === "email"
                                ? "Email"
                                : "App"}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteConfirmation((item as Notification)._id);
                                }}
                                className="text-red-600 hover:text-red-800 flex items-center gap-1"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as UpcomingReminder).tenantName}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as UpcomingReminder).propertyName}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              Ksh. {(item as UpcomingReminder).rentDue.toFixed(2)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              Ksh. {(item as UpcomingReminder).utilityDue.toFixed(2)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              Ksh. {(item as UpcomingReminder).depositDue.toFixed(2)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              Ksh. {(item as UpcomingReminder).totalDue.toFixed(2)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as UpcomingReminder).dueDate}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm"></td>
                          </>
                        )}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden space-y-4">
                {paginatedItems.map((item, index) => (
                  <motion.div
                    key={viewMode === "sent" ? (item as Notification)._id : `${(item as UpcomingReminder).tenantId}-${index}`}
                    className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    onClick={() =>
                      viewMode === "sent"
                        ? openNotificationDetails(item as Notification)
                        : openReminderDetails(item as UpcomingReminder)
                    }
                  >
                    {viewMode === "sent" ? (
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Message: </span>
                          <span className="text-[#012a4a] text-sm truncate">{(item as Notification).message}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Type: </span>
                          <span className="text-[#012a4a] text-sm">
                            {(item as Notification).type.charAt(0).toUpperCase() + (item as Notification).type.slice(1)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Tenant: </span>
                          <span className="text-[#012a4a] text-sm">{(item as Notification).tenantName}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Date: </span>
                          <span className="text-[#012a4a] text-sm">
                            {new Date((item as Notification).createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Delivery: </span>
                          <span className="text-[#012a4a] text-sm">
                            {(item as Notification).deliveryMethod === "both"
                              ? "SMS & Email"
                              : (item as Notification).deliveryMethod === "sms"
                              ? `SMS (${(item as Notification).deliveryStatus || "Pending"})`
                              : (item as Notification).deliveryMethod === "email"
                              ? "Email"
                              : "App"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteConfirmation((item as Notification)._id);
                          }}
                          className="text-red-600 hover:text-red-800 flex items-center gap-1 text-sm mt-2"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Tenant: </span>
                          <span className="text-[#012a4a] text-sm">{(item as UpcomingReminder).tenantName}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Property: </span>
                          <span className="text-[#012a4a] text-sm">{(item as UpcomingReminder).propertyName}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Rent Due: </span>
                          <span className="text-[#012a4a] text-sm">Ksh. {(item as UpcomingReminder).rentDue.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Utilities Due: </span>
                          <span className="text-[#012a4a] text-sm">Ksh. {(item as UpcomingReminder).utilityDue.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Deposit Due: </span>
                          <span className="text-[#012a4a] text-sm">Ksh. {(item as UpcomingReminder).depositDue.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Total Due: </span>
                          <span className="text-[#012a4a] text-sm">Ksh. {(item as UpcomingReminder).totalDue.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Due Date: </span>
                          <span className="text-[#012a4a] text-sm">{(item as UpcomingReminder).dueDate}</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
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
                    className="px-2 py-1 bg-gray-200 text-[#012a4a] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-[#012a4a]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 bg-gray-200 text-[#012a4a] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-4">
            {viewMode === "sent"
              ? (["message", "type", "tenantName", "createdAt", "deliveryMethod"] as (keyof Notification)[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
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
                    {getSortIcon(key)}
                  </button>
                ))
              : (["tenantName", "propertyName", "rentDue", "utilityDue", "depositDue", "totalDue", "dueDate"] as (keyof UpcomingReminder)[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-sm font-medium text-[#012a4a] hover:text-[#03a678] flex items-center gap-1 transition-colors"
                  >
                    Sort by{" "}
                    {key === "tenantName"
                      ? "Tenant"
                      : key === "propertyName"
                      ? "Property"
                      : key === "rentDue"
                      ? "Rent Due"
                      : key === "utilityDue"
                      ? "Utilities Due"
                      : key === "depositDue"
                      ? "Deposit Due"
                      : key === "totalDue"
                      ? "Total Due"
                      : "Due Date"}{" "}
                    {getSortIcon(key)}
                  </button>
                ))}
          </div>
          <AnimatePresence>
            {isModalOpen && (
              <Modal
                title={viewMode === "sent" ? "Notification Details" : "Upcoming Reminder Details"}
                isOpen={isModalOpen}
                onClose={() => {
                  setIsModalOpen(false);
                  setSelectedNotification(null);
                  setSelectedReminder(null);
                }}
              >
                <div className="space-y-4 sm:space-y-5 max-w-full">
                  {selectedNotification && viewMode === "sent" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Message</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm break-words">
                          {selectedNotification.message}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Type</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedNotification.type.charAt(0).toUpperCase() + selectedNotification.type.slice(1)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Tenant</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedNotification.tenantName}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Date</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {new Date(selectedNotification.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Delivery Method</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedNotification.deliveryMethod === "both"
                            ? "SMS & Email"
                            : selectedNotification.deliveryMethod === "sms"
                            ? `SMS (${selectedNotification.deliveryStatus || "Pending"})`
                            : selectedNotification.deliveryMethod === "email"
                            ? "Email"
                            : "App"}
                        </p>
                      </div>
                    </>
                  )}
                  {selectedReminder && viewMode === "upcoming" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Tenant</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedReminder.tenantName}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Property</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedReminder.propertyName}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">House Number</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedReminder.houseNumber}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Rent Due</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          Ksh. {selectedReminder.rentDue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Utilities Due</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          Ksh. {selectedReminder.utilityDue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Deposit Due</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          Ksh. {selectedReminder.depositDue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Total Due</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          Ksh. {selectedReminder.totalDue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#012a4a]">Due Date</label>
                        <p className="w-full border border-gray-200 px-3 py-2 rounded-lg bg-gray-50 text-[#012a4a] text-sm">
                          {selectedReminder.dueDate}
                        </p>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setIsModalOpen(false);
                        setSelectedNotification(null);
                        setSelectedReminder(null);
                      }}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
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
                <div className="space-y-4 sm:space-y-5">
                  {tenants.length === 0 && (
                    <div className="bg-yellow-50 text-yellow-700 p-4 rounded-lg border border-yellow-200 text-sm">
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
                      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] placeholder-gray-400 text-sm"
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
                      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] disabled:bg-gray-50 disabled:cursor-not-allowed text-sm"
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
                      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] text-sm"
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
                      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent bg-white text-[#012a4a] text-sm"
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
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createNotification}
                      className="px-4 py-2 bg-gradient-to-r from-[#03a678] to-[#02956a] text-white rounded-lg flex items-center gap-2 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      disabled={
                        isLoading ||
                        !newNotification.tenantId ||
                        !newNotification.type ||
                        !newNotification.deliveryMethod ||
                        (newNotification.type !== "payment" && !newNotification.message.trim()) ||
                        (["sms", "both"].includes(newNotification.deliveryMethod) && !tenants.some((t) => t.phone)) ||
                        (["email", "both"].includes(newNotification.deliveryMethod) && !tenants.some((t) => t.email)) ||
                        !csrfToken
                      }
                    >
                      <Send size={16} />
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
                <div className="space-y-4 sm:space-y-5">
                  <p className="text-[#012a4a] text-sm">
                    Are you sure you want to delete this notification? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setIsDeleteModalOpen(false);
                        setNotificationToDelete(null);
                      }}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-[#012a4a] font-medium text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => notificationToDelete && deleteNotification(notificationToDelete)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <Trash2 size={16} />
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
        th,
        td {
          text-align: left;
          vertical-align: middle;
        }
      `}</style>
    </div>
  );
}