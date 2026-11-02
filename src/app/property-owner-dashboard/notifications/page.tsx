"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell } from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import NotificationsHeader from "../components/notifications/NotificationsHeader";
import NotificationsTable from "../components/notifications/NotificationsTable";
import PaginationControls from "../components/notifications/PaginationControls";
import PremiumGate from "@/components/PremiumGate";
import { useAccountTier } from "@/hooks/useAccountTier";
import { Skeleton } from "@/components/ui/LoadingSkeletons";
import NotificationComposerModal, { type ComposerTenant, type NotificationDraft } from "./NotificationComposerModal";

// Interfaces
interface Tenant {
  _id: string;
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  propertyId: string;
  propertyName?: string;
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
  title?: string;
  categoryLabel?: string;
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
  penaltiesDue: number;
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

interface PropertyListResponse {
  success: boolean;
  properties?: Array<{ _id: string; name: string }>;
  pagination?: { total: number; page: number; limit: number; hasMore: boolean };
}

const INACTIVE_TENANT_STATUSES = new Set(["terminated", "inactive", "moved out", "evicted"]);

function isTenantActive(tenant: Tenant, today = new Date()) {
  if (INACTIVE_TENANT_STATUSES.has(String(tenant.status || "").trim().toLowerCase())) return false;
  const start = new Date(tenant.leaseStartDate);
  const end = new Date(tenant.leaseEndDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return startDay <= day && endDay >= day;
}

export default function NotificationsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const { isFree } = useAccountTier();
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
  const [isCreatingNotification, setIsCreatingNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    async function makeAuthenticatedRequestInner(url: string, options: RequestInit, retries = 1): Promise<Response> {
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
          return makeAuthenticatedRequestInner(url, { ...options, headers }, retries - 1);
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
      router.push("/");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      router.push("/");
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
      const firstPage = tenantsData.tenants;
      const pageCount = Math.ceil((tenantsData.total || firstPage.length) / 100);
      const laterPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, async (_, index) => {
        const page = index + 2;
        const response = await makeAuthenticatedRequest(
          `/api/tenants?userId=${encodeURIComponent(effectiveOwnerId)}&page=${page}&limit=100`,
          { method: "GET" }
        );
        const data: ApiResponse<Tenant[]> = await response.json();
        return data.success ? data.tenants || [] : [];
      }));
      const allTenants = [...firstPage, ...laterPages.flat()];
      const activeTenants = allTenants.filter((tenant) => isTenantActive(tenant));
      const propertiesResponse = await makeAuthenticatedRequest(
        `/api/properties?userId=${encodeURIComponent(effectiveOwnerId)}&page=1&limit=500`,
        { method: "GET" }
      );
      const propertiesData: PropertyListResponse = await propertiesResponse.json();
      const propertyLookup = Object.fromEntries((propertiesData.properties || []).map((property) => [property._id, property.name]));
      setError(null);
      setTenants(activeTenants.map((tenant) => ({ ...tenant, propertyName: propertyLookup[tenant.propertyId] })));
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
          title: notification.title,
          categoryLabel: notification.categoryLabel,
          message: notification.message,
          tenantId: notification.tenantId,
          type: notification.type,
          deliveryMethod: notification.deliveryMethod,
        }),
      });
      const data: ApiResponse<{ notifications?: Notification[] }> = await response.json();
      const retriedNotification = data.data?.notifications?.[0];
      if (response.ok && data.success && retriedNotification) {
        setNotifications((prev) => [retriedNotification, ...prev.filter((n) => n._id !== notificationId)]);
      }
    } catch (err) {
      setError("Failed to retry notification.");
    } finally {
      setIsLoading(false);
    }
  };

  const createNotification = async (draft: NotificationDraft): Promise<{ failedIds: string[]; errorMessage?: string }> => {
    if (!effectiveOwnerId || !csrfToken || draft.tenantIds.length === 0) return { failedIds: draft.tenantIds, errorMessage: "Your session has expired. Refresh the page and try again." };
    if (!canSendNotifications) {
      setError("You do not have permission to send notifications.");
      return { failedIds: draft.tenantIds, errorMessage: "You do not have permission to send notifications." };
    }
    setError(null);
    setSuccessMessage(null);
    setIsCreatingNotification(true);
    const successful: Notification[] = [];
    const failedTenantIds: string[] = [];
    const failureReasons: string[] = [];
    try {
      const uniqueTenantIds = Array.from(new Set(draft.tenantIds));
      for (let index = 0; index < uniqueTenantIds.length; index += 4) {
        const chunk = uniqueTenantIds.slice(index, index + 4);
        const outcomes = await Promise.all(chunk.map(async (tenantId) => {
          try {
            const response = await makeAuthenticatedRequest("/api/notifications", {
              method: "POST",
              body: JSON.stringify({
                title: draft.title,
                categoryLabel: draft.category,
                message: draft.message,
                tenantId,
                requireActiveTenant: true,
                type: draft.type,
                deliveryMethod: draft.deliveryMethod,
              }),
            });
            const data: ApiResponse<{ notifications?: Notification[] }> = await response.json();
            const created = data.data?.notifications || [];
            return response.ok && data.success && created.length > 0
              ? { tenantId, notifications: created, failure: false, reason: "" }
              : { tenantId, notifications: [], failure: true, reason: data.message || `Request failed (${response.status})` };
          } catch (requestError) {
            return { tenantId, notifications: [], failure: true, reason: requestError instanceof Error ? requestError.message : "Network error" };
          }
        }));
        for (const outcome of outcomes) {
          if (outcome.failure) {
            failedTenantIds.push(outcome.tenantId);
            if (outcome.reason) failureReasons.push(outcome.reason);
          }
          else successful.push(...outcome.notifications);
        }
      }

      if (successful.length > 0) {
        setNotifications((previous) => [...successful, ...previous]);
        await fetchNotifications();
      }
      const recipientsWithDeliveryFailure = successful.filter((notification) => notification.deliveryStatus === "failed").length;
      if (failedTenantIds.length === 0) {
        setIsCreateModalOpen(false);
        setSuccessMessage(`Notification created for ${successful.length} tenant${successful.length === 1 ? "" : "s"}.${recipientsWithDeliveryFailure ? ` ${recipientsWithDeliveryFailure} delivery${recipientsWithDeliveryFailure === 1 ? " needs" : "ies need"} attention in Sent notifications.` : " Delivery status is tracked in Sent notifications."}`);
      } else {
        setError(`${successful.length} of ${uniqueTenantIds.length} notification${successful.length === 1 ? " was" : "s were"} created. ${failedTenantIds.length} could not be submitted; ${failureReasons[0] || "please check the tenant details and try again"}`);
      }
      return {
        failedIds: failedTenantIds,
        errorMessage: failedTenantIds.length > 0
          ? `${failedTenantIds.length} notification${failedTenantIds.length === 1 ? " was" : "s were"} not submitted. ${failureReasons[0] || "Check the tenant details and try again."}`
          : undefined,
      };
    } catch (err) {
      setError("Failed to create notification.");
      return { failedIds: failedTenantIds.length > 0 ? failedTenantIds : draft.tenantIds, errorMessage: "The request failed before all recipients were processed. Your message is still here; try again." };
    } finally {
      setIsCreatingNotification(false);
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
    const displayStatus = status === "success" ? "sent" : status;
    const error = notification.errorDetails || "";
    const base = method === "both" ? "SMS, Email & WhatsApp" : method.charAt(0).toUpperCase() + method.slice(1);
    return error.includes("1007") ? `${base} - Verify Device ID` : `${base} (${displayStatus})`;
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8 transition-all duration-300">
        <main className="mx-auto max-w-7xl space-y-6">
          <PremiumGate
            locked={isFree}
            title="Upgrade to enable notifications"
            message="Notifications and automated reminders are Premium features. Upgrade to unlock sending, viewing, and managing notifications."
          >
            <>
              <NotificationsHeader
                viewMode={viewMode}
                setViewMode={setViewMode}
                onCreateNotification={() => {
                  if (isFree) {
                    setError("Notifications are locked on the Free tier. Upgrade to Premium to send notifications.");
                    return;
                  }
                  if (!canSendNotifications) {
                    setError("You do not have permission to send notifications.");
                    return;
                  }
                  setError(null);
                  setSuccessMessage(null);
                  setIsCreateModalOpen(true);
                }}
                onSendReminders={!isFree && viewMode === "upcoming" && canTriggerReminders ? triggerReminders : undefined}
                isLoading={isLoading}
                tenantsCount={tenants.length}
                csrfToken={csrfToken}
              />

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700 shadow-md text-xs sm:text-sm">
                  {error}
                </div>
              )}
              {successMessage && (
                <div role="status" className="rounded-2xl border border-emerald-300/50 bg-emerald-50 p-3 text-emerald-900 shadow-sm dark:bg-emerald-950/30 dark:text-emerald-100 text-xs sm:text-sm">
                  {successMessage}
                </div>
              )}

              {isLoading && paginatedItems.length === 0 ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">{Array.from({ length: 4 }, (_, index) => <div key={index} className="surface-card flex items-center gap-3 rounded-2xl p-4"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>
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
                    onRetry={!isFree && viewMode === "sent" && canSendNotifications ? retryNotification : undefined}
                    onDelete={!isFree && viewMode === "sent" && canManageNotifications ? openDeleteConfirmation : undefined}
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
            </>
          </PremiumGate>

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
                {selectedNotification.title && <div><p className="font-medium text-gray-600">Title</p><p className="mt-1 font-semibold">{selectedNotification.title}</p></div>}
                <div>
                  <p className="font-medium text-gray-600">Message</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedNotification.message}</p>
                </div>
                {selectedNotification.categoryLabel && <div><p className="font-medium text-gray-600">Category</p><p className="mt-1 capitalize">{selectedNotification.categoryLabel.replaceAll("_", " ")}</p></div>}
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
                  {selectedNotification.deliveryStatus === "failed" && !isFree && canSendNotifications && (
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
                <div><p className="font-medium text-gray-600">Penalties</p><p>Ksh. {selectedReminder.penaltiesDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Total Amount Due</p><p className="font-bold text-primary">Ksh. {selectedReminder.totalDue.toFixed(2)}</p></div>
                <div><p className="font-medium text-gray-600">Due Date</p><p>{selectedReminder.dueDate}</p></div>
              </div>
            )}
          </Modal>

          <NotificationComposerModal
            isOpen={isCreateModalOpen}
            tenants={tenants as ComposerTenant[]}
            isSending={isCreatingNotification}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={createNotification}
          />

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














