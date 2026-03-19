"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { Users, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Shared components
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";
import TenantsTable from "../components/TenantsTable";
import TenantFormContent from "../components/TenantFormContent";

// Types
import { TenantRequest, ResponseTenant } from "../../../types/tenant";

interface ClientProperty {
  _id: string;
  name: string;
  address: string;
  unitTypes: {
    uniqueType: string;
    type: string;
    price: number;
    deposit: number;
    managementType: "RentCollection" | "FullManagement";
    managementFee: number;
    quantity: number;
  }[];
  managementFee: number;
  createdAt: string;
  updatedAt: string;
  rentPaymentDate: string;
  ownerId: string;
  status: string;
}

interface FilterConfig {
  tenantName: string;
  tenantEmail: string;
  propertyId: string;
  unitType: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewTenants = perm.hasPermission("tenants:view");
  const canManageTenants = perm.hasPermission("tenants:edit");
  const canSendNotifications = perm.hasPermission("notifications:send");

  const [tenants, setTenants] = useState<ResponseTenant[]>([]);
  const [properties, setProperties] = useState<ClientProperty[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string>(""); // For team members to show context
  const [paymentStatus, setPaymentStatus] = useState<"active" | "inactive" | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number>(0);
  const [dueStatus, setDueStatus] = useState<{ isDue: boolean; pendingInvoices: number; dueProperties: { propertyId: string; propertyName: string; dueDate: string }[] } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentPromptOpen, setIsPaymentPromptOpen] = useState(false);
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [tenantToResend, setTenantToResend] = useState<ResponseTenant | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTenant, setEditingTenant] = useState<ResponseTenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [pendingTenantData, setPendingTenantData] = useState<Partial<TenantRequest> | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const duesRequestId = useRef(0);

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalTenants, setTotalTenants] = useState(0);
  const [filters, setFilters] = useState<FilterConfig>({
    tenantName: "",
    tenantEmail: "",
    propertyId: "",
    unitType: "",
  });

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
      } catch {
        setError("Failed to fetch CSRF token.");
      }
    };
    fetchCsrfToken();
  }, []);

  // Auth check + determine effective owner
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
      // Prefer cookie first (set during login)
      ownerIdToUse = ownerIdFromCookie || uid || null;
    }

    if (!uid || !["propertyOwner", "teamMember"].includes(userRole || "")) {
      router.push("/");
      return;
    }

    if (!ownerIdToUse) {
      setError("Could not determine property owner. Please log in again.");
      return;
    }

    setEffectiveOwnerId(ownerIdToUse);
  }, [router, canViewTenants]);

  // Fetch user/owner name (especially useful for team members)
  const fetchUserData = useCallback(async () => {
    if (!userId || !csrfToken || !effectiveOwnerId) return;

    try {
      const res = await fetch(`/api/user?userId=${effectiveOwnerId}&role=propertyOwner`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.user) {
        setOwnerName(data.user.name || "Property Owner");
        setPaymentStatus(data.user.paymentStatus || "inactive");
        setWalletBalance(data.user.walletBalance || 0);
      }
    } catch (err) {
      console.error("Failed to fetch owner info:", err);
    }
  }, [userId, csrfToken, effectiveOwnerId]);

  const enrichTenantsWithDues = useCallback(
    async (tenantList: ResponseTenant[]) => {
      if (!effectiveOwnerId || !csrfToken || tenantList.length === 0) return;
      const requestId = ++duesRequestId.current;

      const enriched = await Promise.all(
        tenantList.map(async (tenant) => {
          try {
            const res = await fetch("/api/tenants/check-dues", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrfToken,
              },
              credentials: "include",
              body: JSON.stringify({ tenantId: tenant._id, userId: effectiveOwnerId }),
            });
            const data = await res.json();
            if (data.success) {
              return {
                ...tenant,
                dues: data.dues,
                totalRentPaid: data.tenant?.totalRentPaid ?? tenant.totalRentPaid,
                totalDepositPaid: data.tenant?.totalDepositPaid ?? tenant.totalDepositPaid,
                totalUtilityPaid: data.tenant?.totalUtilityPaid ?? tenant.totalUtilityPaid,
                paymentStatus: data.tenant?.paymentStatus ?? tenant.paymentStatus,
              };
            }
          } catch {}
          return tenant;
        })
      );

      if (requestId === duesRequestId.current) {
        setTenants(enriched);
      }
    },
    [csrfToken, effectiveOwnerId]
  );

  // Fetch tenants (using effectiveOwnerId)
  const fetchTenants = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        userId: effectiveOwnerId,
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.tenantName && { name: filters.tenantName }),
        ...(filters.tenantEmail && { email: filters.tenantEmail }),
        ...(filters.propertyId && { propertyId: filters.propertyId }),
        ...(filters.unitType && { unitType: filters.unitType }),
      }).toString();

      const res = await fetch(`/api/tenants?${query}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const baseTenants = data.tenants || [];
        setTenants(baseTenants);
        setTotalTenants(data.total || 0);
        enrichTenantsWithDues(baseTenants);
      } else {
        setError(data.message || "Failed to load tenants");
      }
    } catch {
      setError("Failed to load tenants.");
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOwnerId, csrfToken, page, limit, filters, enrichTenantsWithDues]);

  // Fetch properties (using effectiveOwnerId)
  const fetchProperties = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${effectiveOwnerId}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties || []);
      }
    } catch (err) {
      console.error("Failed to fetch properties:", err);
    }
  }, [effectiveOwnerId, csrfToken]);

  const fetchDueStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/owner-dues", { credentials: "include" });
      const data = await res.json();
      if (data.success) setDueStatus(data);
    } catch {}
  }, []);

  // Fetch pending invoices (scoped to effective owner)
  const fetchPendingInvoices = useCallback(async () => {
    if (!effectiveOwnerId || !csrfToken) return;
    try {
      const res = await fetch(`/api/invoices?userId=${effectiveOwnerId}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) setPendingInvoices(data.pendingInvoices || 0);
    } catch {}
  }, [effectiveOwnerId, csrfToken]);

  // Load all data when effectiveOwnerId & csrfToken are ready
  useEffect(() => {
    if (effectiveOwnerId && csrfToken) {
      Promise.all([
        fetchUserData(),
        fetchTenants(),
        fetchProperties(),
        fetchPendingInvoices(),
        fetchDueStatus(),
      ]).catch(() => setError("Failed to load initial data."));
    }
  }, [
    effectiveOwnerId,
    csrfToken,
    page,
    limit,
    filters,
    fetchUserData,
    fetchTenants,
    fetchProperties,
    fetchPendingInvoices,
    fetchDueStatus,
  ]);

  // ────────────────────────────────────────────────
  //  Resend Welcome Notification Handler
  // ────────────────────────────────────────────────
  const handleResendWelcome = useCallback((tenant: ResponseTenant) => {
    setTenantToResend(tenant);
    setIsResendModalOpen(true);
  }, []);

  const confirmResend = useCallback(async () => {
    if (!tenantToResend || !csrfToken || !effectiveOwnerId) return;

    setIsResending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/tenants/resend-welcome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenantToResend._id }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage(`Welcome notification resent to ${tenantToResend.name}`);
      } else {
        setError(data.message || "Failed to resend welcome notification");
      }
    } catch (err) {
      console.error("Resend welcome failed:", err);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setIsResending(false);
      setIsResendModalOpen(false);
      setTenantToResend(null);
    }
  }, [tenantToResend, csrfToken, effectiveOwnerId, canSendNotifications]);

  // Modal handlers
  const openAddModal = () => {
    setModalMode("add");
    setEditingTenant(null);
    setPendingTenantData(null);
    setIsModalOpen(true);
  };

  const openEditModal = (tenant: ResponseTenant) => {
    setModalMode("edit");
    setEditingTenant(tenant);
    setIsModalOpen(true);
  };

  // Handle tenant submit (add/edit)
  const handleTenantSubmit = async (data: any) => {
    if (!effectiveOwnerId || !csrfToken) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const url = modalMode === "add" ? "/api/tenants" : `/api/tenants/${editingTenant?._id}`;
      const method = modalMode === "add" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ ...data, ownerId: effectiveOwnerId }),
      });

      const result = await res.json();

      if (result.success) {
        setSuccessMessage(`Tenant ${modalMode === "add" ? "added" : "updated"} successfully!`);
        setIsModalOpen(false);
        fetchTenants();
        fetchUserData();
        fetchPendingInvoices();
      } else if (result.message?.toLowerCase().includes("invoice") || result.message?.includes("payment")) {
        setPendingTenantData(data);
        setError(result.message);
        setIsPaymentPromptOpen(true);
      } else {
        setError(result.message || "Operation failed");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  // Delete tenant
  const confirmDelete = async () => {
    if (!tenantToDelete || !csrfToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantToDelete}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Tenant deleted successfully!");
        fetchTenants();
      } else {
        setError(data.message || "Failed to delete tenant");
      }
    } catch {
      setError("Failed to delete tenant");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
    }
  };

  // Determine if user can add tenants (simple check — you can tie to permissions later)
  const canAddTenants = canManageTenants && !dueStatus?.isDue;
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />

      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          {/* Header */}
          <motion.div
            className="flex justify-between items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
                <Users className="text-[#012a4a]" />
                Manage Tenants
              </h1>
              {role === "teamMember" && ownerName && (
                <p className="text-sm text-gray-600 mt-1">
                  for {ownerName}
                </p>
              )}
            </div>

            {canAddTenants && (
              <button
                onClick={openAddModal}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium ${
                  isLoading || !csrfToken || !effectiveOwnerId
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#012a4a] hover:bg-[#014a7a]"
                }`}
                disabled={isLoading || !csrfToken || !effectiveOwnerId}
              >
                <Plus className="h-5 w-5" />
                Add Tenant
              </button>
            )}
          </motion.div>

          {/* Alerts */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-green-100 border border-green-300 text-green-800 p-4 mb-4 rounded-lg"
              >
                {successMessage}
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-100 border border-red-300 text-red-800 p-4 mb-4 rounded-lg"
              >
                {error}
              </motion.div>
            )}
            {pendingInvoices > 0 && (
              <div className="bg-blue-100 border border-blue-300 text-blue-800 p-4 mb-6 rounded-lg">
                You have {pendingInvoices} pending invoice{pendingInvoices > 1 ? "s" : ""}.
              </div>
            )}
            {dueStatus?.isDue && (
              <div className="bg-amber-100 border border-amber-300 text-amber-900 p-4 mb-6 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>
                  Payment required: Your grace period has ended. Please pay your invoice to add tenants.
                </span>
                <Link
                  href="/property-owner-dashboard/reports?tab=invoices"
                  className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700"
                >
                  Go to Invoices
                </Link>
              </div>
            )}
          </AnimatePresence>

          {/* Tenants Table */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#012a4a]"></div>
              <p className="mt-4 text-gray-600">Loading tenants...</p>
            </div>
          ) : effectiveOwnerId ? (
            <TenantsTable
              tenants={tenants}
              properties={properties}
              filters={filters}
              setFilters={setFilters}
              page={page}
              setPage={setPage}
              limit={limit}
              setLimit={setLimit}
              totalTenants={totalTenants}
              isLoading={isLoading}
              userId={effectiveOwnerId} // ← changed to effective
              csrfToken={csrfToken}
              onEdit={openEditModal}
              onDelete={(id) => {
                setTenantToDelete(id);
                setIsDeleteModalOpen(true);
              }}
              onResendWelcome={handleResendWelcome}
            />
          ) : (
            <div className="text-center py-12 text-gray-600">
              Loading account information...
            </div>
          )}

          {/* Modals */}
          <AnimatePresence>
            {isModalOpen && (
              <Modal
                title={modalMode === "add" ? "Add New Tenant" : "Edit Tenant"}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
              >
                <TenantFormContent
                  mode={modalMode}
                  initialData={
                    modalMode === "edit" && editingTenant
                      ? {
                          ...editingTenant,
                          leaseStartDate: editingTenant.leaseStartDate.split("T")[0],
                          leaseEndDate: editingTenant.leaseEndDate.split("T")[0],
                        }
                      : pendingTenantData || {}
                  }
                  properties={properties}
                  onSubmit={handleTenantSubmit}
                  onCancel={() => setIsModalOpen(false)}
                  isLoading={isLoading}
                  csrfToken={csrfToken}
                  tenantsCount={tenants.length}
                />
              </Modal>
            )}

            {isDeleteModalOpen && (
              <Modal title="Confirm Delete" isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
                <p className="mb-6 text-gray-700">
                  Are you sure you want to delete this tenant? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={isLoading}
                    className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {isLoading ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </Modal>
            )}

            {isResendModalOpen && tenantToResend && (
              <Modal
                title="Resend Welcome Notification"
                isOpen={isResendModalOpen}
                onClose={() => {
                  setIsResendModalOpen(false);
                  setTenantToResend(null);
                }}
              >
                <p className="mb-6 text-gray-700">
                  Are you sure you want to resend the welcome notification to{" "}
                  <strong>{tenantToResend.name}</strong> ({tenantToResend.email})?
                </p>
                <p className="mb-6 text-sm text-gray-600">
                  This will generate a new password reset link and send it via email, SMS, and WhatsApp.
                </p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsResendModalOpen(false);
                      setTenantToResend(null);
                    }}
                    className="px-5 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    disabled={isResending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmResend}
                    disabled={isResending}
                    className={`px-5 py-2 text-white rounded-lg transition ${
                      isResending
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {isResending ? "Resending..." : "Resend Notification"}
                  </button>
                </div>
              </Modal>
            )}

            {isPaymentPromptOpen && pendingTenantData && (
              <PaymentModal
                isOpen={isPaymentPromptOpen}
                onClose={() => {
                  setIsPaymentPromptOpen(false);
                  setIsModalOpen(true);
                }}
                onSuccess={() => {
                  setSuccessMessage("Payment successful! Tenant added.");
                  setPendingTenantData(null);
                  fetchUserData();
                  fetchPendingInvoices();
                  fetchTenants();
                  setIsPaymentPromptOpen(false);
                }}
                onError={(msg) => setError(msg)}
                properties={properties}
                initialPropertyId={pendingTenantData.propertyId || ""}
                initialPhone={pendingTenantData.phone || ""}
                userId={effectiveOwnerId || ""}
              />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Global Font */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}


















