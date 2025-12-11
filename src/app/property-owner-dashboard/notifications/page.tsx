"use client";
import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { Bell, Plus, Send, Trash2, ChevronLeft, ChevronRight, Eye, RefreshCw, ChevronDown } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import NotificationsHeader from "../components/notifications/NotificationsHeader";
import NotificationsTable from "../components/notifications/NotificationsTable";
import PaginationControls from "../components/notifications/PaginationControls";

// Interfaces
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

interface ApiResponse<T = any> {
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
  const [pageSize, setPageSize] = useState(10);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [newNotification, setNewNotification] = useState({
    message: "",
    tenantIds: [] as string[],
    type: "other" as Notification["type"],
    deliveryMethod: "app" as Notification["deliveryMethod"],
  });

  const fetchCsrfToken = useCallback(async () => {
    try {
      const response = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const data: ApiResponse = await response.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        Cookies.set("csrfToken", data.csrfToken, { sameSite: "strict", secure: true });
        return data.csrfToken;
      } else {
        setError("Failed to fetch CSRF token. Please try again.");
        return null;
      }
    } catch (err) {
      setError("Failed to fetch CSRF token. Please refresh the page.");
      return null;
    }
  }, []);

  const makeAuthenticatedRequest = useCallback(
    async (url: string, options: RequestInit, retries = 1): Promise<Response> => {
      if (!csrfToken) {
        const newToken = await fetchCsrfToken();
        if (!newToken) throw new Error("Unable to fetch CSRF token");
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
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const propertiesRes = await makeAuthenticatedRequest(
        `/api/properties?ownerId=${encodeURIComponent(userId)}`,
        { method: "GET" }
      );
      const propertiesData: ApiResponse<Property[]> = await propertiesRes.json();
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
      if (!tenantsData.success || !tenantsData.tenants) {
        setError(tenantsData.message || "Unable to fetch tenants.");
        setIsLoading(false);
        return;
      }
      const fetchedTenants = tenantsData.tenants;
      setTenants(fetchedTenants);
      setNewNotification((prev) => ({
        ...prev,
        tenantIds: fetchedTenants.length > 0 ? ["all"] : [],
      }));

      const paymentsRes = await makeAuthenticatedRequest(
        `/api/payments?ownerId=${encodeURIComponent(userId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const paymentsData: ApiResponse<Payment[]> = await paymentsRes.json();
      if (!paymentsData.success || !paymentsData.payments) {
        setError(paymentsData.message || "Unable to fetch payments.");
        setIsLoading(false);
        return;
      }
      const fetchedPayments = paymentsData.payments;

      const reminders: UpcomingReminder[] = [];
      const currentDate = new Date();
      const utilityAmount = 1000;

      for (const tenant of fetchedTenants) {
        const property = fetchedProperties.find((p) => p._id === tenant.propertyId);
        if (!property) continue;

        const unit = property.unitTypes.find((u) => u.uniqueType === tenant.unitType);
        const rentAmount = unit ? unit.price : tenant.price;
        const depositAmount = unit ? unit.deposit : tenant.deposit;

        const tenantPayments = fetchedPayments.filter((p) => p.tenantId === tenant._id);
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const rentPayments = tenantPayments
          .filter((p) => p.type === "Rent" && p.status === "completed" && new Date(p.paymentDate) >= startOfMonth && new Date(p.paymentDate) <= endOfMonth)
          .reduce((sum, p) => sum + p.amount, 0);
        const utilityPayments = tenantPayments
          .filter((p) => p.type === "Utility" && p.status === "completed" && new Date(p.paymentDate) >= startOfMonth && new Date(p.paymentDate) <= endOfMonth)
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
        const formattedDueDate = dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
      setUpcomingReminders(reminders);
    } catch (err) {
      setError("Unable to fetch tenant, property, or payment data.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const response = await makeAuthenticatedRequest(
        `/api/notifications?ownerId=${encodeURIComponent(userId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const data: ApiResponse<Notification[]> = await response.json();
      if (data.success && data.data) {
        setNotifications(data.data);
      } else {
        setError(data.message || "Failed to fetch notifications.");
      }
    } catch (err) {
      setError("Failed to fetch notifications.");
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const triggerReminders = async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications/reminders", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data: ApiResponse<Notification[]> = await response.json();
      if (data.success && data.data) {
        setNotifications((prev) => [...data.data!, ...prev]);
        setUpcomingReminders([]);
      } else {
        setError(data.message || "Failed to send reminders.");
      }
    } catch (err) {
      setError("Failed to send reminders.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest(
        `/api/notifications?notificationId=${encodeURIComponent(notificationId)}`,
        { method: "DELETE" }
      );
      const data: ApiResponse = await response.json();
      if (data.success) {
        setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      } else {
        setError(data.message || "Failed to delete notification.");
      }
    } catch (err) {
      setError("Failed to delete notification.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setNotificationToDelete(null);
    }
  }, [userId, csrfToken, makeAuthenticatedRequest]);

  const markAsRead = async (notificationId: string) => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications/reminders/mark-read", {
        method: "POST",
        body: JSON.stringify({ notificationId }),
      });
      const data: ApiResponse = await response.json();
      if (data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === notificationId ? { ...n, status: "read" } : n))
        );
      }
    } catch (err) {
      setError("Failed to mark notification as read.");
    } finally {
      setIsLoading(false);
    }
  };

  const retryNotification = async (notificationId: string) => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const notification = notifications.find((n) => n._id === notificationId);
      if (!notification) return;

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
      if (data.success && data.data) {
        setNotifications((prev) => [data.data!, ...prev.filter((n) => n._id !== notificationId)]);
      }
    } catch (err) {
      setError("Failed to retry notification.");
    } finally {
      setIsLoading(false);
    }
  };

  const createNotification = async () => {
    if (!userId || !csrfToken || newNotification.tenantIds.length === 0) return;
    setIsLoading(true);
    try {
      const tenantIds = newNotification.tenantIds.includes("all")
        ? tenants.map((t) => t._id)
        : newNotification.tenantIds;

      const responses = await Promise.all(
        tenantIds.map(async (tenantId) => {
          const response = await makeAuthenticatedRequest("/api/notifications", {
            method: "POST",
            body: JSON.stringify({
              message: newNotification.message,
              tenantId,
              type: newNotification.type,
              deliveryMethod: newNotification.deliveryMethod,
            }),
          });
          return { tenantId, data: await response.json() as ApiResponse<Notification> };
        })
      );

      const successful: Notification[] = [];
      responses.forEach(({ data }) => {
        if (data.success && data.data) successful.push(data.data);
      });

      if (successful.length > 0) {
        setNotifications((prev) => [...successful, ...prev]);
        setIsCreateModalOpen(false);
        setNewNotification({ message: "", tenantIds: tenants.length > 0 ? ["all"] : [], type: "other", deliveryMethod: "app" });
        await fetchNotifications();
      }
    } catch (err) {
      setError("Failed to create notification.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const uid = Cookies.get("userId") ?? null;
    const role = Cookies.get("role");
    const originalRole = Cookies.get("originalRole");
    const originalUserId = Cookies.get("originalUserId");
    const storedCsrfToken = Cookies.get("csrfToken") ?? null;

    if (!uid || !role || (role !== "propertyOwner" && !(originalRole === "propertyOwner" && originalUserId))) {
      setError("Please log in as a property owner.");
      return;
    }

    setUserId(uid);
    setCsrfToken(storedCsrfToken);
    if (!storedCsrfToken) fetchCsrfToken();
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

  const totalItems = viewMode === "sent" ? notifications.length : upcomingReminders.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedItems = (viewMode === "sent" ? notifications : upcomingReminders).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getDeliveryStatusText = (notification: Notification) => {
    const method = notification.deliveryMethod || "app";
    const status = notification.deliveryStatus || "pending";
    const error = notification.errorDetails || "";
    const base = method === "both" ? "SMS, Email & WhatsApp" : method.charAt(0).toUpperCase() + method.slice(1);
    return error.includes("1007") ? `${base} - Verify Device ID` : `${base} (${status})`;
  };

  return (
    <>
      <Navbar />
      <Sidebar />

      {/* Main Content - Perfectly aligned with fixed Navbar & Sidebar */}
      <main className="min-h-screen bg-gray-50 pt-20 pb-10 md:ml-64 transition-all duration-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <NotificationsHeader
            viewMode={viewMode}
            setViewMode={setViewMode}
            onCreateNotification={() => setIsCreateModalOpen(true)}
            onSendReminders={viewMode === "upcoming" ? triggerReminders : undefined}
            isLoading={isLoading}
            tenantsCount={tenants.length}
            csrfToken={csrfToken}
          />

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-md">
              {error}
            </div>
          )}

          {isLoading && paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <Bell className="mb-4 h-16 w-16 animate-pulse text-[#03a678]" />
              <p className="text-lg text-gray-600">Loading notifications...</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl bg-white py-20 shadow-lg">
              <Bell className="mb-6 h-20 w-20 text-gray-300" />
              <p className="text-xl font-semibold text-[#012a4a]">
                {viewMode === "sent" ? "No sent reminders yet" : "No upcoming reminders"}
              </p>
              <p className="mt-3 max-w-md text-center text-gray-500">
                {viewMode === "sent"
                  ? "Start communicating with your tenants by creating a new notification."
                  : "Automatic reminders will appear here when rent or utilities are due."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
                <NotificationsTable
                  items={paginatedItems}
                  viewMode={viewMode}
                  onViewDetails={(item: any) =>
                    viewMode === "sent"
                      ? openNotificationDetails(item as Notification)
                      : openReminderDetails(item as UpcomingReminder)
                  }
                  onMarkAsRead={viewMode === "sent" ? markAsRead : undefined}
                  onRetry={viewMode === "sent" ? retryNotification : undefined}
                  onDelete={viewMode === "sent" ? openDeleteConfirmation : undefined}
                />
              </div>

              <div className="mt-8">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </>
          )}

          {/* Details Modal */}
          <Modal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedNotification(null);
              setSelectedReminder(null);
            }}
            title={viewMode === "sent" ? "Notification Details" : "Reminder Details"}
          >
            {selectedNotification && (
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-gray-600">Message</p>
                  <p className="mt-1">{selectedNotification.message}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Type</p>
                  <p className="mt-1 capitalize">{selectedNotification.type}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Tenant</p>
                  <p className="mt-1">{selectedNotification.tenantName}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Date</p>
                  <p className="mt-1">{new Date(selectedNotification.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Delivery</p>
                  <p className="mt-1">{getDeliveryStatusText(selectedNotification)}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-600">Status</p>
                  <p className="mt-1 capitalize">{selectedNotification.status}</p>
                </div>
                <div className="flex gap-3 mt-6">
                  {selectedNotification.status !== "read" && (
                    <button
                      onClick={() => markAsRead(selectedNotification._id)}
                      className="bg-[#03a678] text-white px-5 py-2.5 rounded-xl hover:bg-[#02956a] transition-colors shadow-md"
                      disabled={isLoading}
                    >
                      {isLoading ? "Processing..." : "Mark as Read"}
                    </button>
                  )}
                  {selectedNotification.deliveryStatus === "failed" && (
                    <button
                      onClick={() => retryNotification(selectedNotification._id)}
                      className="bg-yellow-600 text-white px-5 py-2.5 rounded-xl hover:bg-yellow-700 transition-colors shadow-md"
                      disabled={isLoading || selectedNotification.errorDetails?.includes("1007")}
                    >
                      {isLoading ? "Retrying..." : "Retry"}
                    </button>
                  )}
                </div>
              </div>
            )}
            {selectedReminder && (
              <div className="space-y-4">
                <div><p className="font-medium text-gray-600">Tenant</p><p>{selectedReminder.tenantName}</p></div>
                <div><p className="font-medium text-gray-600">Property</p><p>{selectedReminder.propertyName}</p></div>
                <div><p className="font-medium text-gray-600">House Number</p><p>{selectedReminder.houseNumber}</p></div>
                <div><p className="font-medium text-gray-600">Rent Due</p><p>Ksh. {selectedReminder.rentDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Utilities Due</p><p>Ksh. {selectedReminder.utilityDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Deposit Due</p><p>Ksh. {selectedReminder.depositDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Total Due</p><p className="font-bold text-[#03a678]">Ksh. {selectedReminder.totalDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Due Date</p><p>{selectedReminder.dueDate}</p></div>
              </div>
            )}
          </Modal>

          {/* Create Notification Modal */}
          <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Notification">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#012a4a] mb-2">Recipients</label>
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                  >
                    <span>
                      {newNotification.tenantIds.length === 0
                        ? "Select tenants"
                        : newNotification.tenantIds.includes("all")
                        ? "All Tenants"
                        : `${newNotification.tenantIds.length} tenant${newNotification.tenantIds.length > 1 ? "s" : ""} selected`}
                    </span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newNotification.tenantIds.includes("all")}
                          onChange={(e) => setNewNotification({ ...newNotification, tenantIds: e.target.checked ? ["all"] : [] })}
                          className="w-5 h-5 text-[#03a678] rounded focus:ring-[#03a678]"
                        />
                        <span className="font-medium">All Tenants</span>
                      </label>
                      {tenants.map((tenant) => (
                        <label key={tenant._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newNotification.tenantIds.includes(tenant._id)}
                            disabled={newNotification.tenantIds.includes("all")}
                            onChange={(e) =>
                              setNewNotification({
                                ...newNotification,
                                tenantIds: e.target.checked
                                  ? [...newNotification.tenantIds, tenant._id]
                                  : newNotification.tenantIds.filter((id) => id !== tenant._id),
                              })
                            }
                            className="w-5 h-5 text-[#03a678] rounded focus:ring-[#03a678]"
                          />
                          <span>{tenant.name} ({tenant.houseNumber})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#012a4a] mb-2">Notification Type</label>
                <select
                  value={newNotification.type}
                  onChange={(e) => setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
                >
                  <option value="payment">Payment</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="tenant">Tenant Update</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#012a4a] mb-2">Delivery Method</label>
                <select
                  value={newNotification.deliveryMethod}
                  onChange={(e) => setNewNotification({ ...newNotification, deliveryMethod: e.target.value as Notification["deliveryMethod"] })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
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
                  <label className="block text-sm font-medium text-[#012a4a] mb-2">Message</label>
                  <textarea
                    value={newNotification.message}
                    onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                    rows={5}
                    placeholder="Enter your message..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#03a678] focus:border-transparent"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-6 py-2.5 border border-gray-300 rounded-xl text-[#012a4a] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createNotification}
                  disabled={isLoading || newNotification.tenantIds.length === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#03a678] to-[#02956a] text-white rounded-xl hover:scale-105 transition-transform shadow-md disabled:opacity-50"
                >
                  {isLoading ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </div>
          </Modal>

          {/* Delete Confirmation Modal */}
          <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
            <div className="py-4">
              <p className="text-gray-700 mb-6">Are you sure you want to delete this notification? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-6 py-2.5 border border-gray-300 rounded-xl text-[#012a4a] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => notificationToDelete && deleteNotification(notificationToDelete)}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </main>
    </>
  );
}