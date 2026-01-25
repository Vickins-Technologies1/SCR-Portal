"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
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

  const [tenants, setTenants] = useState<ResponseTenant[]>([]);
  const [properties, setProperties] = useState<ClientProperty[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"active" | "inactive" | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentPromptOpen, setIsPaymentPromptOpen] = useState(false);
  const [isResendModalOpen, setIsResendModalOpen] = useState(false); // ← NEW
  const [tenantToResend, setTenantToResend] = useState<ResponseTenant | null>(null); // ← NEW
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTenant, setEditingTenant] = useState<ResponseTenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [pendingTenantData, setPendingTenantData] = useState<Partial<TenantRequest> | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false); // ← NEW: loading for resend

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
        const res = await fetch("/api/csrf-token", {
          credentials: "include",
        });
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

  // Auth check
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    setUserId(uid || null);
    setRole(userRole || null);

    if (!uid || userRole !== "propertyOwner") {
      router.push("/");
    }
  }, [router]);

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const res = await fetch(`/api/user?userId=${userId}&role=${role}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPaymentStatus(data.user.paymentStatus || "inactive");
        setWalletBalance(data.user.walletBalance || 0);
      }
    } catch {}
  }, [userId, role, csrfToken]);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        userId,
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
        setTenants(data.tenants || []);
        setTotalTenants(data.total || 0);
      } else {
        setError(data.message || "Failed to load tenants");
      }
    } catch {
      setError("Failed to load tenants.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken, page, limit, filters]);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const res = await fetch(`/api/properties?userId=${userId}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties || []);
      }
    } catch {}
  }, [userId, csrfToken]);

  // Fetch pending invoices
  const fetchPendingInvoices = useCallback(async () => {
    if (!userId || !csrfToken) return;
    try {
      const res = await fetch("/api/invoices", {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) setPendingInvoices(data.pendingInvoices || 0);
    } catch {}
  }, [userId, csrfToken]);

  // Load all data
  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      Promise.all([
        fetchUserData(),
        fetchTenants(),
        fetchProperties(),
        fetchPendingInvoices(),
      ]).catch(() => setError("Failed to load initial data."));
    }
  }, [userId, role, csrfToken, fetchUserData, fetchTenants, fetchProperties, fetchPendingInvoices]);

  // ────────────────────────────────────────────────
  //  Resend Welcome Notification Handler (now opens modal)
  // ────────────────────────────────────────────────
  const handleResendWelcome = useCallback((tenant: ResponseTenant) => {
    setTenantToResend(tenant);
    setIsResendModalOpen(true);
  }, []);

  // Confirm and send resend request
  const confirmResend = useCallback(async () => {
    if (!tenantToResend || !csrfToken || !userId) return;

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
        // Optional: log delivery details
        console.log("Delivery results:", data.delivery);
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
  }, [tenantToResend, csrfToken, userId]);

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

  // Handle tenant submit
  const handleTenantSubmit = async (data: any) => {
    if (!userId || !csrfToken) return;

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
        body: JSON.stringify({ ...data, ownerId: userId }),
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
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Users className="text-[#012a4a]" />
              Manage Tenants
            </h1>
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium ${
                isLoading || !csrfToken
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-[#012a4a] hover:bg-[#014a7a]"
              }`}
              disabled={isLoading || !csrfToken}
            >
              <Plus className="h-5 w-5" />
              Add Tenant
            </button>
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
            {tenants.length >= 3 && paymentStatus !== "active" && (
              <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 mb-6 rounded-lg">
                Note: Adding more tenants may require a management fee payment.
              </div>
            )}
          </AnimatePresence>

          {/* Tenants Table */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#012a4a]"></div>
              <p className="mt-4 text-gray-600">Loading tenants...</p>
            </div>
          ) : (
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
              userId={userId}
              csrfToken={csrfToken}
              onEdit={openEditModal}
              onDelete={(id) => {
                setTenantToDelete(id);
                setIsDeleteModalOpen(true);
              }}
              onResendWelcome={handleResendWelcome}
            />
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

            {/* NEW: Resend Confirmation Modal */}
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
                  setIsModalOpen(true); // re-open form on cancel
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
                userId={userId || ""}
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