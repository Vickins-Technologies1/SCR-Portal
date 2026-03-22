// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

const OTHER_BANK_VALUE = "__other__";
const DARAJA_BANKS = [
  "KCB",
  "Comm. Bank of Africa",
  "Co-operative Bank",
  "Standard Chartered Bank",
  "Barclays Bank K LTD",
  "NIC Bank Limited",
  "Family Bank Ltd",
  "CFC Stanbic",
  "Equity Bank",
  "National Bank",
  "Chase Bank",
  "I & M Bank Limited",
  "Diamond Trust Bank (DTB)",
  "Ecobank",
  "Jamii Bora Bank",
  "IMPERIAL BANK LTD",
  "ABC Bank",
  "Credit Bank",
  "Consolidated Bank LTD",
  "Equatorial Commercial Bank",
  "K-REP BANK",
  "Transnational Bank",
  "Post Office Savings Bank",
  "Gulf African Bank",
  "Housing Finance Company Ltd",
  "Bank of Africa (BOA)",
  "UBA Bank",
  "Guardian Bank",
  "Prime Bank",
  "Guaranty Trust Bank",
  "KWFT DTM",
  "SMEP DTM",
  "Musoni",
  "Vision Fund Kenya",
  "Rafiki DTM",
];

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [accountType, setAccountType] = useState<"till" | "bank">("till");
  const [tillNumber, setTillNumber] = useState("");
  const [bankSelection, setBankSelection] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
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
          if (data.accountType === "bank" || data.accountType === "till") {
            setAccountType(data.accountType);
          }
          if (data.bankName) {
            if (DARAJA_BANKS.includes(data.bankName)) {
              setBankSelection(data.bankName);
              setCustomBankName("");
            } else {
              setBankSelection(OTHER_BANK_VALUE);
              setCustomBankName(data.bankName);
            }
          }
          if (data.accountNumber) setAccountNumber(data.accountNumber);
          if (data.tillNumber) setTillNumber(data.tillNumber);
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

    if (accountType === "bank") {
      const resolvedBankName = bankSelection === OTHER_BANK_VALUE ? customBankName.trim() : bankSelection;
      if (!resolvedBankName) {
        toast.error("Please select your bank.");
        return;
      }
      if (!accountNumber.trim()) {
        toast.error("Please enter your bank account number.");
        return;
      }
    } else if (!tillNumber.trim()) {
      toast.error("Please enter your till number.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token");
      return;
    }

    const resolvedBankName = bankSelection === OTHER_BANK_VALUE ? customBankName.trim() : bankSelection;

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
          accountType,
          bankName: accountType === "bank" ? resolvedBankName : "",
          accountNumber: accountType === "bank" ? accountNumber.trim() : "",
          tillNumber: accountType === "till" ? tillNumber.trim() : "",
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
    <form onSubmit={handleSubmit} className="space-y-3">
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
          <label className="text-xs font-medium text-gray-600">Collection Type</label>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                if (disabled) return;
                setAccountType("till");
                setBankSelection("");
                setCustomBankName("");
                setAccountNumber("");
              }}
              className={`px-3 py-2 rounded-xl border transition-colors ${
                accountType === "till"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 text-gray-600 hover:border-primary/60"
              }`}
            >
              Till Number (Buy Goods)
            </button>
            <button
              type="button"
              onClick={() => {
                if (disabled) return;
                setAccountType("bank");
              }}
              className={`px-3 py-2 rounded-xl border transition-colors ${
                accountType === "bank"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 text-gray-600 hover:border-primary/60"
              }`}
            >
              Bank Account (Paybill)
            </button>
          </div>
        </div>

        {accountType === "bank" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600">Supported Banks (Daraja)</label>
              <select
                value={bankSelection}
                onChange={(e) => setBankSelection(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              >
                <option value="">Select bank</option>
                {DARAJA_BANKS.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
                <option value={OTHER_BANK_VALUE}>Other (not listed)</option>
              </select>
              <p className="mt-2 text-[11px] text-gray-500">
                Bank options follow Safaricom&apos;s mobile banking paybill list. If your bank is missing, choose
                "Other".
              </p>
            </div>

            {bankSelection === OTHER_BANK_VALUE && (
              <div>
                <label className="text-xs font-medium text-gray-600">Bank Name</label>
                <input
                  type="text"
                  value={customBankName}
                  onChange={(e) => setCustomBankName(e.target.value)}
                  disabled={disabled}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your bank name"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600">Bank Account Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={disabled}
                className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="Enter account number"
              />
            </div>
          </>
        )}

        {accountType === "till" && (
          <div>
            <label className="text-xs font-medium text-gray-600">Till Number</label>
            <input
              type="text"
              value={tillNumber}
              onChange={(e) => setTillNumber(e.target.value)}
              disabled={disabled}
              className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="e.g. 123456"
            />
          </div>
        )}
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
