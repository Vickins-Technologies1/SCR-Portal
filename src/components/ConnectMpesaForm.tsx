// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

type PaymentType = "till" | "paybill";

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>("paybill");
  const [paybillNumber, setPaybillNumber] = useState("");
  const [paybillAccountNumber, setPaybillAccountNumber] = useState("");
  const [tillNumber, setTillNumber] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const handlePaymentTypeChange = (nextType: PaymentType) => {
    setPaymentType(nextType);
    setConnected(null);

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
          setConnected(!!data.connected);
          if (data.paymentType === "till" || data.paymentType === "paybill") {
            setPaymentType(data.paymentType);
          }
          if (data.paybillNumber) setPaybillNumber(data.paybillNumber);
          if (data.paybillAccountNumber) setPaybillAccountNumber(data.paybillAccountNumber);
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

    if (paymentType === "till" && !tillNumber.trim()) {
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
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <h3 className="text-sm sm:text-base font-semibold text-gray-800">
          Paybill & Till to M-Pesa Configurations
        </h3>
        <span className="text-lg text-gray-400">×</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600">Choose Payment Type</label>
          <select
            value={paymentType}
            onChange={(e) => handlePaymentTypeChange(e.target.value as PaymentType)}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            <option value="till">Buy Goods Till Number</option>
            <option value="paybill">Paybill Number</option>
          </select>
        </div>

        {paymentType === "till" && (
          <div>
            <label className="text-xs font-medium text-gray-600">Till Number</label>
            <input
              type="text"
              inputMode="numeric"
              value={tillNumber}
              onChange={(e) => setTillNumber(e.target.value)}
              disabled={disabled}
              className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="Enter Till Number"
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
                inputMode="numeric"
                value={paybillAccountNumber}
                onChange={(e) => setPaybillAccountNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
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
            className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
          >
            <option value="yes">Yes (Paybill & Till to M-Pesa)</option>
            <option value="no">No</option>
          </select>
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
