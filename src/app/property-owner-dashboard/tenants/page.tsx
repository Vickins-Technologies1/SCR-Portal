"use client";

import React, { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Users, Pencil, Trash2, Plus, ArrowUpDown, EyeIcon, EyeOffIcon } from "lucide-react";
import { TenantRequest } from "../../../types/tenant";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string; // Format: "type-index" (e.g., "Single-0", "1-Bedroom-1")
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  createdAt: string;
  walletBalance?: number;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
}

import type { Property } from "../../../types/property";

interface SortConfig {
  key: keyof Tenant | "propertyName";
  direction: "asc" | "desc";
}

interface FilterConfig {
  tenantName: string;
  tenantEmail: string;
  propertyId: string;
  unitType: string;
}

const UNIT_TYPES = [
  {
    type: "Single",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Bedsitter",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "1-Bedroom",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "2-Bedroom",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "3-Bedroom",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Duplex",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
  {
    type: "Commercial",
    pricing: {
      RentCollection: [
        { range: [5, 20], fee: 2500 },
        { range: [21, 50], fee: 4500 },
        { range: [51, 100], fee: 7000 },
        { range: [101, Infinity], fee: 0 },
      ],
      FullManagement: 0,
    },
  },
];

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
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
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "createdAt", direction: "desc" });
  const [pendingTenantData, setPendingTenantData] = useState<Partial<TenantRequest> | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalTenants, setTotalTenants] = useState(0);
  const [filters, setFilters] = useState<FilterConfig>({
    tenantName: "",
    tenantEmail: "",
    propertyId: "",
    unitType: "",
  });

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const getManagementFee = (totalUnits: number): number => {
    const pricing = UNIT_TYPES[0].pricing.RentCollection;
    for (const tier of pricing) {
      const [min, max] = tier.range;
      if (totalUnits >= min && totalUnits <= max) {
        return tier.fee;
      }
    }
    return 0;
  };

  const calculateTotalUnits = (propertyId: string): number => {
    const property = properties.find((p) => p._id.toString() === propertyId);
    if (!property) return 0;
    return property.unitTypes.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  };

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

  const fetchTenants = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tenants?userId=${encodeURIComponent(userId)}&page=${page}&limit=${limit}`, {
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
          totalRentPaid: tenant.totalRentPaid ?? 0,
          totalUtilityPaid: tenant.totalUtilityPaid ?? 0,
          totalDepositPaid: tenant.totalDepositPaid ?? 0,
        }));
        setTenants(normalizedTenants);
        setFilteredTenants(normalizedTenants);
        setTotalTenants(data.total || 0);
      } else {
        setError(data.message || "Failed to fetch tenants.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  }, [userId, page, limit, csrfToken]);

  
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
      const mappedProperties: Property[] = data.properties.map((p: Property) => ({
        ...p,
        _id: p._id.toString(),
        unitTypes: p.unitTypes.map((u: Property['unitTypes'][number], index: number) => ({
          ...u,
          uniqueType: u.uniqueType || `${u.type}-${index}`,
        })),
        managementFee: typeof p.managementFee === "string" ? parseFloat(p.managementFee) : p.managementFee || getManagementFee(calculateTotalUnits(p._id.toString())),
        createdAt: p.createdAt ? new Date(p.createdAt) : undefined,
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : undefined,
        rentPaymentDate: p.rentPaymentDate ? new Date(p.rentPaymentDate) : undefined,
        ownerId: p.ownerId ?? "",
        address: p.address ?? "",
        status: p.status ?? "",
      }));
      setProperties(mappedProperties || []);
    } else {
      setError(data.message || "Failed to fetch properties.");
    }
  } catch {
    setError("Failed to connect to the server.");
  }
}, [userId, csrfToken, calculateTotalUnits]);


const fetchInvoiceStatus = useCallback(
  async (propertyId: string) => {
    if (!userId || !propertyId) {
      console.warn("Missing required parameters for fetchInvoiceStatus", { userId, propertyId });
      setError("Missing required parameters to check invoice status.");
      return null;
    }
    try {
      const url = `/api/invoices?userId=${encodeURIComponent(userId)}&propertyId=${encodeURIComponent(propertyId)}&unitType=All%20Units`;
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
    } catch (error) {
      console.error("Error in fetchInvoiceStatus", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      setError("Failed to connect to the server while checking invoice status.");
      return null;
    }
  },
  [userId, csrfToken]
);

  const fetchPendingInvoices = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/pending-invoices`, {
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
        setPendingInvoices(0);
        setError(data.message || "Failed to fetch pending invoices.");
      }
    } catch {
      setPendingInvoices(0);
      setError("Failed to connect to the server while fetching pending invoices.");
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && role === "propertyOwner" && csrfToken) {
      Promise.all([
        fetchUserData(),
        fetchTenants(),
        fetchProperties(),
        fetchPendingInvoices(),
      ]).catch((error) => {
        console.error("Error fetching initial data", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        setError("Failed to load initial data. Please try again.");
      });
    }
  }, [userId, role, csrfToken, fetchUserData, fetchTenants, fetchProperties, fetchPendingInvoices]);

  useEffect(() => {
    const applyFilters = () => {
      let filtered = [...tenants];
      if (filters.tenantName) {
        filtered = filtered.filter((tenant) =>
          tenant.name.toLowerCase().includes(filters.tenantName.toLowerCase())
        );
      }
      if (filters.tenantEmail) {
        filtered = filtered.filter((tenant) =>
          tenant.email.toLowerCase().includes(filters.tenantEmail.toLowerCase())
        );
      }
      if (filters.propertyId) {
        filtered = filtered.filter((tenant) => tenant.propertyId === filters.propertyId);
      }
      if (filters.unitType) {
        filtered = filtered.filter((tenant) => tenant.unitType.split('-')[0] === filters.unitType);
      }
      filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFilteredTenants(filtered);
      setTotalTenants(filtered.length);
    };
    applyFilters();
  }, [filters, tenants]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ tenantName: "", tenantEmail: "", propertyId: "", unitType: "" });
    setPage(1);
  };

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

  const openAddModal = useCallback(async () => {
    if (paymentStatus === null || walletBalance === null) {
      setError("Unable to verify payment status. Please try again or log in.");
      return;
    }
    if (pendingInvoices > 0) {
      setError("You have pending invoices. Please settle them before adding new tenants.");
      setIsPaymentPromptOpen(true);
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
  }, [paymentStatus, walletBalance, pendingTenantData, resetForm, pendingInvoices]);

  const openEditModal = useCallback((tenant: Tenant) => {
    if (paymentStatus === null || walletBalance === null) {
      setError("Unable to verify payment status. Please try again or log in.");
      return;
    }
    if (pendingInvoices > 0) {
      setError("You have pending invoices. Please settle them before editing tenants.");
      setIsPaymentPromptOpen(true);
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
  }, [paymentStatus, walletBalance, pendingInvoices]);

  const handleDelete = useCallback((id: string) => {
    setTenantToDelete(id);
    setIsDeleteModalOpen(true);
  }, []);

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

  const handleSort = useCallback((key: keyof Tenant | "propertyName") => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      const sortedTenants = [...filteredTenants].sort((a, b) => {
        if (key === "price" || key === "deposit" || key === "totalRentPaid" || key === "totalUtilityPaid" || key === "totalDepositPaid") {
          const aVal = (a[key] ?? 0) as number;
          const bVal = (b[key] ?? 0) as number;
          return direction === "asc" ? aVal - bVal : bVal - aVal;
        }

        if (key === "createdAt" || key === "leaseStartDate" || key === "leaseEndDate") {
          return direction === "asc"
            ? new Date(a[key] as string).getTime() - new Date(b[key] as string).getTime()
            : new Date(b[key] as string).getTime() - new Date(a[key] as string).getTime();
        }

        if (key === "propertyName") {
          const aName = properties.find((p) => p._id.toString() === a.propertyId)?.name || "";
          const bName = properties.find((p) => p._id.toString() === b.propertyId)?.name || "";
          return direction === "asc"
            ? aName.localeCompare(bName)
            : bName.localeCompare(aName);
        }

        const aVal = (a[key] ?? "").toString();
        const bVal = (b[key] ?? "").toString();

        return direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      });

      setFilteredTenants(sortedTenants);
      return { key, direction };
    });
  }, [filteredTenants, properties]);

  const getSortIcon = (key: keyof Tenant | "propertyName") => {
    if (sortConfig.key !== key) return <ArrowUpDown className="inline ml-1 h-4 w-4" />;
    return sortConfig.direction === "asc" ? (
      <span className="inline ml-1">↑</span>
    ) : (
      <span className="inline ml-1">↓</span>
    );
  };

  const handleTenantClick = useCallback((tenantId: string) => {
    if (!csrfToken) {
      setError("CSRF token is missing. Please refresh the page.");
      return;
    }
    router.push(`/property-owner-dashboard/tenants/${tenantId}`);
  }, [csrfToken, router]);

  const totalPages = Math.ceil(totalTenants / limit);

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
              Note: Adding more tenants may require payment of a property-wide management fee if no invoice has been paid.
            </div>
          )}
          {pendingInvoices > 0 && (
            <div className="bg-blue-100 text-blue-700 p-4 mb-4 rounded-lg shadow">
              You have {pendingInvoices} pending invoice{pendingInvoices === 1 ? '' : 's'}. Please settle them to add more tenants.
            </div>
          )}
          <div className="mb-6 bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Filter Tenants</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
                <input
                  name="tenantName"
                  value={filters.tenantName}
                  onChange={handleFilterChange}
                  placeholder="Enter tenant name"
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Email</label>
                <input
                  name="tenantEmail"
                  value={filters.tenantEmail}
                  onChange={handleFilterChange}
                  placeholder="Enter tenant email"
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                <select
                  name="propertyId"
                  value={filters.propertyId}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Properties</option>
                  {properties.map((property) => (
                    <option key={property._id.toString()} value={property._id.toString()}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
                <select
                  name="unitType"
                  value={filters.unitType}
                  onChange={handleFilterChange}
                  className="w-full p-2 border rounded-md focus:ring-[#012a4a] focus:border-[#012a4a]"
                >
                  <option value="">All Unit Types</option>
                  {[...new Set(properties.flatMap((p) => p.unitTypes.map((u) => u.type)))].map((unitType) => (
                    <option key={unitType} value={unitType}>
                      {unitType}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 bg-[#012a4a] text-white rounded-md hover:bg-[#024a7a] transition"
            >
              Clear Filters
            </button>
          </div>
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
          ) : filteredTenants.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-md text-gray-600 text-center">
              No tenants found. Adjust filters or add a tenant to get started.
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
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("totalRentPaid")}
                    >
                      Total Rent Paid {getSortIcon("totalRentPaid")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("totalUtilityPaid")}
                    >
                      Total Utility Paid {getSortIcon("totalUtilityPaid")}
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-300"
                      onClick={() => handleSort("totalDepositPaid")}
                    >
                      Total Deposit Paid {getSortIcon("totalDepositPaid")}
                    </th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants
                    .slice((page - 1) * limit, page * limit)
                    .map((t) => {
                      const [baseUnitType, index] = t.unitType.split('-');
                      return (
                        <tr
                          key={t._id}
                          className="border-t hover:bg-gray-50 transition cursor-pointer"
                          onClick={() => handleTenantClick(t._id)}
                        >
                          <td className="px-4 py-3">{t.name}</td>
                          <td className="px-4 py-3">{t.email}</td>
                          <td className="px-4 py-3">{t.phone}</td>
                          <td className="px-4 py-3">
                            {properties.find((p) => p._id.toString() === t.propertyId)?.name || "N/A"}
                          </td>
                          <td className="px-4 py-3">{`${baseUnitType} #${parseInt(index) + 1}`}</td>
                          <td className="px-4 py-3">Ksh {t.price.toFixed(2)}</td>
                          <td className="px-4 py-3">Ksh {t.deposit.toFixed(2)}</td>
                          <td className="px-4 py-3">{t.houseNumber}</td>
                          <td className="px-4 py-3">{new Date(t.leaseStartDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3">{new Date(t.leaseEndDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3">Ksh {(t.totalRentPaid ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3">Ksh {(t.totalUtilityPaid ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3">Ksh {(t.totalDepositPaid ?? 0).toFixed(2)}</td>
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
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-between items-center">
            <div>
              Showing {Math.min(filteredTenants.length, limit)} of {totalTenants} tenants
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
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
                    <option key={p._id.toString()} value={p._id.toString()}>
                      {p.name} (Total Units: {calculateTotalUnits(p._id.toString())}, Fee: Ksh {p.managementFee}/mo)
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
                      const selectedProperty = properties.find((p) => p._id.toString() === selectedPropertyId);
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
                        if (tenants.length >= 3 && modalMode === "add") {
                          const invoiceStatus = await fetchInvoiceStatus(selectedPropertyId);
                          if (invoiceStatus === "pending") {
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
                              `Cannot add more tenants until the pending invoice for property ${selectedProperty?.name || "unknown"} is paid.`
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
                      .find((p) => p._id.toString() === selectedPropertyId)
                      ?.unitTypes.map((u) => (
                        <option key={u.uniqueType} value={u.uniqueType}>
                          {u.type} (Price: Ksh {u.price}, Deposit: Ksh {u.deposit})
                        </option>
                      ))}
                  </select>
                  {formErrors.selectedUnitType && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.selectedUnitType}</p>
                  )}
                  {selectedPropertyId && (
                    <p className="text-sm text-gray-600 mt-1">
                      Property Management Fee: Ksh {properties.find((p) => p._id.toString() === selectedPropertyId)?.managementFee || 0}/mo
                    </p>
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
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Rent Paid (Ksh)</label>
                <input
                  placeholder="Enter total rent paid"
                  value={totalRentPaid}
                  onChange={(e) => {
                    setTotalRentPaid(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      totalRentPaid: e.target.value && (isNaN(parseFloat(e.target.value)) || parseFloat(e.target.value) < 0)
                        ? "Total rent paid must be a non-negative number"
                        : undefined,
                    }));
                  }}
                  type="number"
                  step="0.01"
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.totalRentPaid ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.totalRentPaid && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.totalRentPaid}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Utility Paid (Ksh)</label>
                <input
                  placeholder="Enter total utility paid"
                  value={totalUtilityPaid}
                  onChange={(e) => {
                    setTotalUtilityPaid(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      totalUtilityPaid: e.target.value && (isNaN(parseFloat(e.target.value)) || parseFloat(e.target.value) < 0)
                        ? "Total utility paid must be a non-negative number"
                        : undefined,
                    }));
                  }}
                  type="number"
                  step="0.01"
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.totalUtilityPaid ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.totalUtilityPaid && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.totalUtilityPaid}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Deposit Paid (Ksh)</label>
                <input
                  placeholder="Enter total deposit paid"
                  value={totalDepositPaid}
                  onChange={(e) => {
                    setTotalDepositPaid(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      totalDepositPaid: e.target.value && (isNaN(parseFloat(e.target.value)) || parseFloat(e.target.value) < 0)
                        ? "Total deposit paid must be a non-negative number"
                        : undefined,
                    }));
                  }}
                  type="number"
                  step="0.01"
                  className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm sm:text-base ${formErrors.totalDepositPaid ? "border-red-500" : "border-gray-300"}`}
                />
                {formErrors.totalDepositPaid && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.totalDepositPaid}</p>
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