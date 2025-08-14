"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  Home,
  DollarSign,
  User,
  AlertCircle,
  Wallet,
  LogOut,
} from "lucide-react";

interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  houseNumber: string;
  unitType: string;
  price: number;
  deposit: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  wallet: number;
  leaseStartDate?: string;
  leaseEndDate?: string;
  totalRentPaid?: number;
  totalUtilityPaid?: number;
  totalDepositPaid?: number;
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
  address: string;
  unitTypes: { type: string; price: number; deposit: number; quantity: number }[];
}

export default function TenantDashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maintenanceRequest, setMaintenanceRequest] = useState({
    description: "",
    urgency: "low",
  });
  const [maintenanceErrors, setMaintenanceErrors] = useState<{
    [key: string]: string | undefined;
  }>({}); // Added for form validation
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
    } catch (err) {
      console.error("[ERROR] Failed to fetch CSRF token", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return null;
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
  }, [csrfToken]);

  // Check cookies and redirect if unauthorized
  useEffect(() => {
    const getCookie = (name: string): string | null => {
      const value = Cookies.get(name);
      if (value !== undefined) return value;

      const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`));
      return cookie ? cookie.split("=")[1] : null;
    };

    const uid = getCookie("userId");
    const role = getCookie("role") ?? null;
    const originalRole = getCookie("originalRole") ?? null;
    const originalUserId = getCookie("originalUserId") ?? null;

    console.log("Cookies retrieved:", {
      userId: uid ?? "null",
      role: role ?? "null",
      originalRole: originalRole ?? "null",
      originalUserId: originalUserId ?? "null",
      documentCookie: document.cookie,
    });

    const isTenant = role === "tenant";
    const isImpersonating = originalRole === "propertyOwner" && originalUserId !== null;

    if (!uid || (!isTenant && !isImpersonating)) {
      setError("Unauthorized. Please log in as a tenant or impersonate a tenant.");
      console.log(
        `Unauthorized access - userId: ${uid ?? "null"}, role: ${role ?? "null"}, originalRole: ${
          originalRole ?? "null"
        }, originalUserId: ${originalUserId ?? "null"}`
      );
      setTimeout(() => router.replace("/"), 2000);
      return;
    }

    setUserId(uid);
    if (isImpersonating) {
      setIsImpersonated(true);
      console.log(
        `Impersonation session detected - userId: ${uid}, originalUserId: ${originalUserId}, originalRole: ${originalRole}`
      );
    }
  }, [router]);

  // Fetch tenant and property data
  useEffect(() => {
    if (!userId) return;

    const fetchTenantData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let token = csrfToken;
        if (!token) {
          token = await fetchCsrfToken();
          if (!token) {
            throw new Error("CSRF token not received");
          }
        }

        const tenantRes = await fetch("/api/tenant/profile", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          credentials: "include",
        });
        const tenantData = await tenantRes.json();

        if (!tenantData.success) {
          setError(tenantData.message || "Failed to fetch tenant data");
          console.log(`Failed to fetch tenant data - Error: ${tenantData.message}`);
          return;
        }

        setTenant({
          ...tenantData.tenant,
          totalRentPaid: tenantData.tenant.totalRentPaid || 0,
          totalUtilityPaid: tenantData.tenant.totalUtilityPaid || 0,
          totalDepositPaid: tenantData.tenant.totalDepositPaid || 0,
        });

        if (tenantData.tenant?.propertyId) {
          const propertyRes = await fetch(`/api/properties/${tenantData.tenant.propertyId}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": token,
            },
            credentials: "include",
          });
          const propertyData = await propertyRes.json();

          if (propertyData.success) {
            setProperty(propertyData.property);
          } else {
            setError(propertyData.message || "Failed to fetch property data");
            console.log(`Failed to fetch property data - Error: ${propertyData.message}`);
          }
        }

        await fetchDues(token);
      } catch (err) {
        console.error("Tenant fetch error:", err instanceof Error ? err.message : "Unknown error");
        setError("Failed to connect to the server");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenantData();
  }, [userId, csrfToken, fetchCsrfToken]); 

  // Fetch dues data
  const fetchDues = useCallback(
    async (token: string) => {
      if (!userId || !token) {
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
        console.log("[DEBUG] Sending fetchDues request", { csrfToken: token, userId });
        const res = await fetch("/api/tenant/dues", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          credentials: "include",
          body: JSON.stringify({ tenantId: userId, userId }),
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
            const retryRes = await fetch("/api/tenant/dues", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": newToken,
              },
              credentials: "include",
              body: JSON.stringify({ tenantId: userId, userId }),
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
            if (retryData.success && retryData.dues) {
              setTenant((prev) =>
                prev
                  ? {
                      ...prev,
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
          console.error("[ERROR] Non-JSON response from /api/tenant/dues", {
            status: res.status,
            response: text,
            headers: Object.fromEntries(res.headers),
          });
          throw new Error("Received non-JSON response from server");
        }
        const data = await res.json();
        if (data.success && data.dues) {
          setTenant((prev) =>
            prev
              ? {
                  ...prev,
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
      } catch (error) {
        console.error("[ERROR] Failed to fetch dues", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        setError(
          error instanceof Error
            ? error.message.includes("non-JSON")
              ? "Invalid server response. Please try again later."
              : error.message.includes("CSRF")
              ? "Session expired. Please refresh the page."
              : error.message
            : "Failed to fetch dues."
        );
      } finally {
        setIsDuesLoading(false);
        requestInProgress.current = false;
        lastRequestTime.current = Date.now();
      }
    },
    [userId, fetchCsrfToken]
  );

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate form inputs
    const errors: { [key: string]: string | undefined } = {};
    if (!maintenanceRequest.description.trim()) {
      errors.description = "Description is required";
    }
    setMaintenanceErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let token = csrfToken;
      if (!token) {
        token = await fetchCsrfToken();
        if (!token) {
          throw new Error("CSRF token not received");
        }
      }

      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "include",
        body: JSON.stringify({
          tenantId: userId,
          propertyId: tenant?.propertyId,
          description: maintenanceRequest.description,
          urgency: maintenanceRequest.urgency,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Maintenance request submitted successfully!");
        setMaintenanceRequest({ description: "", urgency: "low" });
        setIsModalOpen(false);
        setMaintenanceErrors({});
      } else {
        setError(data.message || "Failed to submit maintenance request");
        console.log(`Maintenance request failed - Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Maintenance submit error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to submit maintenance request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevertImpersonation = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let token = csrfToken;
      if (!token) {
        token = await fetchCsrfToken();
        if (!token) {
          throw new Error("CSRF token not received");
        }
      }

      const res = await fetch("/api/impersonate/revert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage("Impersonation reverted successfully!");
        console.log("Impersonation reverted successfully");
        Cookies.remove("userId", { path: "/" });
        Cookies.remove("role", { path: "/" });
        Cookies.remove("originalUserId", { path: "/" });
        Cookies.remove("originalRole", { path: "/" });
        setTimeout(() => router.push("/property-owner-dashboard"), 1000);
      } else {
        setError(data.message || "Failed to revert impersonation");
        console.log(`Revert impersonation failed - Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Revert impersonation error:", err instanceof Error ? err.message : "Unknown error");
      setError("Failed to revert impersonation");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white">
      <main className="p-4 max-w-7xl mx-auto">
        <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Welcome, {tenant?.name || "Tenant"}!</h1>
            <p>Manage your lease, track payments, and submit maintenance requests with ease.</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 flex items-center gap-2"
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
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              </svg>
              Submit Maintenance Request
            </button>
            {isImpersonated && (
              <button
                onClick={handleRevertImpersonation}
                disabled={isLoading}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2"
              >
                <LogOut size={18} />
                Revert Impersonation
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg">
            {successMessage}
          </div>
        )}
        {isLoading && (
          <div className="mb-4 p-4 bg-blue-100 text-blue-800 rounded-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"></div>
            Loading...
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card icon={<Home />} title="Leased Property">
            {property && tenant ? (
              <>
                <p className="font-medium">{property.name}</p>
                <p className="text-gray-500">{property.address}</p>
                <p className="mt-2">Unit: {tenant.houseNumber} ({tenant.unitType})</p>
                <p>Rent: Ksh {tenant.price?.toFixed(2)}</p>
                <p>Deposit: Ksh {tenant.deposit?.toFixed(2)}</p>
                <p>Lease Start: {tenant.leaseStartDate ? new Date(tenant.leaseStartDate).toLocaleDateString("en-GB") : "N/A"}</p>
                <p>Lease End: {tenant.leaseEndDate ? new Date(tenant.leaseEndDate).toLocaleDateString("en-GB") : "N/A"}</p>
                <p>Months Stayed: {tenant.monthsStayed ?? "N/A"}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No property assigned.</p>
            )}
          </Card>

          <Card icon={<DollarSign />} title="Payment Status">
            {tenant ? (
              <>
                <p>Rent: Ksh {tenant.price?.toFixed(2)}</p>
                <p className="mt-2">
                  Status:
                  <span
                    className={`ml-2 inline-block px-3 py-1 text-sm font-medium rounded-full ${
                      tenant.paymentStatus === "paid"
                        ? "bg-green-100 text-green-800"
                        : tenant.paymentStatus === "overdue"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {tenant.paymentStatus || "N/A"}
                  </span>
                </p>
                <p className="mt-2">Total Rent Paid: Ksh {tenant.totalRentPaid?.toFixed(2) ?? "0.00"}</p>
                <p>Total Utility Paid: Ksh {tenant.totalUtilityPaid?.toFixed(2) ?? "0.00"}</p>
                <p>Total Deposit Paid: Ksh {tenant.totalDepositPaid?.toFixed(2) ?? "0.00"}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No payment info.</p>
            )}
          </Card>

          <Card icon={<DollarSign />} title="Outstanding Dues">
            {isDuesLoading ? (
              <p className="text-sm text-gray-500">Loading dues...</p>
            ) : tenant?.dues ? (
              <>
                <p>Rent Dues: Ksh {tenant.dues.rentDues.toFixed(2)}</p>
                <p>Utility Dues: Ksh {tenant.dues.utilityDues.toFixed(2)}</p>
                <p>Deposit Dues: Ksh {tenant.dues.depositDues.toFixed(2)}</p>
                <p className="font-medium mt-2">Total: Ksh {tenant.dues.totalRemainingDues.toFixed(2)}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No dues information available.</p>
            )}
          </Card>

          <Card icon={<Wallet />} title="Wallet Balance">
            {tenant ? (
              <>
                <p className="text-2xl font-bold text-teal-700">Ksh {tenant.wallet?.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">Use wallet for quick rent payments.</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Wallet not available.</p>
            )}
          </Card>

          <Card icon={<User />} title="Your Profile">
            {tenant ? (
              <>
                <p className="font-medium">{tenant.name}</p>
                <p className="text-gray-500">{tenant.email}</p>
                <p className="mt-2">{tenant.phone || "No phone provided"}</p>
                <p>Status: 
                  <span
                    className={`ml-2 inline-block px-3 py-1 text-sm font-medium rounded-full ${
                      tenant.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : tenant.status === "Pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {tenant.status || "N/A"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No profile info.</p>
            )}
          </Card>
        </div>
      </main>

      {/* Maintenance Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Submit Maintenance Request</h2>
            <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={maintenanceRequest.description}
                  onChange={(e) =>
                    setMaintenanceRequest({ ...maintenanceRequest, description: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-600 focus:ring-teal-600"
                  required
                  rows={4}
                />
                {maintenanceErrors.description && (
                  <p className="mt-1 text-sm text-red-600">{maintenanceErrors.description}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Urgency
                </label>
                <select
                  value={maintenanceRequest.urgency}
                  onChange={(e) =>
                    setMaintenanceRequest({ ...maintenanceRequest, urgency: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-600 focus:ring-teal-600"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setMaintenanceErrors({});
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50"
                >
                  {isLoading ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
        <span className="text-teal-600">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  );
}