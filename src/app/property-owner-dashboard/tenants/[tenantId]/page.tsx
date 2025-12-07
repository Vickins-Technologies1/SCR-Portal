// src/app/property-owner-dashboard/tenants/[tenantId]/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Your real shared type
import { ResponseTenant } from "@/types/tenant";

// Components
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import TenantInfoGrid from "../../components/TenantInfoGrid";
import DuesSection from "../../components/DuesSection";
import ActionButtons from "../../components/ActionButtons";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import ImpersonateModal from "../../components/ImpersonateModal";

interface Property {
  _id: string;
  name: string;
}

interface PaymentFormData {
  amount: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  reference: string;
  paymentDate: string;
}

export default function TenantDetailsPage() {
  const router = useRouter();
  const { tenantId } = useParams() as { tenantId: string };

  // State — using your real ResponseTenant type
  const [tenant, setTenant] = useState<ResponseTenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  // Payment form
  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    amount: "",
    type: "Rent",
    reference: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});

  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 1000;

  // Fetch CSRF Token
  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    if (requestInProgress.current) return csrfToken;
    requestInProgress.current = true;

    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((r) => setTimeout(r, rateLimitDelay - (now - lastRequestTime.current)));
    }

    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        const token = data.csrfToken;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, { path: "/", secure: true, sameSite: "strict" });
        return token;
      }
    } catch (err) {
      console.error("Failed to fetch CSRF token:", err);
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
    return null;
  }, [csrfToken]);

  // Fetch Tenant + Property
  const fetchTenantData = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;

    setIsPageLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        headers: { "X-CSRF-Token": token },
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to fetch tenant");
      const data = await res.json();

      if (data.success) {
        setTenant(data.tenant);           // Real ResponseTenant
        setProperty(data.property || null);
      } else {
        setError("Tenant not found");
      }
    } catch (err) {
      setError("Failed to load tenant data");
    } finally {
      setIsPageLoading(false);
    }
  }, [userId, tenantId]);

  // Fetch Real-Time Dues (from payments collection)
  const fetchDues = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;

    setIsDuesLoading(true);
    try {
      const res = await fetch("/api/tenants/check-dues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "include",
        body: JSON.stringify({ tenantId, userId }),
      });

      const data = await res.json();
      if (data.success) {
        setTenant((prev) =>
          prev
            ? {
                ...prev,
                dues: data.dues,
                totalRentPaid: data.tenant.totalRentPaid,
                totalDepositPaid: data.tenant.totalDepositPaid,
                totalUtilityPaid: data.tenant.totalUtilityPaid,
                paymentStatus: data.tenant.paymentStatus,
                monthsStayed: data.monthsStayed,
              }
            : null
        );
      }
    } catch (err) {
      console.error("Failed to fetch dues:", err);
    } finally {
      setIsDuesLoading(false);
    }
  }, [userId, tenantId]);

  // Auth Check
  useEffect(() => {
    const uid = Cookies.get("userId");
    const userRole = Cookies.get("role");

    if (!uid || userRole !== "propertyOwner") {
      router.push("/login");
      return;
    }

    setUserId(uid);
  }, [router]);

  // Initial Load
  useEffect(() => {
    const load = async () => {
      const token = csrfToken || (await fetchCsrfToken());
      if (token && userId) {
        await fetchTenantData(token);
        await fetchDues(token);
      }
    };

    if (userId) load();
  }, [userId, csrfToken, fetchCsrfToken, fetchTenantData, fetchDues]);

  // Auto-fill payment amount
  useEffect(() => {
    if (showPaymentModal && tenant?.dues) {
      const { rentDues, depositDues, utilityDues, totalRemainingDues } = tenant.dues;
      let amount = "";

      if (paymentData.type === "Rent" && rentDues > 0) amount = rentDues.toFixed(2);
      else if (paymentData.type === "Deposit" && depositDues > 0) amount = depositDues.toFixed(2);
      else if (paymentData.type === "Utility" && utilityDues > 0) amount = utilityDues.toFixed(2);
      else if (totalRemainingDues > 0) amount = totalRemainingDues.toFixed(2);

      setPaymentData((prev) => ({ ...prev, amount }));
    }
  }, [showPaymentModal, tenant?.dues, paymentData.type]);

  // Record Manual Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !csrfToken) return;

    const errors: Record<string, string> = {};
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0)
      errors.amount = "Enter a valid amount";
    if (!paymentData.reference.trim()) errors.reference = "Reference is required";

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      return;
    }

    setIsRecordingPayment(true);
    setPaymentErrors({});
    setError(null);

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
          userId,
          propertyId: tenant.propertyId,
          amount: parseFloat(paymentData.amount),
          type: paymentData.type,
          reference: paymentData.reference.trim(),
          paymentDate: paymentData.paymentDate,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setSuccessMessage(`Ksh ${paymentData.amount} recorded successfully!`);
        setShowPaymentModal(false);
        setPaymentData({ ...paymentData, amount: "", reference: "" });

        const token = csrfToken || (await fetchCsrfToken());
        if (token) {
          await fetchTenantData(token);
          await fetchDues(token);
        }
      } else {
        setPaymentErrors({ general: result.message || "Payment failed" });
      }
    } catch (err) {
      setPaymentErrors({ general: "Network error. Please try again." });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Loading State
  if (isPageLoading || !tenant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-t-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading tenant details...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Gorgeous Recording Payment Loader */}
      {isRecordingPayment && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-lg z-50 flex items-center justify-center">
          <div className="text-center">
            <h3 className="text-4xl font-bold text-white mb-8">Recording Payment</h3>
            <p className="text-slate-300 text-lg mb-12">Updating records securely...</p>
            <div className="grid grid-cols-3 gap-6">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl shadow-2xl"
                  style={{
                    animation: `pulseGlow 1.8s ease-in-out infinite both`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <style jsx>{`
            @keyframes pulseGlow {
              0%, 100% { opacity: 0.6; transform: scale(0.9); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <Navbar />
        <Sidebar />

        <div className="lg:ml-64 pt-16">
          <main className="p-6 lg:p-10">
            <div className="max-w-7xl mx-auto">

              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-2xl">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold text-slate-800">{tenant.name}</h1>
                    <p className="text-xl text-slate-600 mt-1">
                      {property?.name ? `${property.name} • ${tenant.houseNumber}` : "Property loading..."}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => router.push("/property-owner-dashboard/tenants")}
                  className="flex items-center gap-3 px-6 py-3.5 bg-white border-2 border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition font-semibold shadow-md"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back to Tenants
                </button>
              </div>

              {/* Success Message */}
              {successMessage && (
                <div className="mb-8 bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 text-emerald-800 flex justify-between items-center shadow-lg">
                  <span className="text-lg font-bold">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} className="text-3xl font-light hover:text-emerald-900">×</button>
                </div>
              )}

              {/* Main Card */}
              <div className="bg-white rounded-3xl shadow-2xl border overflow-hidden">
                <div className="bg-gradient-to-r from-[#012a4a] via-[#013a6b] to-[#014f86] text-white p-10">
                  <h2 className="text-3xl font-bold">Tenant Financial Dashboard</h2>
                  <p className="text-slate-200 mt-2">All payment data is real-time from the payments collection</p>
                </div>

                <div className="p-10 space-y-12">
                  <TenantInfoGrid tenant={tenant} property={property} />
                  <DuesSection tenant={tenant} isDuesLoading={isDuesLoading} />
                  <ActionButtons
                    onRecordPayment={() => setShowPaymentModal(true)}
                    onEdit={() => alert("Edit tenant coming soon")}
                    onImpersonate={() => setShowImpersonateModal(true)}
                    onDelete={() => alert("Delete tenant coming soon")}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Modals */}
      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentErrors({});
          setPaymentData({ ...paymentData, amount: "", reference: "" });
        }}
        tenant={tenant}
        paymentData={paymentData}
        setPaymentData={setPaymentData}
        paymentErrors={paymentErrors}
        setPaymentErrors={setPaymentErrors}
        onSubmit={handlePaymentSubmit}
        isLoading={isRecordingPayment}
      />

      <ImpersonateModal
        isOpen={showImpersonateModal}
        onClose={() => setShowImpersonateModal(false)}
        tenantName={tenant.name}
        onConfirm={async () => {
          alert("Impersonation coming soon");
          setShowImpersonateModal(false);
        }}
        isLoading={false}
      />
    </>
  );
}