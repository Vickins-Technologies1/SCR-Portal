// src/app/property-owner-dashboard/tenants/[tenantId]/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";

import { ResponseTenant } from "@/types/tenant";
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

  const [tenant, setTenant] = useState<ResponseTenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    amount: "",
    type: "Rent",
    reference: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});

  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 800;

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
      console.error("CSRF error:", err);
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
    return null;
  }, [csrfToken]);

  const fetchTenantData = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;
    setIsPageLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        headers: { "X-CSRF-Token": token },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setProperty(data.property || null);
      }
    } catch {
      setTenant(null);
    } finally {
      setIsPageLoading(false);
    }
  }, [userId, tenantId]);

  const fetchDues = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;
    setIsDuesLoading(true);
    try {
      const res = await fetch("/api/tenants/check-dues", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
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
      console.error(err);
    } finally {
      setIsDuesLoading(false);
    }
  }, [userId, tenantId]);

  // Auth
  useEffect(() => {
    const uid = Cookies.get("userId");
    const role = Cookies.get("role");
    if (!uid || role !== "propertyOwner") {
      router.push("/login");
    } else {
      setUserId(uid);
    }
  }, [router]);

  // Load data
  useEffect(() => {
    if (userId) {
      const load = async () => {
        const token = csrfToken || (await fetchCsrfToken());
        if (token) {
          await fetchTenantData(token);
          await fetchDues(token);
        }
      };
      load();
    }
  }, [userId]);

  // Auto-fill amount
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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !csrfToken) return;

    const errors: Record<string, string> = {};
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) errors.amount = "Invalid amount";
    if (!paymentData.reference.trim()) errors.reference = "Reference required";

    if (Object.keys(errors).length) {
      setPaymentErrors(errors);
      return;
    }

    setIsRecordingPayment(true);
    try {
      const res = await fetch("/api/tenant/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
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
        setSuccessMessage(`Ksh ${paymentData.amount} recorded!`);
        setShowPaymentModal(false);
        setPaymentData({ ...paymentData, amount: "", reference: "" });
        const token = csrfToken || (await fetchCsrfToken());
        if (token) {
          await fetchTenantData(token);
          await fetchDues(token);
        }
      } else {
        setPaymentErrors({ general: result.message || "Failed" });
      }
    } catch {
      setPaymentErrors({ general: "Network error" });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  if (isPageLoading || !tenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading tenant...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Recording Payment Loader */}
      {isRecordingPayment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white mb-6">Recording Payment...</h3>
            <div className="grid grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="w-16 h-16 bg-emerald-500 rounded-xl animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Sidebar />

        {/* Main Content - Mobile First */}
        <div className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 mt-4">
            <button
              onClick={() => router.push("/property-owner-dashboard/tenants")}
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>

          {/* Avatar + Name */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg flex-shrink-0">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
              <p className="text-gray-600 text-sm">
                {property?.name ? `${property.name} • ${tenant.houseNumber}` : "Property"}
              </p>
            </div>
          </div>

          {/* Success */}
          {successMessage && (
            <div className="mb-5 bg-emerald-100 text-emerald-800 px-4 py-3 rounded-lg text-sm font-medium flex justify-between items-center">
              <span>{successMessage}</span>
              <button onClick={() => setSuccessMessage(null)} className="text-xl">×</button>
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-5">
              <h2 className="text-xl font-bold">Tenant Overview</h2>
            </div>

            {/* Content */}
            <div className="p-5 space-y-8">
              <TenantInfoGrid tenant={tenant} property={property} />
              <DuesSection tenant={tenant} isDuesLoading={isDuesLoading} />
              <ActionButtons
                onRecordPayment={() => setShowPaymentModal(true)}
                onEdit={() => alert("Coming soon")}
                onImpersonate={() => setShowImpersonateModal(true)}
                onDelete={() => alert("Coming soon")}
              />
            </div>
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
            setShowImpersonateModal(false);
          }}
          isLoading={false}
        />
      </div>
    </>
  );
}