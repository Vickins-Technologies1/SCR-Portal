"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Users, Pencil, Trash2, Plus, ArrowUpDown } from "lucide-react";
import { TenantRequest } from "../../../types/tenant";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";

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
}

interface Property {
  _id: string;
  name: string;
  unitTypes: { type: string; price: number; deposit: number; managementType: "RentCollection" | "FullManagement"; managementFee: number }[];
}

interface SortConfig {
  key: keyof Tenant | "propertyName";
  direction: "asc" | "desc";
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"active" | "inactive" | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentPromptOpen, setIsPaymentPromptOpen] = useState(false);
  const [isPaymentLoadingModalOpen, setIsPaymentLoadingModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantPassword, setTenantPassword] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitType, setSelectedUnitType] = useState("");
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [paymentPropertyId, setPaymentPropertyId] = useState("");
  const [paymentUnitType, setPaymentUnitType] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentFormErrors, setPaymentFormErrors] = useState<{ [key: string]: string | undefined }>({});
  const [pendingTenantData, setPendingTenantData] = useState<Partial<TenantRequest> | null>(null);

  // UMS Pay API configuration (replace with secure storage in production)
  const UMS_PAY_API_KEY = "your_api_key_here"; // Store in env variables
  const UMS_PAY_EMAIL = "merchant@example.com"; // Store in env variables
  const UMS_PAY_ACCOUNT_ID = "ACC-7890"; // Store in env variables

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    console.log("Cookies - userId:", uid, "role:", userRole);
    setUserId(uid || null);
    setRole(userRole || null);
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/login");
    }
  }, [router]);

  // Fetch user data (paymentStatus, walletBalance)
  const fetchUserData = useCallback(async () => {
    if (!userId || !role) return;
    try {
      const res = await fetch(`/api/user?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      console.log("fetchUserData response:", data);
      if (data.success) {
        setPaymentStatus(data.user.paymentStatus || "inactive");
        setWalletBalance(data.user.walletBalance || 0);
        console.log("Set paymentStatus:", data.user.paymentStatus, "walletBalance:", data.user.walletBalance);
      } else {
        if (res.status === 404) {
          setError("User account not found. Please log in again.");
          Cookies.remove("userId");
          Cookies.remove("role");
          router.push("/login");
        } else {
          setError(data.message || "Failed to fetch user data.");
        }
      }
    } catch {
      setError("Failed to connect to the server. Please try again later.");
    }
  }, [userId, role, router]);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tenants?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setTenants(data.tenants || []);
      } else {
        setError(data.message || "Failed to fetch tenants.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/properties?userId=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        const properties = data.properties.map((p: Property) => ({
          ...p,
          unitTypes: p.unitTypes.map((u: Property["unitTypes"][0]) => ({
            ...u,
            managementFee: typeof u.managementFee === "string" ? parseFloat(u.managementFee) : u.managementFee,
          })),
        }));
        setProperties(properties || []);
      } else {
        setError(data.message || "Failed to fetch properties.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId]);

  // Fetch pending invoices
  const fetchPendingInvoices = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/invoices`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      console.log("fetchPendingInvoices response:", data);
      if (data.success) {
        setPendingInvoices(data.pendingInvoices || 0);
      } else {
        setError(data.message || "Failed to fetch invoice status.");
      }
    } catch {
      setError("Failed to connect to the server.");
    }
  }, [userId]);

  // Fetch data when userId and role are set
  useEffect(() => {
    if (userId && role === "propertyOwner") {
      fetchUserData();
      fetchTenants();
      fetchProperties();
      fetchPendingInvoices();
      console.log("Payment status:", paymentStatus, "Wallet balance:", walletBalance, "Tenants count:", tenants.length, "Pending invoices:", pendingInvoices);
    }
  }, [userId, role, fetchUserData, fetchTenants, fetchProperties, fetchPendingInvoices]);

  // Reset tenant form
  const resetForm = useCallback(() => {
    setTenantName("");
    setTenantEmail("");
    setTenantPhone("");
    setTenantPassword("");
    setSelectedPropertyId("");
    setSelectedUnitType("");
    setPrice("");
    setDeposit("");
    setHouseNumber("");
    setLeaseStartDate("");
    setLeaseEndDate("");
    setFormErrors({});
  }, []);

  // Reset payment form
  const resetPaymentForm = useCallback(() => {
    setPaymentPropertyId("");
    setPaymentUnitType("");
    setPaymentAmount("");
    setPaymentFormErrors({});
  }, []);

  // Open add tenant modal
  const openAddModal = useCallback(() => {
    if (paymentStatus === null || walletBalance === null) {
      setError("Unable to verify payment status. Please try again or log in.");
      return;
    }
    if (tenants.length >= 3 && pendingInvoices > 0) {
      setError("Cannot add more tenants until all pending invoices are paid.");
      setIsPaymentPromptOpen(true);
      return;
    }
    if (tenants.length >= 3) {
      const unit = properties.find((p) => p.unitTypes.some((u) => u.type === selectedUnitType))?.unitTypes.find((u) => u.type === selectedUnitType);
      const requiredFee = unit ? unit.managementFee : 1000; // Fallback to 1000 if unit not selected
      if (paymentStatus !== "active" || walletBalance < requiredFee) {
        setError(`You need an active payment status and a minimum wallet balance of Ksh ${requiredFee} to add more than 2 tenants.`);
        setIsPaymentPromptOpen(true);
        return;
      }
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
    }
    setIsModalOpen(true);
  }, [paymentStatus, walletBalance, tenants.length, pendingInvoices, properties, selectedUnitType, pendingTenantData, resetForm]);

  // Open payment modal
  const openPaymentModal = useCallback(() => {
    setError(null);
    resetPaymentForm();
    if (pendingTenantData) {
      setPaymentPropertyId(pendingTenantData.propertyId || "");
      setPaymentUnitType(pendingTenantData.unitType || "");
      const unit = properties
        .find((p) => p._id === pendingTenantData.propertyId)
        ?.unitTypes.find((u) => u.type === pendingTenantData.unitType);
      if (unit) {
        setPaymentAmount(unit.managementFee.toString());
      }
    }
    setIsPaymentPromptOpen(true);
  }, [resetPaymentForm, pendingTenantData, properties]);

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
    setTenantPassword("");
    setFormErrors({});
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
        headers: { "Content-Type": "application/json" },
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
  }, [tenantToDelete, fetchTenants]);

  // Validate payment form
  const validatePaymentForm = useCallback(() => {
    const errors: { [key: string]: string | undefined } = {};
    if (!paymentPropertyId) {
      errors.paymentPropertyId = "Property is required";
    }
    if (!paymentUnitType) {
      errors.paymentUnitType = "Unit type is required";
    }
    if (!paymentAmount || isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0) {
      errors.paymentAmount = "Payment amount must be a positive number";
    } else {
      const unit = properties
        .find((p) => p._id === paymentPropertyId)
        ?.unitTypes.find((u) => u.type === paymentUnitType);
      if (unit && parseFloat(paymentAmount) < unit.managementFee) {
        errors.paymentAmount = `Payment amount is insufficient. Expected Ksh ${unit.managementFee} for ${paymentUnitType}.`;
      }
    }
    if (!tenantPhone || !/^\+?\d{10,15}$/.test(tenantPhone)) {
      errors.tenantPhone = "Valid phone number is required (10-15 digits, optional +)";
    }
    setPaymentFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [paymentPropertyId, paymentUnitType, paymentAmount, tenantPhone, properties]);

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
    if (!leaseStartDate) errors.leaseStartDate = "Lease start date is required";
    if (!leaseEndDate) errors.leaseEndDate = "Lease end date is required";
    else if (new Date(leaseEndDate) <= new Date(leaseStartDate)) errors.leaseEndDate = "Lease end date must be after start date";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [tenantName, tenantEmail, tenantPhone, tenantPassword, selectedPropertyId, selectedUnitType, price, deposit, houseNumber, leaseStartDate, leaseEndDate, modalMode]);

  // Poll transaction status
  const pollTransactionStatus = useCallback(
    async (transactionRequestId: string, maxAttempts = 6, interval = 5000) => {
      let attempts = 0;
      const checkStatus = async (): Promise<boolean> => {
        try {
          const res = await fetch("https://api.umspay.co.ke/api/v1/transactionstatus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: UMS_PAY_API_KEY,
              email: UMS_PAY_EMAIL,
              transaction_request_id: transactionRequestId,
            }),
          });
          const data = await res.json();
          console.log("Transaction status response:", data);

          if (data.ResultCode === "200") {
            if (data.TransactionStatus === "Completed") {
              setSuccessMessage("Payment processed successfully!");
              await fetchUserData();
              await fetchPendingInvoices();
              if (pendingTenantData) {
                setIsPaymentPromptOpen(false);
                setIsModalOpen(true);
              }
              return true;
            } else if (["Failed", "Cancelled", "Timeout"].includes(data.TransactionStatus)) {
              setError(
                data.ResultDesc ||
                  `Payment ${data.TransactionStatus.toLowerCase()}: ${
                    data.TransactionStatus === "Failed"
                      ? "Insufficient balance"
                      : data.TransactionStatus === "Cancelled"
                      ? "User cancelled payment"
                      : "User not reachable"
                  }`
              );
              return true;
            }
          } else {
            setError(data.errorMessage || "Failed to check transaction status.");
            return true;
          }
        } catch {
          setError("Failed to connect to UMS Pay API.");
          return true;
        }
        return false;
      };

      const poll = async () => {
        while (attempts < maxAttempts) {
          const done = await checkStatus();
          if (done) break;
          await new Promise((resolve) => setTimeout(resolve, interval));
          attempts++;
        }
        if (attempts >= maxAttempts) {
          setError("Payment processing timed out. Please check the transaction status later.");
        }
        setIsPaymentLoadingModalOpen(false);
      };

      poll();
    },
    [fetchUserData, fetchPendingInvoices, pendingTenantData]
  );

  // Handle payment submission
  const handlePayment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validatePaymentForm()) return;
      if (!userId) {
        setError("User ID is missing.");
        return;
      }
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      setIsPaymentPromptOpen(false);
      setIsPaymentLoadingModalOpen(true);

      const reference = `INVOICE-${userId}-${Date.now()}`;
      console.log("Sending payment request with amount:", paymentAmount, "reference:", reference);

      try {
        const res = await fetch("https://api.umspay.co.ke/api/v1/initiatestkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: UMS_PAY_API_KEY,
            email: UMS_PAY_EMAIL,
            amount: parseFloat(paymentAmount),
            msisdn: tenantPhone,
            reference,
            account_id: UMS_PAY_ACCOUNT_ID,
          }),
        });
        const data = await res.json();
        console.log("initiateStkPush response:", data);

        if (data.success === "200") {
          pollTransactionStatus(data.transaction_request_id);
        } else {
          setError(data.errorMessage || "Failed to initiate payment.");
          setIsPaymentLoadingModalOpen(false);
          setIsLoading(false);
        }
      } catch {
        setError("Failed to connect to UMS Pay API.");
        setIsPaymentLoadingModalOpen(false);
        setIsLoading(false);
      }
    },
    [userId, tenantPhone, paymentAmount, validatePaymentForm, pollTransactionStatus]
  );

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
      };

      try {
        const url = modalMode === "add" ? "/api/tenants" : `/api/tenants/${editingTenantId}`;
        const method = modalMode === "add" ? "POST" : "PUT";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(tenantData),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMessage(
            modalMode === "add" && data.invoice?.amount
              ? `Tenant ${tenantName} added successfully. An invoice of Ksh ${data.invoice.amount} has been generated.`
              : `Tenant ${modalMode === "add" ? "added" : "updated"} successfully!`
          );
          setIsModalOpen(false);
          setPendingTenantData(null);
          resetForm();
          fetchTenants();
          fetchUserData();
          fetchPendingInvoices();
        } else {
          if (data.message === "Cannot add more tenants until all pending invoices are paid.") {
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
    [userId, modalMode, editingTenantId, tenantName, tenantEmail, tenantPhone, tenantPassword, selectedPropertyId, selectedUnitType, price, deposit, houseNumber, leaseStartDate, leaseEndDate, fetchTenants, fetchUserData, fetchPendingInvoices, resetForm, validateForm]
  );

  // Handle table sorting
  const handleSort = useCallback((key: keyof Tenant | "propertyName") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedTenants = [...tenants].sort((a, b) => {
        if (key === "price" || key === "deposit") {
          return direction === "asc" ? a[key] - b[key] : b[key] - a[key];
        }
        if (key === "createdAt" || key === "leaseStartDate" || key === "leaseEndDate") {
          return direction === "asc"
            ? new Date(a[key]).getTime() - new Date(b[key]).getTime()
            : new Date(b[key]).getTime() - new Date(a[key]).getTime();
        }
        if (key === "propertyName") {
          const aName = properties.find((p) => p._id === a.propertyId)?.name || "";
          const bName = properties.find((p) => p._id === b.propertyId)?.name || "";
          return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }
        return direction === "asc"
          ? a[key].localeCompare(b[key])
          : b[key].localeCompare(a[key]);
      });
      setTenants(sortedTenants);
      return { key, direction };
    });
  }, [tenants, properties]);

  // Get sort icon for table headers
  const getSortIcon = useCallback((key: keyof Tenant | "propertyName") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  }, [sortConfig]);

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
            {tenants.length >= 3 && pendingInvoices > 0 ? (
              <button
                onClick={openPaymentModal}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium text-sm sm:text-base ${
                  isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#012a4a] hover:bg-[#014a7a]"
                }`}
                disabled={isLoading}
                aria-label="Make payment"
              >
                <Plus className="h-5 w-5" />
                Make Payment
              </button>
            ) : (
              <button
                onClick={openAddModal}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-white font-medium text-sm sm:text-base ${
                  isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#012a4a] hover:bg-[#014a7a]"
                }`}
                disabled={isLoading}
                aria-label="Add new tenant"
              >
                <Plus className="h-5 w-5" />
                Add Tenant
              </button>
            )}
          </div>
          {tenants.length >= 3 && (
            <div className="bg-yellow-100 text-yellow-700 p-4 mb-4 rounded-lg shadow">
              Note: Adding more tenants will require payment of a management fee if there are pending invoices or insufficient wallet balance.
            </div>
          )}
          {error && (
            <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 mb-4 rounded-lg shadow animate-pulse">
              {successMessage}
            </div>
          )}
          {isLoading ? (
            <div className="text-center text-gray-600">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a]"></div>
              <span className="ml-2">Loading tenants...</span>
            </div>
          ) : tenants.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No tenants found. Add a tenant to get started.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white shadow rounded-lg">
              <table className="min-w-full table-auto text-sm md:text-base">
                <thead className="bg-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("name")}
                    >
                      Name {getSortIcon("name")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("email")}
                    >
                      Email {getSortIcon("email")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("phone")}
                    >
                      Phone {getSortIcon("phone")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("propertyName")}
                    >
                      Property {getSortIcon("propertyName")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("unitType")}
                    >
                      Unit {getSortIcon("unitType")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("price")}
                    >
                      Price {getSortIcon("price")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("deposit")}
                    >
                      Deposit {getSortIcon("deposit")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("houseNumber")}
                    >
                      House # {getSortIcon("houseNumber")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("leaseStartDate")}
                    >
                      Lease Start {getSortIcon("leaseStartDate")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("leaseEndDate")}
                    >
                      Lease End {getSortIcon("leaseEndDate")}
                    </th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr
                      key={t._id}
                      className="border-t hover:bg-gray-50 transition cursor-pointer"
                      onClick={() => router.push(`/property-owner-dashboard/tenants/${t._id}`)}
                    >
                      <td className="px-4 py-3">{t.name}</td>
                      <td className="px-4 py-3">{t.email}</td>
                      <td className="px-4 py-3">{t.phone}</td>
                      <td className="px-4 py-3">
                        {properties.find((p) => p._id === t.propertyId)?.name || "N/A"}
                      </td>
                      <td className="px-4 py-3">{t.unitType}</td>
                      <td className="px-4 py-3">Ksh {t.price.toFixed(2)}</td>
                      <td className="px-4 py-3">Ksh {t.deposit.toFixed(2)}</td>
                      <td className="px-4 py-3">{t.houseNumber}</td>
                      <td className="px-4 py-3">{new Date(t.leaseStartDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{new Date(t.leaseEndDate).toLocaleDateString()}</td>
                      <td
                        className="px-4 py-3 flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(t)}
                          className="text-[#012a4a] hover:text-[#014a7a] transition"
                          title="Edit Tenant"
                          aria-label={`Edit tenant ${t.name}`}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(t._id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete Tenant"
                          aria-label={`Delete tenant ${t.name}`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Modal
            title={modalMode === "add" ? "Add Tenant" : "Edit Tenant"}
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              resetForm();
              setPendingTenantData(null);
            }}
          >
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.tenantName ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.tenantEmail ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.tenantPhone ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {formErrors.tenantPhone && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.tenantPhone}</p>
                )}
              </div>
              {modalMode === "add" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Temporary Password</label>
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
                    type="password"
                    required
                    className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                      formErrors.tenantPassword ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {formErrors.tenantPassword && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.tenantPassword}</p>
                  )}
                </div>
              )}
              {modalMode === "edit" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password (optional)</label>
                  <input
                    placeholder="Enter new password (optional)"
                    value={tenantPassword}
                    onChange={(e) => setTenantPassword(e.target.value)}
                    type="password"
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base"
                  />
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.selectedPropertyId ? "border-red-500" : "border-gray-300"
                  }`}
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
                    onChange={(e) => {
                      const unitType = e.target.value;
                      setSelectedUnitType(unitType);
                      const unit = properties
                        .find((p) => p._id === selectedPropertyId)
                        ?.unitTypes.find((u) => u.type === unitType);
                      if (unit) {
                        setPrice(unit.price.toString());
                        setDeposit(unit.deposit.toString());
                        setFormErrors((prev) => ({
                          ...prev,
                          selectedUnitType: undefined,
                          price: unit.price >= 0 ? undefined : "Price must be a non-negative number",
                          deposit: unit.deposit >= 0 ? undefined : "Deposit must be a non-negative number",
                        }));
                      } else {
                        setPrice("");
                        setDeposit("");
                        setFormErrors((prev) => ({
                          ...prev,
                          selectedUnitType: unitType ? undefined : "Unit type is required",
                          price: undefined,
                          deposit: undefined,
                        }));
                      }
                    }}
                    required
                    className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                      formErrors.selectedUnitType ? "border-red-500" : "border-gray-300"
                    }`}
                  >
                    <option value="">Select Unit Type</option>
                    {properties
                      .find((p) => p._id === selectedPropertyId)
                      ?.unitTypes.map((u) => (
                        <option key={u.type} value={u.type}>
                          {u.type} ({u.managementType}: Ksh {u.managementFee}/mo)
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
                  className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${
                    formErrors.price ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${
                    formErrors.deposit ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.houseNumber ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.leaseStartDate ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                    formErrors.leaseEndDate ? "border-red-500" : "border-gray-300"
                  }`}
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
                  className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 text-sm sm:text-base ${
                    isLoading ||
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
          <Modal
            title="Make Payment"
            isOpen={isPaymentPromptOpen}
            onClose={() => {
              setIsPaymentPromptOpen(false);
              resetPaymentForm();
              setError(null);
            }}
          >
            {properties.length === 0 ? (
              <>
                <p className="mb-6 text-gray-700 text-sm sm:text-base">
                  You need an active payment status and a minimum wallet balance to add a tenant. Please complete the payment process.
                </p>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsPaymentPromptOpen(false);
                      resetPaymentForm();
                      setError(null);
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                    aria-label="Cancel payment prompt"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => router.push("/property-owner-dashboard/payments")}
                    className="px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition text-sm sm:text-base"
                    aria-label="Go to payments"
                  >
                    Go to Payments
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handlePayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Property</label>
                  <select
                    value={paymentPropertyId}
                    onChange={(e) => {
                      setPaymentPropertyId(e.target.value);
                      setPaymentUnitType("");
                      setPaymentAmount("");
                      setPaymentFormErrors((prev) => ({
                        ...prev,
                        paymentPropertyId: e.target.value ? undefined : "Property is required",
                        paymentUnitType: undefined,
                        paymentAmount: undefined,
                      }));
                    }}
                    required
                    className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                      paymentFormErrors.paymentPropertyId ? "border-red-500" : "border-gray-300"
                    }`}
                  >
                    <option value="">Select Property</option>
                    {properties.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {paymentFormErrors.paymentPropertyId && (
                    <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentPropertyId}</p>
                  )}
                </div>
                {paymentPropertyId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unit Type</label>
                    <select
                      value={paymentUnitType}
                      onChange={(e) => {
                        const unitType = e.target.value;
                        setPaymentUnitType(unitType);
                        const unit = properties
                          .find((p) => p._id === paymentPropertyId)
                          ?.unitTypes.find((u) => u.type === unitType);
                        if (unit) {
                          setPaymentAmount(unit.managementFee.toString());
                          setPaymentFormErrors((prev) => ({
                            ...prev,
                            paymentUnitType: undefined,
                            paymentAmount: unit.managementFee >= 10 ? undefined : "Payment amount must be at least Ksh 10",
                          }));
                        } else {
                          setPaymentAmount("");
                          setPaymentFormErrors((prev) => ({
                            ...prev,
                            paymentUnitType: unitType ? undefined : "Unit type is required",
                            paymentAmount: undefined,
                          }));
                        }
                      }}
                      required
                      className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                        paymentFormErrors.paymentUnitType ? "border-red-500" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select Unit Type</option>
                      {properties
                        .find((p) => p._id === paymentPropertyId)
                        ?.unitTypes.map((u) => (
                          <option key={u.type} value={u.type}>
                            {u.type} ({u.managementType}: Ksh {u.managementFee}/mo)
                          </option>
                        ))}
                    </select>
                    {paymentFormErrors.paymentUnitType && (
                      <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentUnitType}</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Amount (Ksh)</label>
                  <input
                    placeholder="Payment amount (auto-filled)"
                    value={paymentAmount}
                    readOnly
                    className={`w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base ${
                      paymentFormErrors.paymentAmount ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {paymentFormErrors.paymentAmount && (
                    <p className="text-red-500 text-xs mt-1">{paymentFormErrors.paymentAmount}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone Number</label>
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
                    className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${
                      formErrors.tenantPhone ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {formErrors.tenantPhone && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.tenantPhone}</p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaymentPromptOpen(false);
                      resetPaymentForm();
                      setError(null);
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
                    aria-label="Cancel payment"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                      !paymentPropertyId ||
                      !paymentUnitType ||
                      !paymentAmount ||
                      !tenantPhone
                    }
                    className={`px-4 py-2 text-white rounded-lg transition flex items-center gap-2 text-sm sm:text-base ${
                      isLoading ||
                      Object.values(paymentFormErrors).some((v) => v !== undefined) ||
                      !paymentPropertyId ||
                      !paymentUnitType ||
                      !paymentAmount ||
                      !tenantPhone
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-[#012a4a] hover:bg-[#014a7a]"
                    }`}
                    aria-label="Confirm payment"
                  >
                    {isLoading && (
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    )}
                    Confirm Payment
                  </button>
                </div>
              </form>
            )}
          </Modal>
          <Modal
            title="Processing Payment"
            isOpen={isPaymentLoadingModalOpen}
            onClose={() => {}}
          >
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a] mb-4"></div>
              <p className="text-gray-700 text-sm sm:text-base">
                Processing your payment. Please wait...
              </p>
            </div>
          </Modal>
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}