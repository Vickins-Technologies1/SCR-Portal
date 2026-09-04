// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

type PaymentType = "till" | "paybill";

const normalizeTillNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const normalizeNumeric = (value: string) => value.replace(/\s+/g, "");

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>("paybill");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [paybillAccountNumber, setPaybillAccountNumber] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState({
    paymentType: "paybill" as PaymentType,
    paybillNumber: "",
    paybillAccountNumber: "",
    tillNumber: "",
    isDefault: true,
  });

  const isDirty = useMemo(() => {
    return (
      paymentType !== initialValues.paymentType ||
      normalizeNumeric(paybillNumber) !== initialValues.paybillNumber ||
      normalizeNumeric(paybillAccountNumber) !== initialValues.paybillAccountNumber ||
      normalizeTillNumber(tillNumber) !== initialValues.tillNumber ||
      isDefault !== initialValues.isDefault
    );
  }, [
    paymentType,
    paybillNumber,
    paybillAccountNumber,
    tillNumber,
    isDefault,
    initialValues,
  ]);

  const statusLabel =
    connected === null
      ? "Checking connection..."
      : connected
        ? isDirty
          ? "Connected • Unsaved changes"
          : "Connected"
        : "Not connected";

  const handlePaymentTypeChange = (nextType: PaymentType) => {
    setPaymentType(nextType);

    if (nextType !== "paybill") {
      setPaybillNumber("");
      setPaybillAccountNumber("");
    }
    if (nextType !== "till") {
      setTillNumber("");
    }
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/mpesa/connect", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          const resolvedPaymentType = data.paymentType === "till" || data.paymentType === "paybill" ? data.paymentType : "paybill";
          setConnected(!!data.connected);
          setPaymentType(resolvedPaymentType);
          const nextPaybill = data.paybillNumber ? String(data.paybillNumber) : "";
          const nextAccount = data.paybillAccountNumber ? String(data.paybillAccountNumber) : "";
          const nextTill = data.tillNumber ? normalizeTillNumber(String(data.tillNumber)) : "";
          const nextDefault = typeof data.isDefault === "boolean" ? data.isDefault : true;
          setPaybillNumber(nextPaybill);
          setPaybillAccountNumber(nextAccount);
          setTillNumber(nextTill);
          setIsDefault(nextDefault);
          setInitialValues({
            paymentType: resolvedPaymentType,
            paybillNumber: normalizeNumeric(nextPaybill),
            paybillAccountNumber: normalizeNumeric(nextAccount),
            tillNumber: normalizeTillNumber(nextTill),
            isDefault: nextDefault,
          });
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    };

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) setCsrfToken(data.csrfToken);
      } catch {
        setCsrfToken(null);
      }
    };

    fetchStatus();
    fetchCsrf();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;

    const sanitizedTill = normalizeTillNumber(tillNumber);
    const sanitizedPaybill = normalizeNumeric(paybillNumber);
    const sanitizedAccount = normalizeNumeric(paybillAccountNumber);

    if (paymentType === "till" && !sanitizedTill.trim()) {
      toast.error("Please enter your till number.");
      return;
    } else if (paymentType === "paybill" && !sanitizedPaybill.trim()) {
      toast.error("Please enter your paybill number.");
      return;
    } else if (paymentType === "paybill" && !sanitizedAccount.trim()) {
      toast.error("Please enter your paybill account number.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/mpesa/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          paymentType,
          paybillNumber: paymentType === "paybill" ? sanitizedPaybill : "",
          paybillAccountNumber: paymentType === "paybill" ? sanitizedAccount : "",
          tillNumber: paymentType === "till" ? sanitizedTill : "",
          isDefault,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to connect M-Pesa");
        setConnected(false);
        return;
      }

      toast.success("Account details saved successfully");
      setConnected(true);
      setInitialValues({
        paymentType,
        paybillNumber: paymentType === "paybill" ? sanitizedPaybill : "",
        paybillAccountNumber: paymentType === "paybill" ? sanitizedAccount : "",
        tillNumber: paymentType === "till" ? sanitizedTill : "",
        isDefault,
      });
    } catch (error) {
      toast.error("Failed to save account details");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                connected
                  ? "bg-primary/15 text-primary"
                  : connected === null
                    ? "bg-gray-100 text-gray-500"
                    : "bg-amber-100 text-amber-600"
              }`}
            >
              {connected === null ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : connected ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Payment Connection</p>
              <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? "Your payment details are ready for tenant collections."
                  : "Add your details to enable STK Push collections."}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
              connected
                ? "bg-primary/10 text-primary"
                : connected === null
                  ? "bg-gray-100 text-gray-500"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {connected === null ? "Checking" : connected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Payment Type</p>
            <p className="text-sm font-semibold text-foreground">
              {paymentType === "till" ? "Buy Goods Till" : "Paybill"}
            </p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {paymentType === "till" ? "Till Number" : "Paybill Number"}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {paymentType === "till" ? tillNumber || "—" : paybillNumber || "—"}
            </p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Account / Default</p>
            <p className="text-sm font-semibold text-foreground">
              {paymentType === "paybill" ? paybillAccountNumber || "—" : isDefault ? "Default Route" : "Secondary"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/50 bg-white/60 p-4 shadow-sm backdrop-blur">
        <div>
          <label className="text-xs font-medium text-gray-600">Choose Payment Type</label>
          <select
            value={paymentType}
            onChange={(e) => handlePaymentTypeChange(e.target.value as PaymentType)}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            <option value="till">Buy Goods Till Number</option>
            <option value="paybill">Paybill Number</option>
          </select>
        </div>

        {paymentType === "till" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Till Number</label>
            <input
              type="text"
              value={tillNumber}
              onChange={(e) => setTillNumber(normalizeTillNumber(e.target.value))}
              disabled={disabled}
              className="mt-1 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="e.g. K123456"
            />
          </div>
        )}

        {paymentType === "paybill" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Paybill Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={paybillNumber}
                onChange={(e) => setPaybillNumber(normalizeNumeric(e.target.value))}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Paybill Number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Paybill Account Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={paybillAccountNumber}
                onChange={(e) => setPaybillAccountNumber(normalizeNumeric(e.target.value))}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Account Number"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">Set As Default</label>
          <select
            value={isDefault ? "yes" : "no"}
            onChange={(e) => {
              if (disabled) return;
              setIsDefault(e.target.value === "yes");
            }}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            <option value="yes">Yes (Paybill & Till to M-Pesa)</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Account Details"}
      </button>
    </form>
  );
}
