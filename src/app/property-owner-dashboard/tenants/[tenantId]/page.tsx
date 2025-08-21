"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { User, LogIn, ArrowLeft, Edit, Trash2, DollarSign } from "lucide-react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Modal from "../../components/Modal";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  unitType: string;
  houseNumber: string;
  price: number;
  deposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
  totalRentPaid: number;
  totalUtilityPaid: number;
  totalDepositPaid: number;
  dues?: {
    rentDues: number;
    utilityDues: number;
    depositDues: number;
    totalRemainingDues: number;
  };
  monthsStayed?: number;
}

interface Property {
  _id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

interface PaymentFormData {
  amount: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  reference: string;
  paymentDate: string;
}

export default function TenantDetailsPage() {
  const router = useRouter();
  const { tenantId } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Partial<Tenant> | null>(null);
  const [editErrors, setEditErrors] = useState<{ [key: string]: string | undefined }>({});
  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    amount: "",
    type: "Rent",
    reference: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });
  const [paymentErrors, setPaymentErrors] = useState<{
    [key: string]: string | undefined;
  }>({});
  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);
  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 1000; // 1 second delay for rate limiting

  // Fetch CSRF token with retry logic
  const fetchCsrfToken = useCallback(async () => {
    if (requestInProgress.current) {
      console.log("[DEBUG] Skipping CSRF token fetch, request in progress");
      return csrfToken;
    }
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
    }
    try {
      console.log("[DEBUG] Fetching CSRF token");
      const res = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[ERROR] Failed to fetch CSRF token", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        if (res.status === 429) {
          setError("Too many requests. Please try again later.");
          return null;
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[ERROR] Non-JSON response from /api/csrf-token", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        throw new Error("Received non-JSON response from server");
      }
      const data = await res.json();
      if (data.success && data.csrfToken) {
        const token = data.csrfToken;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, {
          path: "/",
          secure: window.location.protocol === "https:",
          sameSite: "strict",
          expires: 1, // 1 day
        });
        console.log("[INFO] Fetched and stored CSRF token", { csrfToken: token });
        return token;
      }
      throw new Error(data.message || "Failed to fetch CSRF token");
    } catch {
      console.error("[ERROR] Failed to fetch CSRF token");
      return null;
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  }, [csrfToken]);

  // Fetch tenant data
  const fetchTenantData = useCallback(
    async (token: string) => {
      if (!userId || !tenantId || role !== "propertyOwner" || !token) {
        setError("Missing required data or CSRF token.");
        setIsLoading(false);
        return;
      }
      if (requestInProgress.current) {
        console.log("[DEBUG] Skipping fetchTenantData, request in progress");
        return;
      }
      requestInProgress.current = true;
      const now = Date.now();
      if (now - lastRequestTime.current < rateLimitDelay) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
      }
      setIsLoading(true);
      setError(null);
      try {
        console.log("[DEBUG] Sending fetchTenantData request", { tenantId, userId, csrfToken: token });
        const res = await fetch(`/api/tenants/${tenantId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          console.error("[ERROR] Failed to fetch tenant data", {
            status: res.status,
            response: text,
            headers: Object.fromEntries(res.headers),
          });
          if (res.status === 403) {
            const newToken = await fetchCsrfToken();
            if (!newToken) {
              setError("Session expired. Please refresh the page.");
              return;
            }
            console.log("[INFO] Retrying fetchTenantData with new CSRF token", { newToken });
            const retryRes = await fetch(`/api/tenants/${tenantId}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": newToken,
              },
              credentials: "include",
            });
            if (!retryRes.ok) {
              const retryText = await retryRes.text();
              console.error("[ERROR] Retry failed for fetchTenantData", {
                status: retryRes.status,
                response: retryText,
                headers: Object.fromEntries(retryRes.headers),
              });
              throw new Error(`Retry failed! Status: ${retryRes.status}`);
            }
            const retryData = await retryRes.json();
            if (retryData.success && retryData.tenant) {
              setTenant(retryData.tenant);
              setProperty(retryData.property || null);
              return;
            }
            throw new Error(retryData.message || "Retry failed to fetch tenant data.");
          } else if (res.status === 429) {
            setError("Too many requests. Please try again later.");
            return;
          }
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error("[ERROR] Non-JSON response from /api/tenants", {
            status: res.status,
            response: text,
            headers: Object.fromEntries(res.headers),
          });
          throw new Error("Received non-JSON response from server");
        }
        const tenantData = await res.json();
        if (!tenantData.success || !tenantData.tenant) {
          throw new Error(tenantData.message || "Tenant or property not found.");
        }
        setTenant(tenantData.tenant);
        setProperty(tenantData.property || null);
      } catch {
        console.error("[ERROR] Failed to fetch tenant data");
        setError("Failed to connect to the server.");
      } finally {
        setIsLoading(false);
        requestInProgress.current = false;
        lastRequestTime.current = Date.now();
      }
    },
    [userId, tenantId, role, fetchCsrfToken]
  );

  // Fetch dues data
  const fetchDues = useCallback(
    async (token: string) => {
      if (!userId || !tenantId || role !== "propertyOwner" || !token) {
        setError("Missing required data or CSRF token for dues.");
        return;
      }
      if (requestInProgress.current) {
        console.log("[DEBUG] Skipping fetchDues, request in progress");
        return;
      }
      requestInProgress.current = true;
      const now = Date.now();
      if (now - lastRequestTime.current < rateLimitDelay) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
      }
      setIsDuesLoading(true);
      setError(null);
      try {
        console.log("[DEBUG] Sending fetchDues request", { csrfToken: token, tenantId, userId });
        const res = await fetch("/api/tenants/check-dues", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          credentials: "include",
          body: JSON.stringify({
            tenantId: tenantId as string,
            userId,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          console.error("[ERROR] Failed to fetch dues", {
            status: res.status,
            response: text,
            headers: Object.fromEntries(res.headers),
          });
          if (res.status === 403) {
            const newToken = await fetchCsrfToken();
            if (!newToken) {
              setError("Session expired. Please refresh the page.");
              return;
            }
            console.log("[INFO] Retrying fetchDues with new CSRF token", { newToken });
            const retryRes = await fetch("/api/tenants/check-dues", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": newToken,
              },
              credentials: "include",
              body: JSON.stringify({
                tenantId: tenantId as string,
                userId,
              }),
            });
            if (!retryRes.ok) {
              const retryText = await retryRes.text();
              console.error("[ERROR] Retry failed for fetchDues", {
                status: retryRes.status,
                response: retryText,
                headers: Object.fromEntries(retryRes.headers),
              });
              throw new Error(`Retry failed! Status: ${retryRes.status}`);
            }
            const retryData = await retryRes.json();
            if (retryData.success && retryData.tenant && retryData.dues) {
              setTenant((prev) =>
                prev
                  ? {
                      ...prev,
                      ...retryData.tenant,
                      dues: {
                        rentDues: retryData.dues.rentDues,
                        utilityDues: retryData.dues.utilityDues,
                        depositDues: retryData.dues.depositDues,
                        totalRemainingDues: retryData.dues.totalRemainingDues,
                      },
                      monthsStayed: retryData.monthsStayed,
                    }
                  : null
              );
              return;
            }
            throw new Error(retryData.message || "Retry failed to fetch dues.");
          } else if (res.status === 429) {
            setError("Too many requests. Please try again later.");
            return;
          }
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error("[ERROR] Non-JSON response from /api/tenants/check-dues", {
            status: res.status,
            response: text,
            headers: Object.fromEntries(res.headers),
          });
          throw new Error("Received non-JSON response from server");
        }
        const data = await res.json();
        if (data.success && data.tenant && data.dues) {
          setTenant((prev) =>
            prev
              ? {
                  ...prev,
                  ...data.tenant,
                  dues: {
                    rentDues: data.dues.rentDues,
                    utilityDues: data.dues.utilityDues,
                    depositDues: data.dues.depositDues,
                    totalRemainingDues: data.dues.totalRemainingDues,
                  },
                  monthsStayed: data.monthsStayed,
                }
              : null
          );
        } else {
          throw new Error(data.message || "Failed to fetch dues.");
        }
      } catch {
        console.error("[ERROR] Failed to fetch dues");
        setError("Failed to fetch dues.");
      } finally {
        setIsDuesLoading(false);
        requestInProgress.current = false;
        lastRequestTime.current = Date.now();
      }
    },
    [userId, tenantId, role, fetchCsrfToken]
  );

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");
    const storedCsrfToken = Cookies.get("csrf-token");
    if (!uid || userRole !== "propertyOwner") {
      setError("Unauthorized. Please log in as a property owner.");
      router.push("/");
    } else {
      setUserId(uid);
      setRole(userRole);
      if (storedCsrfToken && !csrfToken) {
        setCsrfToken(storedCsrfToken);
        console.log("[INFO] Loaded CSRF token from cookie", { csrfToken: storedCsrfToken });
      }
    }
  }, [router, csrfToken]);

  // Initialize with CSRF token and tenant data
  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      if (requestInProgress.current) {
        console.log("[DEBUG] Skipping initialization, request in progress");
        return;
      }
      try {
        // Fetch CSRF token if not already set
        let token = csrfToken;
        if (!token) {
          token = await fetchCsrfToken();
          if (!token || !isMounted) return;
        }

        // Fetch tenant data and dues only after CSRF token is fetched
        if (userId && role === "propertyOwner" && token) {
          await fetchTenantData(token);
          await fetchDues(token);
        }
      } catch {
        if (!isMounted) return;
        setError("Failed to initialize. Please try again.");
        setIsLoading(false);
      }
    };
    initialize();
    return () => {
      isMounted = false;
    };
  }, [userId, role, csrfToken, fetchCsrfToken, fetchTenantData, fetchDues]);

  // Update payment modal with dues data based on payment type
  useEffect(() => {
    if (tenant?.dues && showPaymentModal) {
      const dues = tenant.dues;
      let amount = "";
      if (paymentData.type === "Rent" && dues.rentDues > 0) {
        amount = dues.rentDues.toFixed(2);
      } else if (paymentData.type === "Utility" && dues.utilityDues > 0) {
        amount = dues.utilityDues.toFixed(2);
      } else if (paymentData.type === "Deposit" && dues.depositDues > 0) {
        amount = dues.depositDues.toFixed(2);
      } else if (paymentData.type === "Other") {
        amount = dues.totalRemainingDues.toFixed(2);
      }
      setPaymentData((prev) => ({
        ...prev,
        amount,
      }));
    }
  }, [tenant?.dues, showPaymentModal, paymentData.type]);

  const handleImpersonate = async () => {
    if (!tenant || !userId || !csrfToken) {
      setError("Missing tenant, user ID, or CSRF token.");
      return;
    }
    if (requestInProgress.current) {
      console.log("[DEBUG] Skipping impersonate, request in progress");
      return;
    }
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenant._id, userId }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[ERROR] Failed to impersonate tenant", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        if (res.status === 403) {
          const newToken = await fetchCsrfToken();
          if (!newToken) {
            setError("Session expired. Please refresh the page.");
            return;
          }
          console.log("[INFO] Retrying impersonate with new CSRF token", { newToken });
          const retryRes = await fetch("/api/impersonate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": newToken,
            },
            credentials: "include",
            body: JSON.stringify({ tenantId: tenant._id, userId }),
          });
          if (!retryRes.ok) {
            const retryText = await retryRes.text();
            console.error("[ERROR] Retry failed for impersonate", {
              status: retryRes.status,
              response: retryText,
              headers: Object.fromEntries(retryRes.headers),
            });
            throw new Error(`Retry failed! Status: ${retryRes.status}`);
          }
          const retryData = await retryRes.json();
          if (retryData.success) {
            setSuccessMessage("Impersonation successful! Redirecting to tenant dashboard...");
            setTimeout(() => {
              Cookies.set("userId", tenant._id, { path: "/", expires: 1 });
              Cookies.set("role", "tenant", { path: "/", expires: 1 });
              Cookies.set("originalUserId", userId, { path: "/", expires: 1 });
              Cookies.set("originalRole", "propertyOwner", { path: "/", expires: 1 });
              router.push("/tenant-dashboard");
            }, 1000);
            return;
          }
          throw new Error(retryData.message || "Retry failed to impersonate tenant.");
        } else if (res.status === 429) {
          setError("Too many requests. Please try again later.");
          return;
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[ERROR] Non-JSON response from /api/impersonate", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        throw new Error("Received non-JSON response from server");
      }
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Impersonation successful! Redirecting to tenant dashboard...");
        setTimeout(() => {
          Cookies.set("userId", tenant._id, { path: "/", expires: 1 });
          Cookies.set("role", "tenant", { path: "/", expires: 1 });
          Cookies.set("originalUserId", userId, { path: "/", expires: 1 });
          Cookies.set("originalRole", "propertyOwner", { path: "/", expires: 1 });
          router.push("/tenant-dashboard");
        }, 1000);
      } else {
        throw new Error(data.message || "Failed to impersonate tenant.");
      }
    } catch {
      console.error("[ERROR] Failed to impersonate tenant");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      setShowImpersonateModal(false);
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  };

  const handleDelete = async () => {
    if (
      !tenant ||
      !confirm("Are you sure you want to delete this tenant? This action cannot be undone.") ||
      !csrfToken
    ) {
      setError("Missing tenant or CSRF token.");
      return;
    }
    if (requestInProgress.current) {
      console.log("[DEBUG] Skipping delete, request in progress");
      return;
    }
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[ERROR] Failed to delete tenant", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        if (res.status === 403) {
          const newToken = await fetchCsrfToken();
          if (!newToken) {
            setError("Session expired. Please refresh the page.");
            return;
          }
          console.log("[INFO] Retrying delete with new CSRF token", { newToken });
          const retryRes = await fetch(`/api/tenants/${tenant._id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": newToken,
            },
            credentials: "include",
            body: JSON.stringify({ userId }),
          });
          if (!retryRes.ok) {
            const retryText = await retryRes.text();
            console.error("[ERROR] Retry failed for delete", {
              status: retryRes.status,
              response: retryText,
              headers: Object.fromEntries(retryRes.headers),
            });
            throw new Error(`Retry failed! Status: ${retryRes.status}`);
          }
          const retryData = await retryRes.json();
          if (retryData.success) {
            setSuccessMessage("Tenant deleted successfully!");
            setTimeout(() => router.push("/property-owner-dashboard/tenants"), 1000);
            return;
          }
          throw new Error(retryData.message || "Retry failed to delete tenant.");
        } else if (res.status === 429) {
          setError("Too many requests. Please try again later.");
          return;
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[ERROR] Non-JSON response from /api/tenants DELETE", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        throw new Error("Received non-JSON response from server");
      }
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Tenant deleted successfully!");
        setTimeout(() => router.push("/property-owner-dashboard/tenants"), 1000);
      } else {
        throw new Error(data.message || "Failed to delete tenant.");
      }
    } catch {
      console.error("[ERROR] Failed to delete tenant");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  };

  const handleEdit = () => {
    if (!tenant) return;
    setEditTenant({ ...tenant });
    setShowEditModal(true);
    setError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTenant || !tenant || !csrfToken) {
      setError("Missing tenant data or CSRF token.");
      return;
    }
    // Validate form inputs
    const errors: { [key: string]: string | undefined } = {};
    if (!editTenant.name?.trim()) errors.name = "Name is required";
    if (!editTenant.email?.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(editTenant.email)) errors.email = "Invalid email format";
    if (!editTenant.phone?.trim()) errors.phone = "Phone number is required";
    if (!editTenant.houseNumber?.trim()) errors.houseNumber = "House number is required";
    if (!editTenant.leaseStartDate) errors.leaseStartDate = "Lease start date is required";
    if (!editTenant.leaseEndDate) errors.leaseEndDate = "Lease end date is required";
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (requestInProgress.current) {
      console.log("[DEBUG] Skipping update, request in progress");
      return;
    }
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          name: editTenant.name,
          email: editTenant.email,
          phone: editTenant.phone,
          houseNumber: editTenant.houseNumber,
          leaseStartDate: editTenant.leaseStartDate,
          leaseEndDate: editTenant.leaseEndDate,
          userId,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[ERROR] Failed to update tenant", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        if (res.status === 403) {
          const newToken = await fetchCsrfToken();
          if (!newToken) {
            setError("Session expired. Please refresh the page.");
            return;
          }
          console.log("[INFO] Retrying update with new CSRF token", { newToken });
          const retryRes = await fetch(`/api/tenants/${tenant._id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": newToken,
            },
            credentials: "include",
            body: JSON.stringify({
              name: editTenant.name,
              email: editTenant.email,
              phone: editTenant.phone,
              houseNumber: editTenant.houseNumber,
              leaseStartDate: editTenant.leaseStartDate,
              leaseEndDate: editTenant.leaseEndDate,
              userId,
            }),
          });
          if (!retryRes.ok) {
            const retryText = await retryRes.text();
            console.error("[ERROR] Retry failed for update", {
              status: retryRes.status,
              response: retryText,
              headers: Object.fromEntries(retryRes.headers),
            });
            throw new Error(`Retry failed! Status: ${retryRes.status}`);
          }
          const retryData = await retryRes.json();
          if (retryData.success) {
            setTenant(retryData.tenant);
            setSuccessMessage("Tenant updated successfully!");
            setShowEditModal(false);
            setEditTenant(null);
            setEditErrors({});
            await fetchTenantData(newToken);
            await fetchDues(newToken);
            return;
          }
          throw new Error(retryData.message || "Retry failed to update tenant.");
        } else if (res.status === 429) {
          setError("Too many requests. Please try again later.");
          return;
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[ERROR] Non-JSON response from /api/tenants PUT", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        throw new Error("Received non-JSON response from server");
      }
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setSuccessMessage("Tenant updated successfully!");
        setShowEditModal(false);
        setEditTenant(null);
        setEditErrors({});
        await fetchTenantData(csrfToken);
        await fetchDues(csrfToken);
      } else {
        throw new Error(data.message || "Failed to update tenant.");
      }
    } catch {
      console.error("[ERROR] Failed to update tenant");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  };

  const openPaymentModal = () => {
    setShowPaymentModal(true);
    setPaymentErrors({});
    setError(null);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !csrfToken || !userId) {
      setError("Missing tenant data, user ID, or CSRF token.");
      return;
    }
    if (requestInProgress.current) {
      console.log("[DEBUG] Skipping payment submit, request in progress");
      return;
    }
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - (now - lastRequestTime.current)));
    }
    const errors: { [key: string]: string | undefined } = {};
    const amount = parseFloat(paymentData.amount);
    if (isNaN(amount) || amount <= 0) errors.amount = "Amount must be a positive number";
    if (!paymentData.type) errors.type = "Payment type is required";
    if (!paymentData.reference.trim()) errors.reference = "Reference is required";
    if (!paymentData.paymentDate) errors.paymentDate = "Payment date is required";
    setPaymentErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestInProgress.current = false;
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/tenant/payments/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          tenantId: tenant._id,
          amount,
          propertyId: tenant.propertyId,
          userId,
          type: paymentData.type,
          reference: paymentData.reference,
          paymentDate: paymentData.paymentDate,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[ERROR] Failed to record payment", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        if (res.status === 403) {
          const newToken = await fetchCsrfToken();
          if (!newToken) {
            setError("Session expired. Please refresh the page.");
            return;
          }
          console.log("[INFO] Retrying payment with new CSRF token", { newToken });
          const retryRes = await fetch("/api/tenant/payments/manual", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": newToken,
            },
            credentials: "include",
            body: JSON.stringify({
              tenantId: tenant._id,
              amount,
              propertyId: tenant.propertyId,
              userId,
              type: paymentData.type,
              reference: paymentData.reference,
              paymentDate: paymentData.paymentDate,
            }),
          });
          if (!retryRes.ok) {
            const retryText = await retryRes.text();
            console.error("[ERROR] Retry failed for payment", {
              status: retryRes.status,
              response: retryText,
              headers: Object.fromEntries(retryRes.headers),
            });
            throw new Error(`Retry failed! Status: ${retryRes.status}`);
          }
          const retryData = await retryRes.json();
          if (retryData.success) {
            setSuccessMessage("Payment recorded successfully!");
            setShowPaymentModal(false);
            setPaymentData({
              amount: "",
              type: "Rent",
              reference: "",
              paymentDate: new Date().toISOString().split("T")[0],
            });
            await fetchTenantData(newToken);
            await fetchDues(newToken);
            return;
          }
          throw new Error(retryData.message || "Retry failed to record payment.");
        } else if (res.status === 429) {
          setError("Too many requests. Please try again later.");
          return;
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[ERROR] Non-JSON response from /api/tenant/payments/manual", {
          status: res.status,
          response: text,
          headers: Object.fromEntries(res.headers),
        });
        throw new Error("Received non-JSON response from server");
      }
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Payment recorded successfully!");
        setShowPaymentModal(false);
        setPaymentData({
          amount: "",
          type: "Rent",
          reference: "",
          paymentDate: new Date().toISOString().split("T")[0],
        });
        await fetchTenantData(csrfToken);
        await fetchDues(csrfToken);
      } else {
        throw new Error(data.message || "Failed to record payment.");
      }
    } catch {
      console.error("[ERROR] Failed to record payment");
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  };

  const handleBack = () => {
    router.push("/property-owner-dashboard/tenants");
  };

  if (!userId || role !== "propertyOwner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#4ade80]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <Navbar />
        <Sidebar />
        <div className="sm:ml-64 mt-16">
          <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-3 max-w-2xl mx-auto">
              <svg
                className="h-6 w-6 text-red-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">{error}</span>
              <button
                onClick={async () => {
                  setError(null);
                  try {
                    const token = await fetchCsrfToken();
                    if (token) {
                      await fetchTenantData(token);
                      await fetchDues(token);
                    }
                  } catch {
                    setError("Failed to retry. Please refresh the page.");
                  }
                }}
                className="ml-auto text-red-700 hover:text-red-900 transition-colors"
                aria-label="Retry fetching tenant data and dues"
              >
                Retry
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (isLoading || !csrfToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <Navbar />
        <Sidebar />
        <div className="sm:ml-64 mt-16">
          <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 w-40 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg shadow-md p-6">
                <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] h-10 rounded-md mb-6 animate-pulse"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-md shadow-sm"
                    >
                      <div className="h-4 w-3/4 bg-gray-200 rounded mb-2 animate-pulse"></div>
                      <div className="h-6 w-full bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <Navbar />
        <Sidebar />
        <div className="sm:ml-64 mt-16">
          <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-3 max-w-2xl mx-auto">
              <svg
                className="h-6 w-6 text-red-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">Tenant not found.</span>
              <button
                onClick={async () => {
                  try {
                    const token = await fetchCsrfToken();
                    if (token) {
                      await fetchTenantData(token);
                      await fetchDues(token);
                    }
                  } catch {
                    setError("Failed to retry. Please refresh the page.");
                  }
                }}
                className="ml-auto text-red-700 hover:text-red-900 transition-colors"
                aria-label="Retry fetching tenant data and dues"
              >
                Retry
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-gray-800">
              <User className="text-[#4ade80] h-6 w-6" />
              {tenant.name}
            </h1>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition font-medium text-sm sm:text-base"
              aria-label="Back to tenants list"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Tenants
            </button>
          </div>
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-3 mb-4 max-w-2xl mx-auto animate-pulse">
              <svg
                className="h-6 w-6 text-red-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-700 hover:text-red-900 transition-colors"
                aria-label="Dismiss error"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}
          {successMessage && (
            <div className="bg-green-100 text-green-700 p-4 rounded-lg shadow-md flex items-center gap-3 mb-4 max-w-2xl mx-auto animate-pulse">
              <svg
                className="h-6 w-6 text-green-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="font-medium">{successMessage}</span>
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-green-700 hover:text-green-900 transition-colors"
                aria-label="Dismiss success message"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-lg shadow-md p-6 max-w-5xl mx-auto">
            <div className="bg-gradient-to-r from-[#012a4a] to-[#014a7a] text-white p-4 rounded-md mb-6">
              <h2 className="text-lg font-semibold">Tenant Information</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: "Full Name", value: tenant.name },
                { label: "Email", value: tenant.email },
                { label: "Phone", value: tenant.phone },
                {
                  label: "Property",
                  value: property?.name || "Property not found",
                },
                { label: "Unit Type", value: tenant.unitType },
                {
                  label: "Price (Ksh/month)",
                  value: tenant.price.toFixed(2),
                },
                { label: "Deposit (Ksh)", value: tenant.deposit.toFixed(2) },
                { label: "House Number", value: tenant.houseNumber },
                {
                  label: "Lease Start",
                  value: tenant.leaseStartDate
                    ? new Date(tenant.leaseStartDate).toLocaleDateString("en-GB")
                    : "N/A",
                },
                {
                  label: "Lease End",
                  value: tenant.leaseEndDate
                    ? new Date(tenant.leaseEndDate).toLocaleDateString("en-GB")
                    : "N/A",
                },
                {
                  label: "Status",
                  value: tenant.status,
                  className: `capitalize ${
                    tenant.status === "Active"
                      ? "text-[#4ade80]"
                      : tenant.status === "Pending"
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`,
                },
                {
                  label: "Payment Status",
                  value: tenant.paymentStatus,
                  className: `capitalize ${
                    tenant.paymentStatus === "overdue"
                      ? "text-red-600"
                      : "text-[#4ade80]"
                  }`,
                },
                {
                  label: "Wallet Balance (Ksh)",
                  value: tenant.walletBalance.toFixed(2),
                },
                {
                  label: "Total Rent Paid (Ksh)",
                  value: tenant.totalRentPaid.toFixed(2),
                },
                {
                  label: "Total Utility Paid (Ksh)",
                  value: tenant.totalUtilityPaid.toFixed(2),
                },
                {
                  label: "Total Deposit Paid (Ksh)",
                  value: tenant.totalDepositPaid.toFixed(2),
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-md shadow-sm hover:bg-gray-100 transition"
                >
                  <h3 className="text-sm font-medium text-gray-600 mb-1">
                    {item.label}
                  </h3>
                  <p
                    className={`text-base font-semibold ${
                      item.className || "text-gray-800"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            {tenant.dues ? (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Outstanding Dues
                </h3>
                {isDuesLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 rounded-md shadow-sm"
                      >
                        <div className="h-4 w-3/4 bg-gray-200 rounded mb-2 animate-pulse"></div>
                        <div className="h-6 w-full bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                    <div className="p-3 bg-gray-50 rounded-md shadow-sm">
                      <h3 className="text-sm font-medium text-gray-600 mb-1">
                        Rent Dues (Ksh)
                      </h3>
                      <p className="text-base font-semibold text-gray-800">
                        {tenant.dues.rentDues.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md shadow-sm">
                      <h3 className="text-sm font-medium text-gray-600 mb-1">
                        Utility Dues (Ksh)
                      </h3>
                      <p className="text-base font-semibold text-gray-800">
                        {tenant.dues.utilityDues.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md shadow-sm">
                      <h3 className="text-sm font-medium text-gray-600 mb-1">
                        Deposit Dues (Ksh)
                      </h3>
                      <p className="text-base font-semibold text-gray-800">
                        {tenant.dues.depositDues.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md shadow-sm">
                      <h3 className="text-sm font-medium text-gray-600 mb-1">
                        Total Remaining Dues (Ksh)
                      </h3>
                      <p className="text-base font-semibold text-gray-800">
                        {tenant.dues.totalRemainingDues.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-gray-600">Dues information not available.</p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                onClick={openPaymentModal}
                className="flex items-center gap-2 px-4 py-2 bg-[#4ade80] text-white rounded-lg hover:bg-[#3abf6e] transition"
                aria-label="Record a payment"
              >
                <DollarSign className="h-5 w-5" />
                Record Payment
              </button>
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                aria-label="Edit tenant"
              >
                <Edit className="h-5 w-5" />
                Edit Tenant
              </button>
              <button
                onClick={() => setShowImpersonateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
                aria-label="Impersonate tenant"
              >
                <LogIn className="h-5 w-5" />
                Impersonate
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                aria-label="Delete tenant"
              >
                <Trash2 className="h-5 w-5" />
                Delete Tenant
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Edit Tenant Modal */}
      {showEditModal && editTenant && (
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditTenant(null);
            setEditErrors({});
          }}
          title="Edit Tenant"
        >
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                value={editTenant.name || ""}
                onChange={(e) => setEditTenant({ ...editTenant, name: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.name && (
                <p className="mt-1 text-sm text-red-600">{editErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={editTenant.email || ""}
                onChange={(e) => setEditTenant({ ...editTenant, email: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.email && (
                <p className="mt-1 text-sm text-red-600">{editErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                type="text"
                value={editTenant.phone || ""}
                onChange={(e) => setEditTenant({ ...editTenant, phone: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{editErrors.phone}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                House Number
              </label>
              <input
                type="text"
                value={editTenant.houseNumber || ""}
                onChange={(e) => setEditTenant({ ...editTenant, houseNumber: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.houseNumber && (
                <p className="mt-1 text-sm text-red-600">{editErrors.houseNumber}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Lease Start Date
              </label>
              <input
                type="date"
                value={editTenant.leaseStartDate || ""}
                onChange={(e) => setEditTenant({ ...editTenant, leaseStartDate: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.leaseStartDate && (
                <p className="mt-1 text-sm text-red-600">{editErrors.leaseStartDate}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Lease End Date
              </label>
              <input
                type="date"
                value={editTenant.leaseEndDate || ""}
                onChange={(e) => setEditTenant({ ...editTenant, leaseEndDate: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {editErrors.leaseEndDate && (
                <p className="mt-1 text-sm text-red-600">{editErrors.leaseEndDate}</p>
              )}
            </div>
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditTenant(null);
                  setEditErrors({});
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-[#4ade80] text-white rounded-lg hover:bg-[#3abf6e] transition disabled:opacity-50"
              >
                {isLoading ? "Updating..." : "Update Tenant"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          title="Record Payment"
        >
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount (Ksh)
              </label>
              <input
                type="number"
                value={paymentData.amount}
                onChange={(e) =>
                  setPaymentData({ ...paymentData, amount: e.target.value })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
                min="0"
                step="0.01"
              />
              {paymentErrors.amount && (
                <p className="mt-1 text-sm text-red-600">
                  {paymentErrors.amount}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Payment Type
              </label>
              <select
                value={paymentData.type}
                onChange={(e) =>
                  setPaymentData({
                    ...paymentData,
                    type: e.target.value as PaymentFormData["type"],
                  })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              >
                <option value="Rent">Rent</option>
                <option value="Utility">Utility</option>
                <option value="Deposit">Deposit</option>
                <option value="Other">Other</option>
              </select>
              {paymentErrors.type && (
                <p className="mt-1 text-sm text-red-600">{paymentErrors.type}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Reference
              </label>
              <input
                type="text"
                value={paymentData.reference}
                onChange={(e) =>
                  setPaymentData({ ...paymentData, reference: e.target.value })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {paymentErrors.reference && (
                <p className="mt-1 text-sm text-red-600">
                  {paymentErrors.reference}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentData.paymentDate}
                onChange={(e) =>
                  setPaymentData({ ...paymentData, paymentDate: e.target.value })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#4ade80] focus:ring-[#4ade80]"
                required
              />
              {paymentErrors.paymentDate && (
                <p className="mt-1 text-sm text-red-600">
                  {paymentErrors.paymentDate}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-[#4ade80] text-white rounded-lg hover:bg-[#3abf6e] transition disabled:opacity-50"
              >
                {isLoading ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Impersonate Modal */}
      {showImpersonateModal && (
        <Modal
          isOpen={showImpersonateModal}
          onClose={() => setShowImpersonateModal(false)}
          title="Impersonate Tenant"
        >
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to impersonate {tenant.name}? This will log you in as the tenant.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowImpersonateModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleImpersonate}
                disabled={isLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:opacity-50"
              >
                {isLoading ? "Impersonating..." : "Impersonate"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}