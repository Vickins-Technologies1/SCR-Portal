// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

type PaymentType = "bank" | "till" | "paybill";

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>("paybill");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [paybillAccountNumber, setPaybillAccountNumber] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [bankPaybillNumber, setBankPaybillNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/mpesa/connect", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          setConnected(!!data.connected);
          if (data.paymentType === "bank" || data.paymentType === "till" || data.paymentType === "paybill") {
            setPaymentType(data.paymentType);
          }
          if (data.paybillNumber) setPaybillNumber(data.paybillNumber);
          if (data.paybillAccountNumber) setPaybillAccountNumber(data.paybillAccountNumber);
          if (data.bankPaybillNumber) setBankPaybillNumber(data.bankPaybillNumber);
          if (data.accountNumber) setAccountNumber(data.accountNumber);
          if (data.tillNumber) setTillNumber(data.tillNumber);
          if (typeof data.isDefault === "boolean") setIsDefault(data.isDefault);
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

    if (paymentType === "bank") {
      if (!bankPaybillNumber.trim()) {
        toast.error("Please enter your bank paybill number.");
        return;
      }
      if (!accountNumber.trim()) {
        toast.error("Please enter your bank account number.");
        return;
      }
    } else if (paymentType === "till" && !tillNumber.trim()) {
      toast.error("Please enter your till number.");
      return;
    } else if (paymentType === "paybill" && !paybillNumber.trim()) {
      toast.error("Please enter your paybill number.");
      return;
    } else if (paymentType === "paybill" && !paybillAccountNumber.trim()) {
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
          paybillNumber: paymentType === "paybill" ? paybillNumber.trim() : "",
          paybillAccountNumber: paymentType === "paybill" ? paybillAccountNumber.trim() : "",
          tillNumber: paymentType === "till" ? tillNumber.trim() : "",
          bankPaybillNumber: paymentType === "bank" ? bankPaybillNumber.trim() : "",
          accountNumber: paymentType === "bank" ? accountNumber.trim() : "",
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
    } catch (error) {
      toast.error("Failed to save account details");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            connected ? "bg-emerald-500" : connected === false ? "bg-red-400" : "bg-gray-300"
          }`}
        />
        <span className="text-gray-600">
          {connected === null ? "Checking connection..." : connected ? "Connected" : "Not Connected"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">Choose Payment Type</label>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as PaymentType)}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            <option value="bank">Bank Account</option>
            <option value="till">Buy Goods Till Number</option>
            <option value="paybill">Paybill Number</option>
          </select>
        </div>

        {paymentType === "bank" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600">Bank Paybill Number</label>
              <input
                type="text"
                value={bankPaybillNumber}
                onChange={(e) => setBankPaybillNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Bank Paybill Number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Bank Account Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Account Number"
              />
            </div>
          </>
        )}

        {paymentType === "till" && (
          <div>
            <label className="text-xs font-medium text-gray-600">Till Number</label>
            <input
              type="text"
              value={tillNumber}
              onChange={(e) => setTillNumber(e.target.value)}
              disabled={disabled}
              className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="Enter Till Number"
            />
          </div>
        )}

        {paymentType === "paybill" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600">Paybill Number</label>
              <input
                type="text"
                value={paybillNumber}
                onChange={(e) => setPaybillNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Paybill Number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Paybill Account Number</label>
              <input
                type="text"
                value={paybillAccountNumber}
                onChange={(e) => setPaybillAccountNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter Account Number"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">Set As Default</label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (disabled) return;
                setIsDefault((prev) => !prev);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                isDefault ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  isDefault ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-xs text-gray-600">
              {isDefault ? "Yes (Paybill, Till & Bank to M-Pesa)" : "No"}
            </span>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Account Details"}
      </button>
    </form>
  );
}
