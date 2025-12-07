// src/app/property-owner-dashboard/components/RecordPaymentModal.tsx
import React from "react";
import Modal from "../components/Modal";
import { DollarSign } from "lucide-react";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: any;
  paymentData: {
    amount: string;
    type: "Rent" | "Utility" | "Deposit" | "Other";
    reference: string;
    paymentDate: string;
  };
  setPaymentData: React.Dispatch<
    React.SetStateAction<{
      amount: string;
      type: "Rent" | "Utility" | "Deposit" | "Other";
      reference: string;
      paymentDate: string;
    }>
  >;
  paymentErrors: { [key: string]: string };
  setPaymentErrors: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isLoading: boolean;
}

export default function RecordPaymentModal({
  isOpen,
  onClose,
  tenant,
  paymentData,
  setPaymentData,
  paymentErrors,
  setPaymentErrors,
  onSubmit,
  isLoading,
}: RecordPaymentModalProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentErrors({});
    await onSubmit(e);
  };

  const suggestedAmount = () => {
    if (!tenant?.dues) return null;
    const dues = tenant.dues;
    if (paymentData.type === "Rent") return dues.rentDues;
    if (paymentData.type === "Utility") return dues.utilityDues;
    if (paymentData.type === "Deposit") return dues.depositDues;
    return dues.totalRemainingDues;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Tenant Payment">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-5">
          <p className="text-sm text-emerald-700 font-medium">
            Tenant: <span className="font-bold">{tenant?.name || "N/A"}</span>
          </p>
          {tenant?.unit && (
            <p className="text-xs text-emerald-600 mt-1">
              Unit: {tenant.unit.type} @ {tenant.property?.name}
            </p>
          )}
          {tenant?.dues && (
            <p className="text-xs text-emerald-600 mt-1">
              Total Outstanding: Ksh {tenant.dues.totalRemainingDues.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Amount (Ksh)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={paymentData.amount}
              onChange={(e) =>
                setPaymentData({ ...paymentData, amount: e.target.value })
              }
              className="w-full px-4 py-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="0.00"
              required
            />
            <span className="absolute left-3 top-3.5 text-slate-500">Ksh</span>
          </div>
          {paymentErrors.amount && (
            <p className="mt-2 text-sm text-red-600">{paymentErrors.amount}</p>
          )}
          {tenant?.dues && paymentData.type !== "Other" && (
            <p className="mt-2 text-sm text-emerald-600">
              Suggested: Ksh {suggestedAmount()?.toFixed(2) || "0.00"}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Payment Type
          </label>
          <select
            value={paymentData.type}
            onChange={(e) =>
              setPaymentData({
                ...paymentData,
                type: e.target.value as any,
              })
            }
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="Rent">Rent</option>
            <option value="Utility">Utility / Water / Electricity</option>
            <option value="Deposit">Security Deposit</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Reference (e.g. M-Pesa Code)
          </label>
          <input
            type="text"
            value={paymentData.reference}
            onChange={(e) =>
              setPaymentData({ ...paymentData, reference: e.target.value })
            }
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
            placeholder="e.g. R45XYZ1234"
            required
          />
          {paymentErrors.reference && (
            <p className="mt-2 text-sm text-red-600">{paymentErrors.reference}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Payment Date
          </label>
          <input
            type="date"
            value={paymentData.paymentDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) =>
              setPaymentData({ ...paymentData, paymentDate: e.target.value })
            }
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
            required
          />
        </div>

        {paymentErrors.general && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {paymentErrors.general}
          </div>
        )}

        <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-slate-200 text-slate-800 rounded-xl hover:bg-slate-300 transition font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-10 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition font-semibold shadow-lg disabled:opacity-60 flex items-center gap-3"
          >
            <DollarSign className="h-5 w-5" />
            {isLoading ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}