// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

type PaymentType = "till" | "paybill" | "bank";

const normalizeTillNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const normalizeNumeric = (value: string) => value.replace(/\s+/g, "");

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>("paybill");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [bankPaybillNumber, setBankPaybillNumber] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState({
    paymentType: "paybill" as PaymentType,
    paybillNumber: "",
    bankPaybillNumber: "",
    bankAccountNumber: "",
    tillNumber: "",
    isDefault: true,
  });

  const isDirty = useMemo(() => {
    return (
      paymentType !== initialValues.paymentType ||
      normalizeNumeric(paybillNumber) !== initialValues.paybillNumber ||
      normalizeNumeric(bankPaybillNumber) !== initialValues.bankPaybillNumber ||
      normalizeNumeric(bankAccountNumber) !== initialValues.bankAccountNumber ||
      normalizeTillNumber(tillNumber) !== initialValues.tillNumber ||
      isDefault !== initialValues.isDefault
    );
  }, [paymentType, paybillNumber, bankPaybillNumber, bankAccountNumber, tillNumber, isDefault, initialValues]);

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
    if (nextType !== "paybill") setPaybillNumber("");
    if (nextType !== "till") setTillNumber("");
    if (nextType !== "bank") {
      setBankPaybillNumber("");
      setBankAccountNumber("");
    }
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/mpesa/connect", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          const resolvedPaymentType: PaymentType =
            data.paymentType === "till" || data.paymentType === "bank" || data.paymentType === "paybill"
              ? data.paymentType
              : "paybill";
          setConnected(!!data.connected);
          setPaymentType(resolvedPaymentType);
          const nextPaybill = data.paybillNumber ? String(data.paybillNumber) : "";
          const nextBankPaybill = data.bankPaybillNumber ? String(data.bankPaybillNumber) : "";
          const nextBankAccount = data.bankAccountNumber ? String(data.bankAccountNumber) : "";
          const nextTill = data.tillNumber ? normalizeTillNumber(String(data.tillNumber)) : "";
          const nextDefault = typeof data.isDefault === "boolean" ? data.isDefault : true;
          setPaybillNumber(nextPaybill);
          setBankPaybillNumber(nextBankPaybill);
          setBankAccountNumber(nextBankAccount);
          setTillNumber(nextTill);
          setIsDefault(nextDefault);
          setInitialValues({
            paymentType: resolvedPaymentType,
            paybillNumber: normalizeNumeric(nextPaybill),
            bankPaybillNumber: normalizeNumeric(nextBankPaybill),
            bankAccountNumber: normalizeNumeric(nextBankAccount),
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
    const sanitizedBankPaybill = normalizeNumeric(bankPaybillNumber);
    const sanitizedBankAccount = normalizeNumeric(bankAccountNumber);

    if (paymentType === "till" && !sanitizedTill.trim()) {
      toast.error("Please enter your till number.");
      return;
    }
    if (paymentType === "paybill" && !sanitizedPaybill.trim()) {
      toast.error("Please enter your paybill number.");
      return;
    }
    if (paymentType === "bank") {
      if (!sanitizedBankPaybill.trim()) {
        toast.error("Please enter your bank paybill number.");
        return;
      }
      if (!sanitizedBankAccount.trim()) {
        toast.error("Please enter your bank account number.");
        return;
      }
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
          bankPaybillNumber: paymentType === "bank" ? sanitizedBankPaybill : "",
          bankAccountNumber: paymentType === "bank" ? sanitizedBankAccount : "",
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
        bankPaybillNumber: paymentType === "bank" ? sanitizedBankPaybill : "",
        bankAccountNumber: paymentType === "bank" ? sanitizedBankAccount : "",
        tillNumber: paymentType === "till" ? sanitizedTill : "",
        isDefault,
      });
    } catch {
      toast.error("Failed to save account details");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const destinationSummary =
    paymentType === "till"
      ? tillNumber || "—"
      : paymentType === "paybill"
        ? paybillNumber || "—"
        : bankPaybillNumber || "—";

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
              {paymentType === "till" ? "Till" : paymentType === "bank" ? "Bank" : "Paybill"}
            </p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {paymentType === "till" ? "Till Number" : paymentType === "bank" ? "Bank Paybill" : "Paybill Number"}
            </p>
            <p className="text-sm font-semibold text-foreground">{destinationSummary}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {paymentType === "bank" ? "Bank Account" : "Default Route"}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {paymentType === "bank" ? bankAccountNumber || "—" : isDefault ? "Yes" : "No"}
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
            <option value="till">Till (Buy Goods)</option>
            <option value="paybill">Paybill</option>
            <option value="bank">Bank</option>
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
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Paybill Number</label>
            <input
              type="text"
              inputMode="numeric"
              value={paybillNumber}
              onChange={(e) => setPaybillNumber(normalizeNumeric(e.target.value))}
              disabled={disabled}
              className="mt-1 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="e.g. 400200"
            />
          </div>
        )}

        {paymentType === "bank" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Bank Paybill Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={bankPaybillNumber}
                onChange={(e) => setBankPaybillNumber(normalizeNumeric(e.target.value))}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="e.g. 522522"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Bank Account Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(normalizeNumeric(e.target.value))}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-white/60 rounded-xl bg-white/70 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Your bank account number"
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
            <option value="yes">Yes</option>
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
