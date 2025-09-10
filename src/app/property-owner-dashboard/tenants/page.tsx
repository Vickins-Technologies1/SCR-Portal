"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Users, Plus, EyeIcon, EyeOffIcon } from "lucide-react";
import { TenantRequest } from "../../../types/tenant";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";
import TenantsTable from "../components/TenantsTable";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  status: string;
  paymentStatus: string;
}

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
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<ClientProperty[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"active" | "inactive" | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentPromptOpen, setIsPaymentPromptOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantPassword, setTenantPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitType, setSelectedUnitType] = useState("");
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [totalRentPaid, setTotalRentPaid] = useState("");
  const [totalUtilityPaid, setTotalUtilityPaid] = useState("");
  const [totalDepositPaid, setTotalDepositPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [pendingTenantData, setPendingTenantData] = useState<Partial<TenantRequest> | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10); // Changed to dynamic state with setLimit
  const [totalTenants, setTotalTenants] = useState(0);
  const [filters, setFilters] = useState<FilterConfig>({
    tenantName: "",
    tenantEmail: "",
    propertyId: "",
    unitType: "",
  });

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token");
        const data = await res.json();
        if (data.success) {
          setCsrfToken(data.csrfToken);
          Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", expires: 1 });
        } else {
          setError("Failed to fetch CSRF token.");
        }
      } catch {
        setError("Failed to connect to server for CSRF token.");
      }
    };
    fetchCsrfToken();
  }, []);

  // Check cookies and redirect if unauthorized
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

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId || !role) return;
    try {
      const res = await fetch(`/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPaymentStatus(data.user.paymentStatus || "inactive");
        setWalletBalance(data.user.walletBalance || 0);
      } else {
        if (res.status === 404) {
          setError("User account not found. Please log in again.");
          Cookies.remove("userId");
          Cookies.remove("role");
          router.push("/");
        } else {
          setError(data.message || "Failed to fetch user data.");
        }
      }
    } catch {
      setError("Failed to connect to the server. Please try again later.");
    }
  }, [userId, role, router, csrfToken]);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        userId: encodeURIComponent(userId),
        page: page.toString(),
        limit: limit.toString(), // Updated to use dynamic limit
        ...(filters.tenantName && { name: filters.tenantName }),
        ...(filters.tenantEmail && { email: filters.tenantEmail }),
        ...(filters.propertyId && { propertyId: filters.propertyId }),
        ...(filters.unitType && { unitType: filters.unitType }),
      }).toString();
      const res = await fetch(`/api/tenants?${query}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const normalizedTenants = (data.tenants || []).map((tenant: Tenant) => ({
          ...tenant,
          walletBalance: tenant.walletBalance ?? 0,
          totalRentPaid: tenant.totalRentPaid ?? 0,
          totalUtilityPaid: tenant.totalUtilityPaid ?? 0,
          totalDepositPaid: tenant.totalDepositPaid ?? 0,
          status: tenant.status || "active",
          paymentStatus: tenant.paymentStatus || "active",
        }));
        setTenants(normalizedTenants);
        setTotalTenants(data.total || 0);
      } else {
        setError(data.message || "Failed to fetch tenants.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, page, limit, csrfToken, filters]); // Added limit to dependencies

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const properties = data.properties.map((p: ClientProperty) => ({
          ...p,
          unitTypes: p.unitTypes.map((u: ClientProperty["unitTypes"][0], index: number) => ({
            ...u,
            uniqueType: u.uniqueType || `${u.type}-${index}`,
            managementFee: typeof u.managementFee === "string" ? parseFloat(u.managementFee) : u.managementFee,
            quantity: u.quantity ?? 1,
          })),
          address: p.address || "",
          managementFee: p.managementFee || 0,
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
          rentPaymentDate: p.rentPaymentDate || "1",
          ownerId: p.ownerId || userId,
          status: p.status || "active",
        }));
        setProperties(properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId, csrfToken]);

  // Fetch pending invoices
  const fetchPendingInvoices = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/invoices`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setPendingInvoices(data.pendingInvoices || 0);
      } else {
        setError(data.message || "Failed to fetch invoice status.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId, csrfToken]);

  // Fetch invoice status
  const fetchInvoiceStatus = useCallback(
    async (propertyId: string, uniqueType: string) => {
      if (!userId || !propertyId || !uniqueType) {
        setError("Missing required parameters to check invoice status.");
        return null;
      }
      try {
        const url = `/api/invoices?userId=${encodeURIComponent(userId)}&propertyId=${encodeURIComponent(
          propertyId
        )}&unitType=${encodeURIComponent(uniqueType)}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && (data.status === null || ["pending", "completed", "failed"].includes(data.status))) {
          return data.status;
        }
        setError(data.message || "Failed to fetch invoice status.");
        return null;
      } catch {
        setError("Failed to connect to the server while checking invoice status.");
        return null;
      }
    },
    [userId, csrfToken]
  );

  // Fetch initial data
  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      Promise.all([
        fetchUserData(),
        fetchTenants(),
        fetchProperties(),
        fetchPendingInvoices(),
      ]).catch(() => {
        setError("Failed to load initial data. Please try again.");
      });
    }
  }, [userId, role, csrfToken, fetchUserData, fetchTenants, fetchProperties, fetchPendingInvoices]);

  // Reset tenant form
  const resetForm = useCallback(() => {
    setTenantName("");
    setTenantEmail("");
    setTenantPhone("");
    setTenantPassword("");
    setShowPassword(false);
    setSelectedPropertyId("");
    setSelectedUnitType("");
    setPrice("");
    setDeposit("");
    setHouseNumber("");
    setLeaseStartDate("");
    setLeaseEndDate("");
    setTotalRentPaid("");
    setTotalUtilityPaid("");
    setTotalDepositPaid("");
    setFormErrors({});
    setError(null);
  }, []);

  // Open add tenant modal
  const openAddModal = useCallback(async () => {
    if (paymentStatus === null || walletBalance === null) {
      setError("Unable to verify payment status. Please try again or log in.");
      return;
    }
    resetForm();
    setModalMode("add");
    setEditingTenantId(null);
    if (pendingTenantData) {
      setTenantName(pendingTenantData.name || "");
      setTenantEmail(pendingTenantData.email || "");
      setTenantPhone(pendingTenantData.phone || "");
      setTenantPassword(pendingTenantData.password || "");
      setSelectedPropertyId(pendingTenantData.propertyId || "");
      setSelectedUnitType(pendingTenantData.unitType || "");
      setPrice(pendingTenantData.price?.toString() || "");
      setDeposit(pendingTenantData.deposit?.toString() || "");
      setHouseNumber(pendingTenantData.houseNumber || "");
      setLeaseStartDate(pendingTenantData.leaseStartDate || "");
      setLeaseEndDate(pendingTenantData.leaseEndDate || "");
      setTotalRentPaid(pendingTenantData.totalRentPaid?.toString() || "");
      setTotalUtilityPaid(pendingTenantData.totalUtilityPaid?.toString() || "");
      setTotalDepositPaid(pendingTenantData.totalDepositPaid?.toString() || "");
    }
    setIsModalOpen(true);
  }, [paymentStatus, walletBalance, pendingTenantData, resetForm]);

  // Open edit tenant modal
  const openEditModal = useCallback((tenant: Tenant) => {
    if (paymentStatus === null || walletBalance === null) {
      setError("Unable to verify payment status. Please try again or log in.");
      return;
    }
    setModalMode("edit");
    setEditingTenantId(tenant._id);
    setTenantName(tenant.name);
    setTenantEmail(tenant.email);
    setTenantPhone(tenant.phone);
    setSelectedPropertyId(tenant.propertyId);
    setSelectedUnitType(tenant.unitType);
    setPrice(tenant.price.toString());
    setDeposit(tenant.deposit.toString());
    setHouseNumber(tenant.houseNumber);
    setLeaseStartDate(tenant.leaseStartDate);
    setLeaseEndDate(tenant.leaseEndDate);
    setTotalRentPaid((tenant.totalRentPaid ?? 0).toString());
    setTotalUtilityPaid((tenant.totalUtilityPaid ?? 0).toString());
    setTotalDepositPaid((tenant.totalDepositPaid ?? 0).toString());
    setTenantPassword("");
    setShowPassword(false);
    setFormErrors({});
    setError(null);
    setIsModalOpen(true);
  }, [paymentStatus, walletBalance]);

  // Handle tenant deletion
  const handleDelete = useCallback((id: string) => {
    setTenantToDelete(id);
    setIsDeleteModalOpen(true);
  }, []);

  // Confirm tenant deletion
  const confirmDelete = useCallback(async () => {
    if (!tenantToDelete) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Tenant deleted successfully!");
        fetchTenants();
      } else {
        setError(data.message || "Failed to delete tenant.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
    }
  }, [tenantToDelete, fetchTenants, csrfToken]);

  // Validate tenant form
  const validateForm = useCallback(() => {
    const errors: { [key: string]: string | undefined } = {};
    if (!tenantName.trim()) errors.tenantName = "Full name is required";
    if (!tenantEmail.trim()) errors.tenantEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail)) errors.tenantEmail = "Invalid email format";
    if (!tenantPhone.trim()) errors.tenantPhone = "Phone number is required";
    else if (!/^\+?\d{10,15}$/.test(tenantPhone)) errors.tenantPhone = "Invalid phone number (10-15 digits, optional +)";
    if (modalMode === "add" && !tenantPassword.trim()) errors.tenantPassword = "Password is required";
    if (!selectedPropertyId) errors.selectedPropertyId = "Property is required";
    if (!selectedUnitType) errors.selectedUnitType = "Unit type is required";
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.price = "Price must be a non-negative number";
    if (!deposit || isNaN(parseFloat(deposit)) || parseFloat(deposit) < 0) errors.deposit = "Deposit must be a non-negative number";
    if (!houseNumber.trim()) errors.houseNumber = "House number is required";
    if (!leaseStartDate || isNaN(Date.parse(leaseStartDate))) errors.leaseStartDate = "Valid lease start date is required";
    if (!leaseEndDate || isNaN(Date.parse(leaseEndDate))) errors.leaseEndDate = "Valid lease end date is required";
    else if (new Date(leaseEndDate) <= new Date(leaseStartDate)) errors.leaseEndDate = "Lease end date must be after start date";
    if (totalRentPaid && (isNaN(parseFloat(totalRentPaid)) || parseFloat(totalRentPaid) < 0)) errors.totalRentPaid = "Total rent paid must be a non-negative number";
    if (totalUtilityPaid && (isNaN(parseFloat(totalUtilityPaid)) || parseFloat(totalUtilityPaid) < 0)) errors.totalUtilityPaid = "Total utility paid must be a non-negative number";
    if (totalDepositPaid && (isNaN(parseFloat(totalDepositPaid)) || parseFloat(totalDepositPaid) < 0)) errors.totalDepositPaid = "Total deposit paid must be a non-negative number";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [tenantName, tenantEmail, tenantPhone, tenantPassword, selectedPropertyId, selectedUnitType, price, deposit, houseNumber, leaseStartDate, leaseEndDate, totalRentPaid, totalUtilityPaid, totalDepositPaid, modalMode]);

  // Handle tenant form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateForm()) return;
      if (!userId) {
        setError("User ID is missing.");
        return;
      }
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      const tenantData: TenantRequest = {
        name: tenantName,
        email: tenantEmail,
        phone: tenantPhone,
        password: tenantPassword || undefined,
        role: "tenant",
        propertyId: selectedPropertyId,
        unitType: selectedUnitType,
        price: parseFloat(price) || 0,
        deposit: parseFloat(deposit) || 0,
        houseNumber,
        leaseStartDate,
        leaseEndDate,
        ownerId: userId,
        totalRentPaid: parseFloat(totalRentPaid) || 0,
        totalUtilityPaid: parseFloat(totalUtilityPaid) || 0,
        totalDepositPaid: parseFloat(totalDepositPaid) || 0,
      };

      try {
        const url = modalMode === "add" ? "/api/tenants" : `/api/tenants/${editingTenantId}`;
        const method = modalMode === "add" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify(tenantData),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMessage(`Tenant ${modalMode === "add" ? "added" : "updated"} successfully!`);
          setIsModalOpen(false);
          setPendingTenantData(null);
          resetForm();
          fetchTenants();
          fetchUserData();
          fetchPendingInvoices();
        } else {
          if (data.message.includes("Cannot add more tenants until the invoice")) {
            setPendingTenantData(tenantData);
            setError(data.message);
            setIsPaymentPromptOpen(true);
          } else {
            setError(data.message || `Failed to ${modalMode === "add" ? "add" : "update"} tenant.`);
          }
        }
      } catch {
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
      }
    },
    [userId, modalMode, editingTenantId, tenantName, tenantEmail, tenantPhone, tenantPassword, selectedPropertyId, selectedUnitType, price, deposit, houseNumber, leaseStartDate, leaseEndDate, totalRentPaid, totalUtilityPaid, totalDepositPaid, fetchTenants, fetchUserData, fetchPendingInvoices, resetForm, validateForm, csrfToken]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <Users className="text-[#012a4a]" />
              Manage Tenants
            </h1>
            <button
              onClick={openAddModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium text-sm sm:text-base ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#012a4a] hover:bg-[#014a7a]"}`}
              disabled={isLoading}
              aria-label="Add new tenant"
            >
              <Plus className="h-5 w-5" />
              Add Tenant
            </button>
          </div>
          {tenants.length >= 3 && (
            <div className="bg-yellow-100 text-yellow-700 p-4 mb-4 rounded-lg shadow">
              Note: Adding more tenants may require payment of a management fee for the selected unit type if no invoice has been paid.
            </div>
          )}
          {pendingInvoices > 0 && (
            <div className="bg-blue-100 text-blue-700 p-4 mb-4 rounded-lg shadow">
              You have {pendingInvoices} pending invoice{pendingInvoices === 1 ? '' : 's'}. Please settle them to add more tenants.
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {successMessage}
            </div>
          )}
          <TenantsTable
            tenants={tenants}
            properties={properties}
            filters={filters}
            setFilters={setFilters}
            page={page}
            setPage={setPage}
            limit={limit}
            setLimit={setLimit} // Added setLimit prop
            totalTenants={totalTenants}
            isLoading={isLoading}
            userId={userId}
            csrfToken={csrfToken}
            onEdit={openEditModal}
            onDelete={handleDelete}
          />
          <Modal
            title={modalMode === "add" ? "Add Tenant" : "Edit Tenant"}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              resetForm();
              setPendingTenantData(null);
              setError(null);
            }}
          >
            {error && (
              <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input
                  placeholder="Enter full name"
                  value={tenantName}
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      tenantName: e.target.value.trim() ? undefined : "Full name is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.tenantName ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.tenantName && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.tenantName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  placeholder="Enter email"
                  value={tenantEmail}
                  onChange={(e) => {
                    setTenantEmail(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      tenantEmail: e.target.value.trim()
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)
                          ? undefined
                          : "Invalid email format"
                        : "Email is required",
                    }));
                  }}
                  required
                  type="email"
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.tenantEmail ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.tenantEmail && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.tenantEmail}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  placeholder="Enter phone number (e.g., +254123456789)"
                  value={tenantPhone}
                  onChange={(e) => {
                    setTenantPhone(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      tenantPhone: e.target.value.trim()
                        ? /^\+?\d{10,15}$/.test(e.target.value)
                          ? undefined
                          : "Invalid phone number (10-15 digits, optional +)"
                        : "Phone number is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.tenantPhone ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.tenantPhone && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.tenantPhone}</p>
                )}
              </div>
              {modalMode === "add" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Temporary Password</label>
                  <div className="relative">
                    <input
                      placeholder="Enter temporary password"
                      value={tenantPassword}
                      onChange={(e) => {
                        setTenantPassword(e.target.value);
                        setFormErrors((prev) => ({
                          ...prev,
                          tenantPassword: e.target.value.trim() ? undefined : "Password is required",
                        }));
                      }}
                      type={showPassword ? "text" : "password"}
                      required
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.tenantPassword ? "border-red-500" : "border-gray-300"}`}
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <EyeIcon className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {formErrors.tenantPassword && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.tenantPassword}</p>
                  )}
                </div>
              )}
              {modalMode === "edit" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password (optional)</label>
                  <div className="relative">
                    <input
                      placeholder="Enter new password (optional)"
                      value={tenantPassword}
                      onChange={(e) => setTenantPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base"
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <EyeIcon className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => {
                    setSelectedPropertyId(e.target.value);
                    setSelectedUnitType("");
                    setPrice("");
                    setDeposit("");
                    setFormErrors((prev) => ({
                      ...prev,
                      selectedPropertyId: e.target.value ? undefined : "Property is required",
                      selectedUnitType: undefined,
                      price: undefined,
                      deposit: undefined,
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.selectedPropertyId ? "border-red-500" : "border-gray-300"}`}
                >
                  <option value="">Select Property</option>
                  {properties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {formErrors.selectedPropertyId && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.selectedPropertyId}</p>
                )}
              </div>
              {selectedPropertyId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit Type</label>
                  <select
                    value={selectedUnitType}
                    onChange={async (e) => {
                      const uniqueType = e.target.value;
                      setSelectedUnitType(uniqueType);
                      const selectedProperty = properties.find((p) => p._id === selectedPropertyId);
                      const unit = selectedProperty?.unitTypes.find((u) => u.uniqueType === uniqueType);
                      if (unit) {
                        setPrice(unit.price.toString());
                        setDeposit(unit.deposit.toString());
                        setFormErrors((prev) => ({
                          ...prev,
                          selectedUnitType: uniqueType ? undefined : "Unit type is required",
                          price: unit.price >= 0 ? undefined : "Price must be a non-negative number",
                          deposit: unit.deposit >= 0 ? undefined : "Deposit must be a non-negative number",
                        }));
                        if (tenants.length >= 3 && uniqueType && modalMode === "add") {
                          const invoiceStatus = await fetchInvoiceStatus(selectedPropertyId, uniqueType);
                          if (invoiceStatus !== "completed") {
                            const tenantData: Partial<TenantRequest> = {
                              name: tenantName,
                              email: tenantEmail,
                              phone: tenantPhone,
                              password: tenantPassword,
                              propertyId: selectedPropertyId,
                              unitType: uniqueType,
                              price: parseFloat(price) || unit.price,
                              deposit: parseFloat(deposit) || unit.deposit,
                              houseNumber,
                              leaseStartDate,
                              leaseEndDate,
                              totalRentPaid: parseFloat(totalRentPaid) || 0,
                              totalUtilityPaid: parseFloat(totalUtilityPaid) || 0,
                              totalDepositPaid: parseFloat(totalDepositPaid) || 0,
                              role: "tenant",
                              ownerId: userId || "",
                            };
                            setPendingTenantData(tenantData);
                            setError(
                              invoiceStatus === "pending"
                                ? `Cannot add more tenants until the pending invoice for unit type ${unit.type} in property ${selectedProperty?.name || "unknown"} is paid.`
                                : invoiceStatus === "failed"
                                  ? `Cannot add tenants because the invoice for unit type ${unit.type} in property ${selectedProperty?.name || "unknown"} has failed. Please contact support.`
                                  : `No invoice found for unit type ${unit.type} in property ${selectedProperty?.name || "unknown"}. Please create an invoice.`
                            );
                            setIsModalOpen(false);
                            setIsPaymentPromptOpen(true);
                          } else {
                            setPendingTenantData(null);
                            setIsPaymentPromptOpen(false);
                            setError(null);
                          }
                        } else {
                          setPendingTenantData(null);
                          setIsPaymentPromptOpen(false);
                          setError(null);
                        }
                      } else {
                        setPrice("");
                        setDeposit("");
                        setFormErrors((prev) => ({
                          ...prev,
                          selectedUnitType: uniqueType ? undefined : "Unit type is required",
                          price: undefined,
                          deposit: undefined,
                        }));
                        setPendingTenantData(null);
                        setIsPaymentPromptOpen(false);
                        setError("Selected unit type not found.");
                      }
                    }}
                    required
                    className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.selectedUnitType ? "border-red-500" : "border-gray-300"}`}
                  >
                    <option value="">Select Unit Type</option>
                    {properties
                      .find((p) => p._id === selectedPropertyId)
                      ?.unitTypes.map((u) => (
                        <option key={u.uniqueType} value={u.uniqueType}>
                          {u.type} (Price: Ksh {u.price}, Deposit: Ksh {u.deposit}, {u.managementType}: Ksh {u.managementFee}/mo)
                        </option>
                      ))}
                  </select>
                  {formErrors.selectedUnitType && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.selectedUnitType}</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Price (Ksh/month)</label>
                <input
                  placeholder="Price (auto-filled)"
                  value={price}
                  readOnly
                  className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${formErrors.price ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.price && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.price}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Deposit (Ksh)</label>
                <input
                  placeholder="Deposit (auto-filled)"
                  value={deposit}
                  readOnly
                  className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${formErrors.deposit ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.deposit && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.deposit}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">House Number</label>
                <input
                  placeholder="Enter house number"
                  value={houseNumber}
                  onChange={(e) => {
                    setHouseNumber(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      houseNumber: e.target.value.trim() ? undefined : "House number is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.houseNumber ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.houseNumber && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.houseNumber}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lease Start Date</label>
                <input
                  type="date"
                  value={leaseStartDate}
                  onChange={(e) => {
                    setLeaseStartDate(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      leaseStartDate: e.target.value ? undefined : "Lease start date is required",
                      leaseEndDate:
                        e.target.value && leaseEndDate && new Date(leaseEndDate) <= new Date(e.target.value)
                          ? "Lease end date must be after start date"
                          : prev.leaseEndDate,
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.leaseStartDate ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.leaseStartDate && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.leaseStartDate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lease End Date</label>
                <input
                  type="date"
                  value={leaseEndDate}
                  onChange={(e) => {
                    setLeaseEndDate(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      leaseEndDate: e.target.value
                        ? new Date(e.target.value) <= new Date(leaseStartDate)
                          ? "Lease end date must be after start date"
                          : undefined
                        : "Lease end date is required",
                    }));
                  }}
                  required
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.leaseEndDate ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.leaseEndDate && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.leaseEndDate}</p>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                    setPendingTenantData(null);
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                  aria-label="Cancel tenant form"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    Object.values(formErrors).some((v) => v !== undefined) ||
                    !selectedPropertyId ||
                    !selectedUnitType
                  }
                  className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 text-sm sm:text-base ${isLoading ||
                    Object.values(formErrors).some((v) => v !== undefined) ||
                    !selectedPropertyId ||
                    !selectedUnitType
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#012a4a] hover:bg-[#014a7a]"
                    }`}
                  aria-label={modalMode === "add" ? "Add tenant" : "Update tenant"}
                >
                  {isLoading && (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  )}
                  {modalMode === "add" ? "Add Tenant" : "Update Tenant"}
                </button>
              </div>
            </form>
          </Modal>
          <Modal
            title="Confirm Delete"
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
          >
            <p className="mb-6 text-gray-700 text-sm sm:text-base">
              Are you sure you want to delete this tenant? This action cannot be undone.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                aria-label="Cancel delete tenant"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2 text-sm sm:text-base"
                disabled={isLoading}
                aria-label="Confirm delete tenant"
              >
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                )}
                Delete
              </button>
            </div>
          </Modal>
          <PaymentModal
            isOpen={isPaymentPromptOpen}
            onClose={() => {
              setIsPaymentPromptOpen(false);
              setIsModalOpen(true);
              setError(null);
            }}
            onSuccess={() => {
              setSuccessMessage("Payment processed successfully!");
              setPendingTenantData(null);
              fetchUserData();
              fetchPendingInvoices();
              fetchTenants();
              setIsPaymentPromptOpen(false);
              setIsModalOpen(true);
              setError(null);
            }}
            onError={(message) => {
              setError(message);
              setIsPaymentPromptOpen(false);
              setIsModalOpen(true);
            }}
            properties={properties}
            initialPropertyId={pendingTenantData?.propertyId ?? ""}
            initialPhone={pendingTenantData?.phone ?? ""}
            userId={userId ?? ""}
          />
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}
      </style>
    </div>
  );
}