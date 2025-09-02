"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { Bell, Plus, Send, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

interface Tenant {
  _id: string;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  walletBalance: number;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
}

interface Property {
  _id: string;
  ownerId: string;
  name: string;
  unitTypes: Array<{
    type: string;
    price: number;
    uniqueType: string;
    deposit: number;
    quantity: number;
    managementType: "RentCollection" | "FullManagement";
    managementFee: number;
  }>;
  rentPaymentDate: number;
  requiresAdminApproval?: boolean;
  createdAt: string;
  updatedAt?: string;
  managementFee: number;
}

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "unread" | "read";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
  errorDetails?: string;
}

interface Payment {
  _id: string;
  tenantId: string | null;
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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  properties?: T;
  tenants?: T;
  payments?: T;
  property?: T;
  total?: number;
  page?: number;
  limit?: number;
  message?: string;
  csrfToken?: string;
}

export default function NotificationsPage() {
  const [viewMode, setViewMode] = useState<"sent" | "upcoming">("sent");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<UpcomingReminder | null>(null);
  const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantId: "",
    type: "other" as Notification["type"],
    deliveryMethod: "app" as Notification["deliveryMethod"],
  });

  const fetchCsrfToken = useCallback(async () => {
    try {
      const response = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const data: ApiResponse<never> = await response.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        Cookies.set("csrfToken", data.csrfToken, { sameSite: "strict", secure: true });
        console.log("[INFO] CSRF token fetched and stored:", data.csrfToken);
        return data.csrfToken;
      } else {
        console.error("[ERROR] Failed to fetch CSRF token:", data.message);
        setError("Failed to fetch CSRF token. Please try again.");
        return null;
      }
    } catch (err) {
      console.error("[ERROR] Error fetching CSRF token:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to fetch CSRF token. Please refresh the page.");
      return null;
    }
  }, []);

  const makeAuthenticatedRequest = useCallback(
    async (url: string, options: RequestInit, retries = 1): Promise<Response> => {
      if (!csrfToken) {
        const newToken = await fetchCsrfToken();
        if (!newToken) {
          throw new Error("Unable to fetch CSRF token");
        }
      }

      const headers = new Headers(options.headers || {});
      headers.set("X-CSRF-Token", csrfToken!);
      headers.set("Content-Type", "application/json");

      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });

      if (response.status === 403 && retries > 0) {
        console.log("[INFO] CSRF token invalid, retrying with new token...");
        const newToken = await fetchCsrfToken();
        if (newToken) {
          headers.set("X-CSRF-Token", newToken);
          setCsrfToken(newToken);
          Cookies.set("csrfToken", newToken, { sameSite: "strict", secure: true });
          return makeAuthenticatedRequest(url, { ...options, headers }, retries - 1);
        }
      }

      return response;
    },
    [csrfToken, fetchCsrfToken]
  );

  const fetchTenantsAndPayments = useCallback(async () => {
    if (!userId || !csrfToken) {
      console.log("[DEBUG] Skipping fetchTenantsAndPayments: missing userId or csrfToken", { userId, csrfToken });
      setError("Please log in to fetch tenant and payment data.");
      return;
    }
    setIsLoading(true);
    try {
      const propertiesRes = await makeAuthenticatedRequest(
        `/api/properties?ownerId=${encodeURIComponent(userId)}`,
        { method: "GET" }
      );
      const propertiesData: ApiResponse<Property[]> = await propertiesRes.json();
      console.log("[INFO] Properties fetch response:", {
        success: propertiesData.success,
        properties: propertiesData.properties?.length,
        message: propertiesData.message,
        status: propertiesRes.status,
      });

      if (!propertiesData.success || !propertiesData.properties) {
        setError(propertiesData.message || "Unable to fetch properties.");
        setIsLoading(false);
        return;
      }

      const fetchedProperties = propertiesData.properties;

      const tenantsRes = await makeAuthenticatedRequest(
        `/api/tenants?ownerId=${encodeURIComponent(userId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const tenantsData: ApiResponse<Tenant[]> = await tenantsRes.json();
      console.log("[INFO] Tenants fetch response:", {
        success: tenantsData.success,
        tenants: tenantsData.tenants?.length,
        message: tenantsData.message,
        status: tenantsRes.status,
      });

      if (!tenantsData.success || !tenantsData.tenants) {
        setError(tenantsData.message || "Unable to fetch tenants.");
        setIsLoading(false);
        return;
      }

      const fetchedTenants = tenantsData.tenants;
      setTenants(fetchedTenants);
      setNewNotification((prev) => ({
        ...prev,
        tenantId: fetchedTenants.length > 0 ? "all" : "",
      }));

      const tenantIds = fetchedTenants.map((tenant) => tenant._id);
      if (tenantIds.length === 0) {
        setError("No tenants found. Add tenants to view reminders.");
        setIsLoading(false);
        return;
      }

      const paymentsRes = await makeAuthenticatedRequest(
        `/api/payments?ownerId=${encodeURIComponent(userId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const paymentsData: ApiResponse<Payment[]> = await paymentsRes.json();
      console.log("[INFO] Payments fetch response:", {
        success: paymentsData.success,
        payments: paymentsData.payments?.length,
        message: paymentsData.message,
        status: paymentsRes.status,
      });

      if (!paymentsData.success || !paymentsData.payments) {
        setError(paymentsData.message || "Unable to fetch payments.");
        setIsLoading(false);
        return;
      }

      const fetchedPayments = paymentsData.payments;
      const reminders: UpcomingReminder[] = [];

      for (const tenant of fetchedTenants) {
        const property = fetchedProperties.find((p) => p._id === tenant.propertyId);
        if (!property) {
          console.warn(`[WARN] Property not found for tenant ${tenant._id}`);
          continue;
        }

        const leaseStartDate = new Date(tenant.leaseStartDate);
        const currentDate = new Date();
        if (isNaN(leaseStartDate.getTime()) || leaseStartDate > currentDate) {
          console.warn(`[WARN] Invalid or future lease start date for tenant ${tenant._id}`);
          continue;
        }

        if (isNaN(property.rentPaymentDate) || property.rentPaymentDate < 1 || property.rentPaymentDate > 31) {
          console.warn(`[WARN] Invalid rent payment date for property ${property._id}`);
          continue;
        }

        const unit = property.unitTypes.find((u) => u.uniqueType === tenant.unitType);
        if (!unit && !tenant.price) {
          console.warn(`[WARN] No valid unit type or price for tenant ${tenant._id}`);
          continue;
        }
        const rentAmount = unit ? unit.price : tenant.price;
        const depositAmount = unit ? unit.deposit : tenant.deposit;
        const utilityAmount = 1000;

        const tenantPayments = fetchedPayments.filter((p) =>
          p.tenantId ? p.tenantId.toString() === tenant._id : false
        );

        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const rentPayments = tenantPayments
          .filter(
            (p) =>
              p.type === "Rent" &&
              p.status === "completed" &&
              new Date(p.paymentDate) >= startOfMonth &&
              new Date(p.paymentDate) <= endOfMonth
          )
          .reduce((sum, p) => sum + p.amount, 0);
        const utilityPayments = tenantPayments
          .filter(
            (p) =>
              p.type === "Utility" &&
              p.status === "completed" &&
              new Date(p.paymentDate) >= startOfMonth &&
              new Date(p.paymentDate) <= endOfMonth
          )
          .reduce((sum, p) => sum + p.amount, 0);
        const depositPayments = tenantPayments
          .filter((p) => p.type === "Deposit" && p.status === "completed")
          .reduce((sum, p) => sum + p.amount, 0);

        const rentDue = Math.max(0, rentAmount - rentPayments);
        const utilityDue = Math.max(0, utilityAmount - utilityPayments);
        const depositDue = Math.max(0, depositAmount - depositPayments);

        const totalDue = rentDue + utilityDue + depositDue;
        if (totalDue <= 0) continue;

        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), property.rentPaymentDate);
        if (isNaN(dueDate.getTime())) {
          console.warn(`[WARN] Invalid due date for property ${property._id}`);
          continue;
        }
        const formattedDueDate = dueDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        const fiveDaysBefore = property.rentPaymentDate - 5;
        const adjustedFiveDaysBefore = fiveDaysBefore <= 0 ? fiveDaysBefore + daysInMonth : fiveDaysBefore;
        const reminderType =
          currentDate.getDate() === property.rentPaymentDate
            ? "paymentDate"
            : currentDate.getDate() === adjustedFiveDaysBefore
            ? "fiveDaysBefore"
            : null;

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
      console.log("[INFO] Generated reminders:", reminders);
      setUpcomingReminders(reminders);
    } catch (err) {
      console.error("[ERROR] Error fetching tenants, properties, or payments:", err instanceof Error ? err.message : "Unknown error");
      setError("Unable to fetch tenant, property, or payment data.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !csrfToken) {
      console.log("[DEBUG] Skipping fetchNotifications: missing userId or csrfToken", { userId, csrfToken });
      return;
    }
    try {
      const response = await makeAuthenticatedRequest(
        `/api/notifications?ownerId=${encodeURIComponent(userId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const data: ApiResponse<Notification[]> = await response.json();
      console.log("[INFO] Notifications fetch response:", {
        success: data.success,
        notifications: data.data?.length,
        message: data.message,
        status: response.status,
      });

      if (data.success && data.data) {
        setNotifications(data.data);
      } else {
        setError(data.message || "Failed to fetch notifications.");
      }
    } catch (err) {
      console.error("[ERROR] Error fetching notifications:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to fetch notifications.");
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const triggerReminders = async () => {
    if (!userId || !csrfToken) {
      setError("Please log in to send reminders.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications/reminders", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data: ApiResponse<Notification[]> = await response.json();
      console.log("[INFO] Trigger reminders response:", {
        success: data.success,
        notifications: data.data?.length,
        message: data.message,
        status: response.status,
      });

      if (!data.success || !data.data) {
        setError(data.message || "Failed to send reminders.");
        setIsLoading(false);
        return;
      }

      setNotifications((prev) => [...data.data!, ...prev]);
      setUpcomingReminders([]);
      setError(null);
    } catch (err) {
      console.error("[ERROR] Error triggering reminders:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to send reminders.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!userId || !csrfToken) {
      setError("Please log in to delete notifications.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest(
        `/api/notifications?notificationId=${encodeURIComponent(notificationId)}`,
        { method: "DELETE" }
      );
      const data: ApiResponse<never> = await response.json();
      console.log("[INFO] Delete notification response:", {
        success: data.success,
        message: data.message,
        status: response.status,
      });

      if (!data.success) {
        setError(data.message || "Failed to delete notification.");
        setIsLoading(false);
        return;
      }

      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      setError(null);
    } catch (err) {
      console.error("[ERROR] Error deleting notification:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to delete notification.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setNotificationToDelete(null);
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const markAsRead = async (notificationId: string) => {
    if (!userId || !csrfToken) {
      setError("Please log in to mark notifications as read.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications/reminders/mark-read", {
        method: "POST",
        body: JSON.stringify({ notificationId }),
      });
      const data: ApiResponse<never> = await response.json();
      console.log("[INFO] Mark as read response:", {
        success: data.success,
        message: data.message,
        status: response.status,
      });

      if (!data.success) {
        setError(data.message || "Failed to mark notification as read.");
        setIsLoading(false);
        return;
      }

      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, status: "read" } : n))
      );
      setError(null);
    } catch (err) {
      console.error("[ERROR] Error marking notification as read:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to mark notification as read.");
    } finally {
      setIsLoading(false);
    }
  };

  const retryNotification = async (notificationId: string) => {
    if (!userId || !csrfToken) {
      setError("Please log in to retry notifications.");
      return;
    }
    setIsLoading(true);
    try {
      const notification = notifications.find((n) => n._id === notificationId);
      if (!notification) {
        setError("Notification not found.");
        setIsLoading(false);
        return;
      }
      if (
        notification.deliveryStatus === "failed" &&
        notification.errorDetails?.includes("Error code: 1007")
      ) {
        setError(
          "Cannot retry: Device not found. Please verify the WhatsApp device ID in your configuration and try again."
        );
        setIsLoading(false);
        return;
      }
      const response = await makeAuthenticatedRequest("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          message: notification.message,
          tenantId: notification.tenantId,
          type: notification.type,
          deliveryMethod: notification.deliveryMethod,
        }),
      });
      const data: ApiResponse<Notification> = await response.json();
      console.log("[INFO] Retry notification response:", {
        success: data.success,
        message: data.message,
        status: response.status,
      });

      if (!data.success || !data.data) {
        setError(data.message || "Failed to retry notification.");
        setIsLoading(false);
        return;
      }

      setNotifications((prev) => [data.data!, ...prev.filter((n) => n._id !== notificationId)]);
      setError(null);
    } catch (err) {
      console.error("[ERROR] Error retrying notification:", err instanceof Error ? err.message : "Unknown error");
      setError(
        err instanceof Error && err.message.includes("Error code: 1007")
          ? "Cannot retry: Device not found. Please verify the WhatsApp device ID in your configuration."
          : "Failed to retry notification."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const createNotification = async () => {
    if (!userId || !csrfToken) {
      setError("Please log in to create notifications.");
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
    if (!newNotification.deliveryMethod || !["app", "sms", "email", "whatsapp", "both"].includes(newNotification.deliveryMethod)) {
      setError("Please select a valid delivery method.");
      return;
    }
    if (newNotification.type !== "payment" && !newNotification.message.trim()) {
      setError("Please enter a message for non-payment notifications.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          message: newNotification.message,
          tenantId: newNotification.tenantId,
          type: newNotification.type,
          deliveryMethod: newNotification.deliveryMethod,
        }),
      });
      const data: ApiResponse<Notification> = await response.json();
      console.log("[INFO] Create notification response:", {
        success: data.success,
        message: data.message,
        status: response.status,
      });

      if (!data.success || !data.data) {
        setError(data.message || "Failed to create notification.");
        setIsLoading(false);
        return;
      }

      setNotifications((prev) => [data.data!, ...prev]);
      setIsCreateModalOpen(false);
      setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      console.error("[ERROR] Error creating notification:", err instanceof Error ? err.message : "Unknown error");
      setError(
        err instanceof Error && err.message.includes("Error code: 1007")
          ? "Cannot send: Device not found. Please verify the WhatsApp device ID in your configuration."
          : "Failed to create notification."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const uid = Cookies.get("userId") ?? null;
    const originalRole = Cookies.get("originalRole") ?? null;
    const originalUserId = Cookies.get("originalUserId") ?? null;
    const storedCsrfToken = Cookies.get("csrfToken") ?? null;

    console.log("[DEBUG] Cookies retrieved:", {
      userId: uid ?? "null",
      role: Cookies.get("role") ?? "null",
      originalRole: originalRole ?? "null",
      originalUserId: originalUserId ?? "null",
      csrfToken: storedCsrfToken ?? "null",
      documentCookie: document.cookie,
    });

    if (!uid || !Cookies.get("role")) {
      console.log("[ERROR] Missing userId or role, setting error");
      setError("No user session found. Please log in to access all features.");
      return;
    }

    if (Cookies.get("role") !== "propertyOwner" && !(originalRole === "propertyOwner" && originalUserId)) {
      console.log("[ERROR] Unauthorized role, setting error", { uid, userRole: Cookies.get("role"), originalRole, originalUserId });
      setError("Please log in as a property owner to access all features.");
      return;
    }

    setUserId(uid);
    setCsrfToken(storedCsrfToken);
    if (!storedCsrfToken) {
      fetchCsrfToken();
    }
  }, [fetchCsrfToken]);

  useEffect(() => {
    if (userId && csrfToken) {
      fetchTenantsAndPayments();
      fetchNotifications();
    }
  }, [userId, csrfToken, fetchTenantsAndPayments, fetchNotifications]);

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

  const getDeliveryStatusText = (notification: Notification) => {
    const status = notification.deliveryStatus || "Pending";
    const errorDetails = notification.errorDetails || "";
    let baseText: string;
    switch (notification.deliveryMethod) {
      case "both":
        baseText = `SMS, Email & WhatsApp (${status}${errorDetails ? `: ${errorDetails}` : ""})`;
        break;
      case "sms":
        baseText = `SMS (${status}${errorDetails ? `: ${errorDetails}` : ""})`;
        break;
      case "email":
        baseText = `Email (${status}${errorDetails ? `: ${errorDetails}` : ""})`;
        break;
      case "whatsapp":
        baseText = `WhatsApp (${status}${errorDetails ? `: ${errorDetails}` : ""})`;
        break;
      default:
        baseText = "App";
    }
    return errorDetails.includes("Error code: 1007")
      ? `${baseText} - Verify WhatsApp device ID in configuration`
      : baseText;
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
                <div className="relative flex-1 sm:flex-none">
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-[#03a678] to-[#02956a] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    disabled={tenants.length === 0 || !csrfToken}
                    title={tenants.length === 0 ? "No tenants available to send notifications" : !csrfToken ? "Authenticating session..." : ""}
                  >
                    <Plus size={16} />
                    Create Notification
                  </button>
                </div>
                {viewMode === "upcoming" && (
                  <div className="relative flex-1 sm:flex-none">
                    <button
                      onClick={triggerReminders}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-[#02956a] to-[#017b58] text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-transform transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      disabled={isLoading || upcomingReminders.length === 0 || !csrfToken}
                      title={
                        isLoading
                          ? "Sending in progress..."
                          : upcomingReminders.length === 0
                          ? "No upcoming reminders to send"
                          : !csrfToken
                          ? "Authenticating session..."
                          : ""
                      }
                    >
                      <Send size={16} />
                      {isLoading ? "Sending..." : "Send Reminders Now"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          {error && (
            <motion.div
              className="bg-red-100 text-red-700 p-4 mb-6 rounded-lg shadow"
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
                {viewMode === "sent"
                  ? "Create a new notification to get started."
                  : "Add tenants or verify payment schedules to see upcoming reminders."}
              </p>
            </motion.div>
          ) : (
            <div className="overflow-x-auto">
              <div className="hidden sm:block">
                <table className="min-w-full bg-white border border-gray-200 rounded-xl shadow-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[#012a4a] text-left text-xs sm:text-sm font-semibold">
                      {viewMode === "sent"
                        ? ["message", "type", "tenantName", "createdAt", "deliveryMethod", "status"].map((key) => (
                            <th key={key} className="px-2 sm:px-4 py-2 sm:py-3">
                              {key === "tenantName"
                                ? "Tenant"
                                : key === "createdAt"
                                ? "Date"
                                : key === "deliveryMethod"
                                ? "Delivery"
                                : key === "status"
                                ? "Status"
                                : key.charAt(0).toUpperCase() + key.slice(1)}
                            </th>
                          ))
                        : ["tenantName", "propertyName", "rentDue", "utilityDue", "depositDue", "totalDue", "dueDate"].map((key) => (
                            <th key={key} className="px-2 sm:px-4 py-2 sm:py-3">
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
                              {getDeliveryStatusText(item as Notification)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#012a4a]">
                              {(item as Notification).status.charAt(0).toUpperCase() + (item as Notification).status.slice(1)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead((item as Notification)._id);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  disabled={(item as Notification).status === "read"}
                                >
                                  Mark as Read
                                </button>
                                {viewMode === "sent" && (item as Notification).deliveryStatus === "failed" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryNotification((item as Notification)._id);
                                    }}
                                    className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1"
                                    disabled={(item as Notification).errorDetails?.includes("Error code: 1007")}
                                    title={
                                      (item as Notification).errorDetails?.includes("Error code: 1007")
                                        ? "Cannot retry: Verify WhatsApp device ID in configuration"
                                        : ""
                                    }
                                  >
                                    Retry
                                  </button>
                                )}
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
                              </div>
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
              <div className="sm:hidden space-y-6">
                {paginatedItems.map((item, index) => (
                  <motion.div
                    key={viewMode === "sent" ? (item as Notification)._id : `${(item as UpcomingReminder).tenantId}-${index}`}
                    className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
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
                      <div className="space-y-3">
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
                            {getDeliveryStatusText(item as Notification)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-[#012a4a] text-sm">Status: </span>
                          <span className="text-[#012a4a] text-sm">
                            {(item as Notification).status.charAt(0).toUpperCase() + (item as Notification).status.slice(1)}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead((item as Notification)._id);
                            }}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                            disabled={(item as Notification).status === "read"}
                          >
                            Mark as Read
                          </button>
                          {viewMode === "sent" && (item as Notification).deliveryStatus === "failed" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                retryNotification((item as Notification)._id);
                              }}
                              className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1 text-sm"
                              disabled={(item as Notification).errorDetails?.includes("Error code: 1007")}
                              title={
                                (item as Notification).errorDetails?.includes("Error code: 1007")
                                  ? "Cannot retry: Verify WhatsApp device ID in configuration"
                                  : ""
                              }
                            >
                              Retry
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteConfirmation((item as Notification)._id);
                            }}
                            className="text-red-600 hover:text-red-800 flex items-center gap-1 text-sm"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
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
              <div className="flex flex-col sm:flex-row justify-between items-center mt-6">
                <div className="flex items-center gap-2">
                  <label htmlFor="pageSize" className="text-sm text-[#012a4a]">
                    Show:
                  </label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-[#012a4a]"
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                  <span className="text-sm text-[#012a4a]">
                    entries per page
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4 sm:mt-0">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-[#03a678] text-white disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-[#012a4a]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-[#03a678] text-white disabled:opacity-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <Modal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedNotification(null);
              setSelectedReminder(null);
              setError(null);
            }}
            title={viewMode === "sent" ? "Notification Details" : "Reminder Details"}
          >
            {selectedNotification && (
              <div className="space-y-4 text-[#012a4a]">
                <p>
                  <strong>Message:</strong> {selectedNotification.message}
                </p>
                <p>
                  <strong>Type:</strong>{" "}
                  {selectedNotification.type.charAt(0).toUpperCase() + selectedNotification.type.slice(1)}
                </p>
                <p>
                  <strong>Tenant:</strong> {selectedNotification.tenantName}
                </p>
                <p>
                  <strong>Date:</strong>{" "}
                  {new Date(selectedNotification.createdAt).toLocaleDateString()}
                </p>
                <p>
                  <strong>Delivery Method:</strong>{" "}
                  {getDeliveryStatusText(selectedNotification)}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {selectedNotification.status.charAt(0).toUpperCase() + selectedNotification.status.slice(1)}
                </p>
                {selectedNotification.status !== "read" && (
                  <button
                    onClick={() => markAsRead(selectedNotification._id)}
                    className="bg-[#03a678] text-white px-4 py-2 rounded-xl hover:bg-[#02956a] transition-colors"
                    disabled={isLoading}
                  >
                    {isLoading ? "Processing..." : "Mark as Read"}
                  </button>
                )}
                {selectedNotification.deliveryStatus === "failed" && (
                  <button
                    onClick={() => retryNotification(selectedNotification._id)}
                    className="bg-yellow-600 text-white px-4 py-2 rounded-xl hover:bg-yellow-700 transition-colors"
                    disabled={isLoading || selectedNotification.errorDetails?.includes("Error code: 1007")}
                    title={
                      selectedNotification.errorDetails?.includes("Error code: 1007")
                        ? "Cannot retry: Verify WhatsApp device ID in configuration"
                        : ""
                    }
                  >
                    {isLoading ? "Retrying..." : "Retry Notification"}
                  </button>
                )}
              </div>
            )}
            {selectedReminder && (
              <div className="space-y-4 text-[#012a4a]">
                <p>
                  <strong>Tenant:</strong> {selectedReminder.tenantName}
                </p>
                <p>
                  <strong>Property:</strong> {selectedReminder.propertyName}
                </p>
                <p>
                  <strong>House Number:</strong> {selectedReminder.houseNumber}
                </p>
                <p>
                  <strong>Rent Due:</strong> Ksh. {selectedReminder.rentDue.toFixed(2)}
                </p>
                <p>
                  <strong>Utilities Due:</strong> Ksh. {selectedReminder.utilityDue.toFixed(2)}
                </p>
                <p>
                  <strong>Deposit Due:</strong> Ksh. {selectedReminder.depositDue.toFixed(2)}
                </p>
                <p>
                  <strong>Total Due:</strong> Ksh. {selectedReminder.totalDue.toFixed(2)}
                </p>
                <p>
                  <strong>Due Date:</strong> {selectedReminder.dueDate}
                </p>
                <p>
                  <strong>Reminder Type:</strong>{" "}
                  {selectedReminder.reminderType === "paymentDate"
                    ? "Payment Date"
                    : "Five Days Before"}
                </p>
              </div>
            )}
          </Modal>
          <Modal
            isOpen={isCreateModalOpen}
            onClose={() => {
              setIsCreateModalOpen(false);
              setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
              setError(null);
            }}
            title="Create New Notification"
          >
            <div className="space-y-4 text-[#012a4a]">
              <div>
                <label htmlFor="tenantId" className="block text-sm font-medium mb-1">
                  Recipient
                </label>
                <select
                  id="tenantId"
                  value={newNotification.tenantId}
                  onChange={(e) => setNewNotification({ ...newNotification, tenantId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#03a678]"
                  disabled={tenants.length === 0}
                >
                  <option value="" disabled>
                    Select a tenant
                  </option>
                  <option value="all">All Tenants</option>
                  {tenants.map((tenant) => (
                    <option key={tenant._id} value={tenant._id}>
                      {tenant.name} ({tenant.houseNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-1">
                  Notification Type
                </label>
                <select
                  id="type"
                  value={newNotification.type}
                  onChange={(e) => setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#03a678]"
                >
                  <option value="payment">Payment</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="tenant">Tenant Update</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="deliveryMethod" className="block text-sm font-medium mb-1">
                  Delivery Method
                </label>
                <select
                  id="deliveryMethod"
                  value={newNotification.deliveryMethod}
                  onChange={(e) => setNewNotification({ ...newNotification, deliveryMethod: e.target.value as Notification["deliveryMethod"] })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#03a678]"
                >
                  <option value="app">In-App</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="both">SMS, Email & WhatsApp</option>
                </select>
              </div>
              {newNotification.type !== "payment" && (
                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    value={newNotification.message}
                    onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#03a678]"
                    rows={4}
                    placeholder="Enter your message here"
                  ></textarea>
                </div>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setNewNotification({ message: "", tenantId: tenants.length > 0 ? "all" : "", type: "other", deliveryMethod: "app" });
                    setError(null);
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-200 text-[#012a4a] hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={createNotification}
                  className="px-4 py-2 text-sm rounded-lg bg-[#03a678] text-white hover:bg-[#02956a] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </div>
          </Modal>
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => {
              setIsDeleteModalOpen(false);
              setNotificationToDelete(null);
              setError(null);
            }}
            title="Confirm Deletion"
          >
            <div className="space-y-4 text-[#012a4a] text-sm">
              <p>Are you sure you want to delete this notification? This action cannot be undone.</p>
              {error && <p className="text-red-600">{error}</p>}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setNotificationToDelete(null);
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-[#012a4a] hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => notificationToDelete && deleteNotification(notificationToDelete)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}