"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell, Plus, Send, Trash2, ChevronLeft, ChevronRight, RefreshCw, ChevronDown } from "lucide-react";
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
  unitIdentifier?: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leasedUnits?: Array<{
    unitIdentifier: string;
    unitType: string;
    houseNumber: string;
    price: number;
    deposit: number;
  }>;
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

const resolveTenantLeaseUnits = (tenant: Tenant) => {
  if (Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0) {
    return tenant.leasedUnits;
  }
  return [
    {
      unitIdentifier: tenant.unitIdentifier || tenant.unitType,
      unitType: tenant.unitType,
      houseNumber: tenant.houseNumber,
      price: tenant.price,
      deposit: tenant.deposit,
    },
  ];
};

const resolveTenantUnitNumbers = (tenant: Tenant) => {
  const numbers = resolveTenantLeaseUnits(tenant)
    .map((unit) => unit.houseNumber)
    .filter(Boolean);
  return numbers.length > 0 ? numbers.join(", ") : "—";
};

export default function NotificationsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewNotifications = perm.hasPermission("notifications:view");
  const canViewReminders = perm.hasPermission("reminders:view");
  const canSendNotifications = perm.hasPermission("notifications:send");
  const canManageNotifications = perm.hasPermission("notifications:manage");
  const canTriggerReminders = perm.hasPermission("reminders:trigger");
  const [viewMode, setViewMode] = useState<"sent" | "upcoming">("sent");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
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
        Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", secure: true, path: "/" });
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
      let token = csrfToken;
      if (!token) {
        token = await fetchCsrfToken();
        if (!token) throw new Error("Unable to fetch CSRF token");
      }
      const headers = new Headers(options.headers || {});
      headers.set("X-CSRF-Token", token);
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
          Cookies.set("csrf-token", newToken, { sameSite: "strict", secure: true, path: "/" });
          return makeAuthenticatedRequest(url, { ...options, headers }, retries - 1);
        }
      }
      return response;
    },
    [csrfToken, fetchCsrfToken]
  );

  // Auth check + determine effective ownerId
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    setUserId(uid || null);
    setRole(userRole || null);

    let ownerIdToUse: string | null = null;

    if (userRole === "propertyOwner") {
      ownerIdToUse = uid || null;
    } else if (userRole === "teamMember") {
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      setError("Please log in as a property owner or team member.");
      router.push("/login");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      router.push("/login");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);

    const storedCsrfToken = Cookies.get("csrf-token") ?? null;
    setCsrfToken(storedCsrfToken);
    fetchCsrfToken();
  }, [router, fetchCsrfToken, canViewNotifications, canViewReminders]);

  useEffect(() => {
    if (role !== "teamMember") return;
    if (!canViewNotifications && canViewReminders) {
      setViewMode("upcoming");
    } else if (canViewNotifications && !canViewReminders) {
      setViewMode("sent");
    }
  }, [role, canViewNotifications, canViewReminders]);
  const fetchTenantsAndReminders = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    if (!canViewReminders && !canSendNotifications) return;
    setIsLoading(true);
    try {
      if (canViewReminders) {
        const remindersRes = await makeAuthenticatedRequest(
          "/api/notifications/reminders?mode=upcoming",
          { method: "GET" }
        );
        const remindersData: ApiResponse<UpcomingReminder[]> = await remindersRes.json();
        if (remindersData.success) {
          setUpcomingReminders(remindersData.data ?? []);
        } else if (!canSendNotifications) {
          setError(remindersData.message || "Unable to fetch upcoming reminders.");
        }
      }

      const tenantsRes = await makeAuthenticatedRequest(
        `/api/tenants?userId=${encodeURIComponent(effectiveOwnerId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const tenantsData: ApiResponse<Tenant[]> = await tenantsRes.json();
      if (!tenantsData.success || !tenantsData.tenants) {
        setError(tenantsData.message || "Unable to fetch tenants.");
        setIsLoading(false);
        return;
      }
      setError(null);
      const fetchedTenants = tenantsData.tenants;
      setTenants(fetchedTenants);
      setNewNotification((prev) => ({
        ...prev,
        tenantIds: fetchedTenants.length > 0 ? ["all"] : [],
      }));
    } catch (err) {
      setError("Unable to fetch tenant or reminder data.");
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOwnerId, csrfToken, makeAuthenticatedRequest, canViewReminders, canSendNotifications]);

  const fetchNotifications = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    if (!canViewNotifications) return;
    try {
      const response = await makeAuthenticatedRequest(
        `/api/notifications?ownerId=${encodeURIComponent(effectiveOwnerId)}&page=1&limit=100`,
        { method: "GET" }
      );
      const data: ApiResponse<Notification[]> = await response.json();
      if (data.success && data.data) {
        setNotifications(data.data);
        setError(null);
      } else {
        setError(data.message || "Failed to fetch notifications.");
      }
    } catch (err) {
      setError("Failed to fetch notifications.");
    }
  }, [effectiveOwnerId, csrfToken, makeAuthenticatedRequest, canViewNotifications]);

  const triggerReminders = async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    if (!canTriggerReminders) {
      setError("You do not have permission to send reminders.");
      return;
    }
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
    if (!effectiveOwnerId || !csrfToken) return;
    if (!canManageNotifications) {
      setError("You do not have permission to delete notifications.");
      return;
    }
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
  }, [effectiveOwnerId, csrfToken, makeAuthenticatedRequest, canManageNotifications]);

  const markAsRead = async (notificationId: string, options?: { silent?: boolean }) => {
    if (!effectiveOwnerId || !csrfToken) return;
    if (!options?.silent) setIsLoading(true);
    try {
      const response = await makeAuthenticatedRequest("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ notificationId }),
      });
      const data: ApiResponse = await response.json();
      if (data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === notificationId ? { ...n, status: "read" } : n))
        );
      } else {
        setError(data.message || "Failed to mark notification as read.");
      }
    } catch (err) {
      setError("Failed to mark notification as read.");
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  };

  const retryNotification = async (notificationId: string) => {
    if (!effectiveOwnerId || !csrfToken) return;
    if (!canSendNotifications) {
      setError("You do not have permission to resend notifications.");
      return;
    }
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
    if (!effectiveOwnerId || !csrfToken || newNotification.tenantIds.length === 0) return;
    if (!canSendNotifications) {
      setError("You do not have permission to send notifications.");
      return;
    }
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
    if (effectiveOwnerId && csrfToken) {
      if (canViewReminders || canSendNotifications) {
        fetchTenantsAndReminders();
      }
      if (canViewNotifications) {
        fetchNotifications();
      }
    }
  }, [effectiveOwnerId, csrfToken, canViewReminders, canSendNotifications, canViewNotifications, fetchTenantsAndReminders, fetchNotifications]);

  const openNotificationDetails = useCallback((notification: Notification) => {
    const shouldMarkRead = notification.status !== "read" && canViewNotifications;
    const nextNotification: Notification = shouldMarkRead
      ? { ...notification, status: "read" as Notification["status"] }
      : notification;
    setSelectedNotification(nextNotification);
    setSelectedReminder(null);
    setIsModalOpen(true);
    if (shouldMarkRead) {
      void markAsRead(notification._id, { silent: true });
    }
  }, [canViewNotifications, markAsRead]);

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
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8 transition-all duration-300">
        <main className="mx-auto max-w-7xl space-y-6">
          <NotificationsHeader
            viewMode={viewMode}
            setViewMode={setViewMode}
            onCreateNotification={() => {
              if (!canSendNotifications) {
                setError("You do not have permission to send notifications.");
                return;
              }
              setIsCreateModalOpen(true);
            }}
            onSendReminders={viewMode === "upcoming" && canTriggerReminders ? triggerReminders : undefined}
            isLoading={isLoading}
            tenantsCount={tenants.length}
            csrfToken={csrfToken}
          />

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700 shadow-md text-xs sm:text-sm">
              {error}
            </div>
          )}

          {isLoading && paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <Bell className="mb-4 h-16 w-16 animate-pulse text-[#42c775]" />
              <p className="text-xs sm:text-sm text-muted-foreground">Loading notifications...</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl surface-card py-20">
              <Bell className="mb-6 h-16 w-16 text-gray-300" />
              <p className="text-base sm:text-lg font-semibold text-foreground">
                {viewMode === "sent" ? "No sent reminders yet" : "No upcoming reminders"}
              </p>
              <p className="mt-3 max-w-md text-center text-xs sm:text-sm text-muted-foreground">
                {viewMode === "sent"
                  ? "Start communicating with your tenants by creating a new notification."
                  : "Automatic reminders will appear here when rent or utilities are due."}
              </p>
            </div>
          ) : (
            <>
              <NotificationsTable
                items={paginatedItems}
                viewMode={viewMode}
                onViewDetails={(item: any) =>
                  viewMode === "sent"
                    ? openNotificationDetails(item as Notification)
                    : openReminderDetails(item as UpcomingReminder)
                }
                onRetry={viewMode === "sent" && canSendNotifications ? retryNotification : undefined}
                onDelete={viewMode === "sent" && canManageNotifications ? openDeleteConfirmation : undefined}
              />

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
                  {selectedNotification.deliveryStatus === "failed" && canSendNotifications && (
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
                <div><p className="font-medium text-gray-600">Units</p><p>{selectedReminder.houseNumber}</p></div>
                <div><p className="font-medium text-gray-600">Rent Due</p><p>Ksh. {selectedReminder.rentDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Utilities Due</p><p>Ksh. {selectedReminder.utilityDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Deposit Due</p><p>Ksh. {selectedReminder.depositDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Total Due</p><p className="font-bold text-[#42c775]">Ksh. {selectedReminder.totalDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Due Date</p><p>{selectedReminder.dueDate}</p></div>
              </div>
            )}
          </Modal>

          {/* Create Notification Modal */}
          <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create New Notification">
            <div className="space-y-5">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-primary mb-2">Recipients</label>
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-left text-xs sm:text-sm flex justify-between items-center bg-white/80 hover:bg-gray-50 transition-colors"
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
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer text-xs sm:text-sm">
                        <input
                          type="checkbox"
                          checked={newNotification.tenantIds.includes("all")}
                          onChange={(e) => setNewNotification({ ...newNotification, tenantIds: e.target.checked ? ["all"] : [] })}
                          className="w-4 h-4 text-primary rounded focus:ring-primary/40"
                        />
                        <span className="font-semibold">All Tenants</span>
                      </label>
                      {tenants.map((tenant) => (
                        <label key={tenant._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer text-xs sm:text-sm">
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
                            className="w-4 h-4 text-primary rounded focus:ring-primary/40"
                          />
                          <span>{tenant.name} ({resolveTenantUnitNumbers(tenant)})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-primary mb-2">Notification Type</label>
                <select
                  value={newNotification.type}
                  onChange={(e) => setNewNotification({ ...newNotification, type: e.target.value as Notification["type"] })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="payment">Payment</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="tenant">Tenant Update</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-primary mb-2">Delivery Method</label>
                <select
                  value={newNotification.deliveryMethod}
                  onChange={(e) => setNewNotification({ ...newNotification, deliveryMethod: e.target.value as Notification["deliveryMethod"] })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
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
                  <label className="block text-xs sm:text-sm font-semibold text-primary mb-2">Message</label>
                  <textarea
                    value={newNotification.message}
                    onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                    rows={5}
                    placeholder="Enter your message..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-6 py-2.5 border border-gray-300 rounded-xl text-primary text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createNotification}
                  disabled={isLoading || newNotification.tenantIds.length === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-primary to-emerald-500 text-white rounded-xl text-xs sm:text-sm font-semibold hover:scale-105 transition-transform shadow-md disabled:opacity-50"
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
                  className="px-6 py-2.5 border border-gray-300 rounded-xl text-primary text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => notificationToDelete && deleteNotification(notificationToDelete)}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
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














